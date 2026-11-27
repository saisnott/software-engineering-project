from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from .models import (
    Book,
    BookCopy,
    Borrowing,
    FinancialSettings,
    Notification,
    Wallet,
    WalletTransaction,
)

User = get_user_model()
ZERO = Decimal('0.00')
HUNDRED = Decimal('100.00')


class WalletOperationError(Exception):
    def __init__(self, message, extra=None):
        super().__init__(message)
        self.message = message
        self.extra = extra or {}


def quantize_money(value):
    return Decimal(value).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def parse_strict_decimal(raw_value, min_val=Decimal('0.01'), max_val=None):
    if isinstance(raw_value, bool) or raw_value is None:
        return None
    text = str(raw_value).strip()
    if not text:
        return None
    try:
        dec = Decimal(text)
    except (InvalidOperation, ValueError, TypeError):
        return None
    if not dec.is_finite():
        return None
    if dec.as_tuple().exponent < -2:
        return None
    dec = quantize_money(dec)
    if min_val is not None and dec < min_val:
        return None
    if max_val is not None and dec > max_val:
        return None
    return dec


def generate_reference_code(prefix='TX'):
    prefix_dash = f'{prefix}-'
    existing_codes = WalletTransaction.objects.filter(
        reference_code__startswith=prefix_dash
    ).values_list('reference_code', flat=True)
    max_num = 0
    for code in existing_codes:
        suffix = code[len(prefix_dash):]
        if suffix.isdigit():
            val = int(suffix)
            if val > max_num:
                max_num = val
    return f'{prefix}-{max_num + 1:04d}'


def get_financial_settings():
    return FinancialSettings.get_solo()


def ensure_user_wallet(user):
    wallet, created = Wallet.objects.get_or_create(user=user)
    if created:
        fin_settings = get_financial_settings()
        bonus = quantize_money(fin_settings.signup_bonus)
        if bonus > ZERO:
            with transaction.atomic():
                locked_w = Wallet.objects.select_for_update().get(pk=wallet.pk)
                if not locked_w.transactions.exists() and locked_w.balance == ZERO:
                    locked_w.balance = bonus
                    locked_w.save(update_fields=['balance', 'updated_at'])
                    WalletTransaction.objects.create(
                        wallet=locked_w,
                        reference_code=generate_reference_code('BON'),
                        tx_type='signup_bonus',
                        direction='credit',
                        amount=bonus,
                        platform_commission=ZERO,
                        balance_before=ZERO,
                        balance_after=bonus,
                        description=f'اعتبار هدیه خوش‌آمدگویی عضویت در کتاب‌سرا (${bonus:.2f})',
                        created_by=user,
                    )
                    wallet = locked_w
    return wallet


def lock_wallets_by_user_ids(*user_ids):
    clean_ids = sorted({uid for uid in user_ids if uid is not None})
    for uid in clean_ids:
        user_obj = User.objects.filter(id=uid).first()
        if user_obj:
            ensure_user_wallet(user_obj)
    locked = list(
        Wallet.objects.select_for_update()
        .filter(user_id__in=clean_ids)
        .order_by('user_id')
    )
    return {w.user_id: w for w in locked}


def get_user_unpaid_fines_total(user):
    total = (
        Borrowing.objects.filter(user=user, unpaid_fine__gt=ZERO)
        .aggregate(total=Sum('unpaid_fine'))
        .get('total')
    )
    return quantize_money(total or ZERO)


def calculate_book_fees(book, fin_settings=None):
    fin = fin_settings or get_financial_settings()
    price = quantize_money(book.price or ZERO)
    borrow_fee = quantize_money((price * fin.borrow_fee_percent) / HUNDRED) if price > ZERO else ZERO
    deposit_amount = quantize_money((price * fin.deposit_percent) / HUNDRED) if price > ZERO else ZERO
    total_borrow_required = quantize_money(borrow_fee + deposit_amount)
    extend_fee = quantize_money(fin.extend_fee_amount) if price > ZERO else ZERO
    daily_late_fee = quantize_money(fin.daily_late_fee)
    owner_share_percent = quantize_money(fin.owner_share_percent)
    return {
        'book_price': price,
        'borrow_fee': borrow_fee,
        'deposit_amount': deposit_amount,
        'total_borrow_required': total_borrow_required,
        'extend_fee': extend_fee,
        'daily_late_fee': daily_late_fee,
        'owner_share_percent': owner_share_percent,
        'platform_share_percent': quantize_money(HUNDRED - owner_share_percent),
    }


def compute_revenue_split(amount, book, payer, fin_settings=None):
    fin = fin_settings or get_financial_settings()
    total = quantize_money(amount)
    if total <= ZERO:
        return ZERO, ZERO, None
    if book and book.user_id and book.user_id != payer.id:
        owner_share = quantize_money((total * fin.owner_share_percent) / HUNDRED)
        platform_commission = quantize_money(total - owner_share)
        return owner_share, platform_commission, book.user
    return ZERO, total, None


def _ensure_wallet_usable(wallet, user):
    if wallet.is_frozen:
        raise WalletOperationError(
            'کیف‌پول شما توسط مدیریت مسدود شده است و امکان انجام تراکنش مالی وجود ندارد.'
        )
    unpaid = get_user_unpaid_fines_total(user)
    if unpaid > ZERO:
        raise WalletOperationError(
            f'شما مبلغ ${unpaid:.2f} جریمه دیرکرد تسویه‌نشده دارید. لطفاً ابتدا از صفحه کیف‌پول جریمه خود را تسویه کنید.',
            extra={'unpaid_fines': f'{unpaid:.2f}'}
        )


def _credit_owner_share(owner_wallet, owner_user, owner_share, description, book=None, borrowing=None, actor=None):
    if not owner_wallet or not owner_user or owner_share <= ZERO:
        return None
    before = owner_wallet.balance
    owner_wallet.balance = quantize_money(before + owner_share)
    owner_wallet.save(update_fields=['balance', 'updated_at'])
    tx = WalletTransaction.objects.create(
        wallet=owner_wallet,
        reference_code=generate_reference_code('ERN'),
        tx_type='owner_earning',
        direction='credit',
        amount=owner_share,
        platform_commission=ZERO,
        balance_before=before,
        balance_after=owner_wallet.balance,
        description=description,
        related_book=book,
        book_title_snapshot=book.title if book else '',
        related_borrowing=borrowing,
        created_by=actor,
    )
    Notification.objects.create(
        user=owner_user,
        title='واریز درآمد جدید به کیف‌پول شما',
        message=f'{description} — مبلغ ${owner_share:.2f} به کیف‌پول شما واریز شد.',
        notif_type='wallet',
        link='/wallet',
    )
    return tx


def topup_wallet(user, raw_amount, actor=None):
    fin = get_financial_settings()
    amount = parse_strict_decimal(raw_amount, min_val=Decimal('1.00'), max_val=fin.max_topup_amount)
    if amount is None:
        raise WalletOperationError(
            f'مبلغ شارژ باید عددی معتبر بین $1.00 تا ${fin.max_topup_amount:.2f} (حداکثر ۲ رقم اعشار) باشد.'
        )

    with transaction.atomic():
        wallets = lock_wallets_by_user_ids(user.id)
        wallet = wallets[user.id]
        if wallet.is_frozen:
            raise WalletOperationError('کیف‌پول شما مسدود است و در حال حاضر امکان شارژ آن وجود ندارد.')

        before = wallet.balance
        wallet.balance = quantize_money(before + amount)
        wallet.save(update_fields=['balance', 'updated_at'])

        tx = WalletTransaction.objects.create(
            wallet=wallet,
            reference_code=generate_reference_code('TOP'),
            tx_type='topup',
            direction='credit',
            amount=amount,
            platform_commission=ZERO,
            balance_before=before,
            balance_after=wallet.balance,
            description=f'شارژ شبیه‌سازی‌شده کیف‌پول به مبلغ ${amount:.2f}',
            created_by=actor or user,
        )

        Notification.objects.create(
            user=user,
            title='شارژ موفق کیف‌پول',
            message=f'کیف‌پول شما به مبلغ ${amount:.2f} شارژ شد. موجودی فعلی: ${wallet.balance:.2f} (کد پیگیری: {tx.reference_code}).',
            notif_type='wallet',
            link='/wallet',
        )
        return wallet, tx


def adjust_wallet_by_admin(target_user, action, raw_amount, reason, admin_user):
    clean_action = str(action or '').strip().lower()
    clean_reason = str(reason or '').strip()

    with transaction.atomic():
        wallets = lock_wallets_by_user_ids(target_user.id)
        wallet = wallets[target_user.id]

        if clean_action == 'toggle_freeze':
            wallet.is_frozen = not wallet.is_frozen
            wallet.save(update_fields=['is_frozen', 'updated_at'])
            status_label = 'مسدود' if wallet.is_frozen else 'فعال'
            Notification.objects.create(
                user=target_user,
                title=f'تغییر وضعیت کیف‌پول به «{status_label}»',
                message=(
                    f'کیف‌پول شما توسط مدیر ارشد (@{admin_user.username}) به وضعیت «{status_label}» تغییر یافت.'
                    + (f' توضیح: {clean_reason}' if clean_reason else '')
                ),
                notif_type='wallet',
                link='/wallet',
            )
            return wallet, None

        if clean_action not in ('credit', 'debit'):
            raise WalletOperationError('عملیات نامعتبر است. مقادیر مجاز: credit، debit یا toggle_freeze.')

        amount = parse_strict_decimal(raw_amount, min_val=Decimal('0.01'), max_val=Decimal('100000.00'))
        if amount is None:
            raise WalletOperationError('لطفاً مبلغ معتبر (بزرگ‌تر از صفر با حداکثر ۲ رقم اعشار) وارد کنید.')

        if not clean_reason:
            raise WalletOperationError('ثبت توضیح/علت برای تعدیل دستی موجودی الزامی است.')

        before = wallet.balance
        if clean_action == 'credit':
            wallet.balance = quantize_money(before + amount)
            wallet.save(update_fields=['balance', 'updated_at'])
            tx = WalletTransaction.objects.create(
                wallet=wallet,
                reference_code=generate_reference_code('ADM'),
                tx_type='admin_credit',
                direction='credit',
                amount=amount,
                platform_commission=ZERO,
                balance_before=before,
                balance_after=wallet.balance,
                description=f'افزایش دستی موجودی توسط مدیر (@{admin_user.username}): {clean_reason}',
                created_by=admin_user,
            )
            Notification.objects.create(
                user=target_user,
                title='افزایش موجودی کیف‌پول توسط مدیریت',
                message=f'مبلغ ${amount:.2f} توسط مدیر ارشد به کیف‌پول شما اضافه شد. علت: {clean_reason}',
                notif_type='wallet',
                link='/wallet',
            )
            return wallet, tx

        # debit
        if wallet.balance < amount:
            raise WalletOperationError(
                f'موجودی قابل استفاده کاربر (${wallet.balance:.2f}) برای کسر مبلغ ${amount:.2f} کافی نیست.'
            )
        wallet.balance = quantize_money(before - amount)
        wallet.save(update_fields=['balance', 'updated_at'])
        tx = WalletTransaction.objects.create(
            wallet=wallet,
            reference_code=generate_reference_code('ADM'),
            tx_type='admin_debit',
            direction='debit',
            amount=amount,
            platform_commission=ZERO,
            balance_before=before,
            balance_after=wallet.balance,
            description=f'کسر دستی موجودی توسط مدیر (@{admin_user.username}): {clean_reason}',
            created_by=admin_user,
        )
        Notification.objects.create(
            user=target_user,
            title='کسر موجودی کیف‌پول توسط مدیریت',
            message=f'مبلغ ${amount:.2f} توسط مدیر ارشد از کیف‌پول شما کسر شد. علت: {clean_reason}',
            notif_type='wallet',
            link='/wallet',
        )
        return wallet, tx


def charge_borrow_and_lock_deposit(borrower, book, borrowing, waive_fee=False, actor=None):
    if waive_fee:
        return {
            'borrow_fee': ZERO,
            'deposit_locked': ZERO,
            'owner_share': ZERO,
            'platform_commission': ZERO,
        }

    fin = get_financial_settings()
    fees = calculate_book_fees(book, fin)
    borrow_fee = fees['borrow_fee']
    deposit_amount = fees['deposit_amount']
    total_required = fees['total_borrow_required']

    owner_share, platform_commission, owner = compute_revenue_split(borrow_fee, book, borrower, fin)

    wallets = lock_wallets_by_user_ids(borrower.id, owner.id if owner else None)
    borrower_wallet = wallets[borrower.id]
    owner_wallet = wallets.get(owner.id) if owner else None

    _ensure_wallet_usable(borrower_wallet, borrower)

    if borrower_wallet.balance < total_required:
        shortfall = quantize_money(total_required - borrower_wallet.balance)
        raise WalletOperationError(
            (
                f'موجودی کیف‌پول شما (${borrower_wallet.balance:.2f}) برای امانت کتاب «{book.title}» کافی نیست. '
                f'مبلغ مورد نیاز: ${total_required:.2f} (هزینه امانت: ${borrow_fee:.2f} + ودیعه قابل برگشت: ${deposit_amount:.2f}). '
                f'کمبود موجودی: ${shortfall:.2f}.'
            ),
            extra={
                'required_amount': f'{total_required:.2f}',
                'borrow_fee': f'{borrow_fee:.2f}',
                'deposit_amount': f'{deposit_amount:.2f}',
                'current_balance': f'{borrower_wallet.balance:.2f}',
                'shortfall': f'{shortfall:.2f}',
            }
        )

    if borrow_fee > ZERO:
        before = borrower_wallet.balance
        borrower_wallet.balance = quantize_money(before - borrow_fee)
        borrower_wallet.save(update_fields=['balance', 'updated_at'])
        WalletTransaction.objects.create(
            wallet=borrower_wallet,
            reference_code=generate_reference_code('BRW'),
            tx_type='borrow_fee',
            direction='debit',
            amount=borrow_fee,
            platform_commission=platform_commission,
            balance_before=before,
            balance_after=borrower_wallet.balance,
            description=f'هزینه امانت کتاب «{book.title}»',
            related_book=book,
            book_title_snapshot=book.title,
            related_borrowing=borrowing,
            created_by=actor or borrower,
        )
        if owner and owner_share > ZERO:
            _credit_owner_share(
                owner_wallet=owner_wallet,
                owner_user=owner,
                owner_share=owner_share,
                description=f'سهم {fin.owner_share_percent:.0f}% از هزینه امانت کتاب «{book.title}» توسط @{borrower.username}',
                book=book,
                borrowing=borrowing,
                actor=actor or borrower,
            )

    if deposit_amount > ZERO:
        before = borrower_wallet.balance
        borrower_wallet.balance = quantize_money(before - deposit_amount)
        borrower_wallet.locked_balance = quantize_money(borrower_wallet.locked_balance + deposit_amount)
        borrower_wallet.save(update_fields=['balance', 'locked_balance', 'updated_at'])
        WalletTransaction.objects.create(
            wallet=borrower_wallet,
            reference_code=generate_reference_code('DEP'),
            tx_type='deposit_lock',
            direction='lock',
            amount=deposit_amount,
            platform_commission=ZERO,
            balance_before=before,
            balance_after=borrower_wallet.balance,
            description=f'مسدودسازی ودیعه امانت کتاب «{book.title}» (قابل برگشت پس از تحویل به موقع)',
            related_book=book,
            book_title_snapshot=book.title,
            related_borrowing=borrowing,
            created_by=actor or borrower,
        )

    borrowing.borrow_fee_paid = borrow_fee
    borrowing.deposit_locked = deposit_amount
    borrowing.save(update_fields=['borrow_fee_paid', 'deposit_locked'])

    return {
        'borrow_fee': borrow_fee,
        'deposit_locked': deposit_amount,
        'owner_share': owner_share,
        'platform_commission': platform_commission,
    }


def charge_extension_fee(borrower, borrowing):
    book = borrowing.book
    fin = get_financial_settings()
    extend_fee = quantize_money(fin.extend_fee_amount) if (book.price or ZERO) > ZERO else ZERO
    if extend_fee <= ZERO:
        return ZERO

    owner_share, platform_commission, owner = compute_revenue_split(extend_fee, book, borrower, fin)
    wallets = lock_wallets_by_user_ids(borrower.id, owner.id if owner else None)
    borrower_wallet = wallets[borrower.id]
    owner_wallet = wallets.get(owner.id) if owner else None

    _ensure_wallet_usable(borrower_wallet, borrower)

    if borrower_wallet.balance < extend_fee:
        shortfall = quantize_money(extend_fee - borrower_wallet.balance)
        raise WalletOperationError(
            f'موجودی کیف‌پول شما (${borrower_wallet.balance:.2f}) برای تمدید امانت (${extend_fee:.2f}) کافی نیست. کمبود: ${shortfall:.2f}.',
            extra={
                'required_amount': f'{extend_fee:.2f}',
                'current_balance': f'{borrower_wallet.balance:.2f}',
                'shortfall': f'{shortfall:.2f}',
            }
        )

    before = borrower_wallet.balance
    borrower_wallet.balance = quantize_money(before - extend_fee)
    borrower_wallet.save(update_fields=['balance', 'updated_at'])

    WalletTransaction.objects.create(
        wallet=borrower_wallet,
        reference_code=generate_reference_code('EXT'),
        tx_type='extend_fee',
        direction='debit',
        amount=extend_fee,
        platform_commission=platform_commission,
        balance_before=before,
        balance_after=borrower_wallet.balance,
        description=f'هزینه تمدید ۷ روزه امانت کتاب «{book.title}»',
        related_book=book,
        book_title_snapshot=book.title,
        related_borrowing=borrowing,
        created_by=borrower,
    )

    if owner and owner_share > ZERO:
        _credit_owner_share(
            owner_wallet=owner_wallet,
            owner_user=owner,
            owner_share=owner_share,
            description=f'سهم {fin.owner_share_percent:.0f}% از تمدید امانت کتاب «{book.title}» توسط @{borrower.username}',
            book=book,
            borrowing=borrowing,
            actor=borrower,
        )

    borrowing.extend_fee_paid = quantize_money(borrowing.extend_fee_paid + extend_fee)
    borrowing.save(update_fields=['extend_fee_paid'])
    return extend_fee


def settle_return_deposit_and_fines(borrowing, return_dt, actor):
    book = borrowing.book
    borrower = borrowing.user
    fin = get_financial_settings()

    late_days = 0
    if borrowing.due_date and return_dt > borrowing.due_date:
        late_days = max(1, (return_dt - borrowing.due_date).days)

    late_fee = quantize_money(Decimal(late_days) * fin.daily_late_fee) if late_days > 0 else ZERO
    deposit_locked = quantize_money(borrowing.deposit_locked or ZERO)

    if late_fee == ZERO and (deposit_locked == ZERO or borrowing.is_deposit_released):
        return {
            'late_days': late_days,
            'late_fee': ZERO,
            'deposit_released': ZERO,
            'collected_fine': ZERO,
            'unpaid_fine': ZERO,
        }

    owner_id = book.user_id if (book and book.user_id and book.user_id != borrower.id) else None
    wallets = lock_wallets_by_user_ids(borrower.id, owner_id)
    borrower_wallet = wallets[borrower.id]
    owner_wallet = wallets.get(owner_id) if owner_id else None

    deducted_from_deposit = ZERO
    deposit_released = ZERO

    if deposit_locked > ZERO and not borrowing.is_deposit_released:
        deducted_from_deposit = min(late_fee, deposit_locked)
        deposit_released = quantize_money(deposit_locked - deducted_from_deposit)

        borrower_wallet.locked_balance = max(ZERO, quantize_money(borrower_wallet.locked_balance - deposit_locked))
        before_release = borrower_wallet.balance
        if deposit_released > ZERO:
            borrower_wallet.balance = quantize_money(before_release + deposit_released)
        borrower_wallet.save(update_fields=['balance', 'locked_balance', 'updated_at'])

        if deposit_released > ZERO:
            WalletTransaction.objects.create(
                wallet=borrower_wallet,
                reference_code=generate_reference_code('REL'),
                tx_type='deposit_release',
                direction='unlock',
                amount=deposit_released,
                platform_commission=ZERO,
                balance_before=before_release,
                balance_after=borrower_wallet.balance,
                description=f'آزادسازی ودیعه امانت کتاب «{book.title}» پس از تحویل',
                related_book=book,
                book_title_snapshot=book.title,
                related_borrowing=borrowing,
                created_by=actor,
            )

        borrowing.is_deposit_released = True

    remaining_fine = quantize_money(late_fee - deducted_from_deposit)
    deducted_from_balance = ZERO
    if remaining_fine > ZERO and borrower_wallet.balance > ZERO:
        deducted_from_balance = min(remaining_fine, borrower_wallet.balance)
        before_fine = borrower_wallet.balance
        borrower_wallet.balance = quantize_money(before_fine - deducted_from_balance)
        borrower_wallet.save(update_fields=['balance', 'updated_at'])
    else:
        before_fine = borrower_wallet.balance

    unpaid_fine = quantize_money(remaining_fine - deducted_from_balance)
    collected_fine = quantize_money(deducted_from_deposit + deducted_from_balance)

    if collected_fine > ZERO:
        owner_share, platform_commission, owner = compute_revenue_split(collected_fine, book, borrower, fin)
        WalletTransaction.objects.create(
            wallet=borrower_wallet,
            reference_code=generate_reference_code('FIN'),
            tx_type='late_fee',
            direction='debit',
            amount=collected_fine,
            platform_commission=platform_commission,
            balance_before=before_fine,
            balance_after=borrower_wallet.balance,
            description=(
                f'جریمه {late_days} روز تأخیر در تحویل کتاب «{book.title}» '
                f'(کسر از ودیعه: ${deducted_from_deposit:.2f}، کسر از موجودی: ${deducted_from_balance:.2f})'
            ),
            related_book=book,
            book_title_snapshot=book.title,
            related_borrowing=borrowing,
            created_by=actor,
        )
        if owner and owner_share > ZERO:
            _credit_owner_share(
                owner_wallet=owner_wallet,
                owner_user=owner,
                owner_share=owner_share,
                description=f'سهم {fin.owner_share_percent:.0f}% از جریمه تأخیر کتاب «{book.title}» (@{borrower.username})',
                book=book,
                borrowing=borrowing,
                actor=actor,
            )

    borrowing.late_fee_charged = late_fee
    borrowing.unpaid_fine = unpaid_fine
    borrowing.save(update_fields=['late_fee_charged', 'unpaid_fine', 'is_deposit_released'])

    return {
        'late_days': late_days,
        'late_fee': late_fee,
        'deposit_released': deposit_released,
        'collected_fine': collected_fine,
        'unpaid_fine': unpaid_fine,
    }


def settle_all_unpaid_fines(user):
    fin = get_financial_settings()
    with transaction.atomic():
        borrowings_with_fines = list(
            Borrowing.objects.select_for_update()
            .select_related('book', 'book__user')
            .filter(user=user, unpaid_fine__gt=ZERO)
            .order_by('id')
        )
        if not borrowings_with_fines:
            raise WalletOperationError('شما هیچ جریمه تسویه‌نشده‌ای ندارید.')

        total_due = quantize_money(sum((b.unpaid_fine for b in borrowings_with_fines), ZERO))
        owner_ids = [
            b.book.user_id
            for b in borrowings_with_fines
            if b.book and b.book.user_id and b.book.user_id != user.id
        ]
        wallets = lock_wallets_by_user_ids(user.id, *owner_ids)
        user_wallet = wallets[user.id]

        if user_wallet.is_frozen:
            raise WalletOperationError('کیف‌پول شما مسدود است و امکان تسویه جریمه وجود ندارد.')

        if user_wallet.balance < total_due:
            shortfall = quantize_money(total_due - user_wallet.balance)
            raise WalletOperationError(
                f'موجودی کیف‌پول شما (${user_wallet.balance:.2f}) برای تسویه کل جریمه‌ها (${total_due:.2f}) کافی نیست. کمبود: ${shortfall:.2f}.',
                extra={
                    'required_amount': f'{total_due:.2f}',
                    'current_balance': f'{user_wallet.balance:.2f}',
                    'shortfall': f'{shortfall:.2f}',
                }
            )

        for b in borrowings_with_fines:
            amt = quantize_money(b.unpaid_fine)
            owner_share, platform_commission, owner = compute_revenue_split(amt, b.book, user, fin)
            before = user_wallet.balance
            user_wallet.balance = quantize_money(before - amt)
            user_wallet.save(update_fields=['balance', 'updated_at'])

            WalletTransaction.objects.create(
                wallet=user_wallet,
                reference_code=generate_reference_code('STL'),
                tx_type='fine_settlement',
                direction='debit',
                amount=amt,
                platform_commission=platform_commission,
                balance_before=before,
                balance_after=user_wallet.balance,
                description=f'تسویه جریمه معوقه کتاب «{b.book.title}»',
                related_book=b.book,
                book_title_snapshot=b.book.title,
                related_borrowing=b,
                created_by=user,
            )

            if owner and owner_share > ZERO:
                _credit_owner_share(
                    owner_wallet=wallets.get(owner.id),
                    owner_user=owner,
                    owner_share=owner_share,
                    description=f'سهم {fin.owner_share_percent:.0f}% از تسویه جریمه تأخیر کتاب «{b.book.title}» (@{user.username})',
                    book=b.book,
                    borrowing=b,
                    actor=user,
                )

            b.unpaid_fine = ZERO
            b.save(update_fields=['unpaid_fine'])

        Notification.objects.create(
            user=user,
            title='تسویه کامل جریمه‌های معوقه',
            message=f'مبلغ ${total_due:.2f} بابت تسویه کامل جریمه‌های دیرکرد از کیف‌پول شما پرداخت شد.',
            notif_type='wallet',
            link='/wallet',
        )
        return user_wallet, total_due
