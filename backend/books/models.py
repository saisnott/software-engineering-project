from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import models
from django.urls import reverse
from django.utils import timezone


def default_due_date():
    return timezone.now() + timedelta(days=14)





# کلاس Category شما بدون تغییر می‌ماند
class Category(models.Model):
    name = models.CharField(max_length=100, verbose_name="نام دسته‌بندی")
    slug = models.SlugField(max_length=100, unique=True, allow_unicode=True, verbose_name="اسلاگ (نشانی وب)")

    class Meta:
        verbose_name = "دسته‌بندی"
        verbose_name_plural = "دسته‌بندی‌ها"

    def __str__(self):
        return self.name


# ۲. کلاس Book را به این شکل تغییر بده
class Book(models.Model):
    APPROVAL_STATUS_CHOICES = [
        ('pending', 'در انتظار تأیید'),
        ('approved', 'تأیید شده'),
        ('rejected', 'رد شده'),
    ]

    # رابطه را به تنظیمات جنگو متصل می‌کنیم تا خودش مدل کاربر درست را پیدا کند
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    title = models.CharField(max_length=200)
    author = models.CharField(max_length=200)
    description = models.TextField()
    price = models.DecimalField(max_digits=10, decimal_places=2)
    covers = models.ImageField(upload_to='covers/', blank=True)
    is_available = models.BooleanField(default=True)
    approval_status = models.CharField(
        max_length=20,
        choices=APPROVAL_STATUS_CHOICES,
        default='approved',
        verbose_name="وضعیت تأیید"
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reviewed_books',
        verbose_name="بررسی‌شده توسط"
    )
    reviewed_at = models.DateTimeField(null=True, blank=True, verbose_name="تاریخ بررسی")
    rejection_reason = models.TextField(blank=True, default='', verbose_name="دلیل رد شدن")
    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)

    category = models.ForeignKey(
        Category,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='books',
        verbose_name="دسته‌بندی"
    )
    # این فیلد را داخل کلاس مدل Book اضافه کن:
    wishlist = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name='wishlist_books'
    )
    waitlist = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name='waitlist_books'
    )

    def __str__(self):
        return self.title

    def get_absolute_url(self):
        return reverse('books:book_detail', args=[self.id])

    def save(self, *args, **kwargs):
        is_new = self._state.adding
        super().save(*args, **kwargs)
        if is_new and not self.copies.exists():
            BookCopy.objects.create(book=self, is_available=self.is_available)

    def sync_availability(self):
        has_available = self.copies.filter(is_available=True).exists()
        if self.is_available != has_available:
            self.is_available = has_available
            super().save(update_fields=['is_available'])
        return has_available


class BookCopy(models.Model):
    book = models.ForeignKey(Book, on_delete=models.CASCADE, related_name='copies')
    is_available = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['id']
        verbose_name = "جلد کتاب"
        verbose_name_plural = "جلدهای کتاب"

    def __str__(self):
        return f"{self.book.title} (ID: #{self.id})"


class Comment(models.Model):
    text = models.TextField()
    datetime_created = models.DateTimeField(auto_now_add=True)
    user = models.ForeignKey(get_user_model(), on_delete=models.CASCADE)
    book = models.ForeignKey(Book, on_delete=models.CASCADE, related_name='comments')
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f'{self.user}: {self.text}'


# مدل جدید امانت‌دهی
class Borrowing(models.Model):
    STATUS_CHOICES = [
        ('borrowed', 'امانت داده شده'),
        ('returned', 'بازگردانده شده'),
        ('overdue', 'دارای تاخیر'),
    ]

    user = models.ForeignKey(get_user_model(), on_delete=models.CASCADE, related_name='borrowings')
    book = models.ForeignKey(Book, on_delete=models.CASCADE, related_name='borrowings')
    book_copy = models.ForeignKey(
        BookCopy,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='borrowings'
    )
    copy_id_snapshot = models.PositiveIntegerField(null=True, blank=True)
    borrow_date = models.DateTimeField(auto_now_add=True)
    # به طور پیش‌فرض مهلت بازگشت را ۱۴ روز بعد در نظر می‌گیریم
    due_date = models.DateTimeField(default=default_due_date)
    return_date = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='borrowed')
    is_extended = models.BooleanField(default=False)
    returned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='processed_returns'
    )
    borrow_fee_paid = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    deposit_locked = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    extend_fee_paid = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    late_fee_charged = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    unpaid_fine = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    is_deposit_released = models.BooleanField(default=False)

    def save(self, *args, **kwargs):
        if self.book_copy_id and not self.copy_id_snapshot:
            self.copy_id_snapshot = self.book_copy_id
            update_fields = kwargs.get('update_fields')
            if update_fields is not None and 'copy_id_snapshot' not in update_fields:
                kwargs['update_fields'] = list(update_fields) + ['copy_id_snapshot']
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.user.username} - {self.book.title} ({self.status})'


class Notification(models.Model):
    TYPE_CHOICES = [
        ('borrow', 'امانت کتاب'),
        ('return', 'تحویل کتاب'),
        ('waitlist', 'موجود شدن رزرو'),
        ('extend', 'تمدید امانت'),
        ('comment', 'دیدگاه جدید'),
        ('role', 'تغییر دسترسی'),
        ('reminder', 'یادآوری موعد'),
        ('approval', 'بررسی و تأیید کتاب'),
        ('wallet', 'تراکنش مالی و کیف‌پول'),
        ('info', 'اطلاعیه'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notifications'
    )
    title = models.CharField(max_length=200)
    message = models.TextField()
    notif_type = models.CharField(max_length=30, choices=TYPE_CHOICES, default='info')
    link = models.CharField(max_length=255, blank=True, default='')
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.user.username}: {self.title}'


class FinancialSettings(models.Model):
    borrow_fee_percent = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal('10.00'),
        verbose_name="درصد هزینه امانت از قیمت کتاب"
    )
    deposit_percent = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal('50.00'),
        verbose_name="درصد ودیعه مسدودشونده از قیمت کتاب"
    )
    owner_share_percent = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal('80.00'),
        verbose_name="درصد سهم ثبت‌کننده کتاب"
    )
    extend_fee_amount = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal('2.00'),
        verbose_name="هزینه ثابت تمدید ۷ روزه"
    )
    daily_late_fee = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal('1.00'),
        verbose_name="جریمه روزانه تأخیر"
    )
    signup_bonus = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal('100.00'),
        verbose_name="اعتبار هدیه اولیه ثبت‌نام"
    )
    max_topup_amount = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal('1000.00'),
        verbose_name="سقف هر بار شارژ کیف‌پول"
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "تنظیمات مالی"
        verbose_name_plural = "تنظیمات مالی"

    @classmethod
    def get_solo(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return f"تنظیمات مالی (سهم مالک: {self.owner_share_percent}%)"


class Wallet(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='wallet'
    )
    balance = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    locked_balance = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    is_frozen = models.BooleanField(default=False, verbose_name="کیف‌پول مسدود")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "کیف‌پول"
        verbose_name_plural = "کیف‌پول‌ها"

    def __str__(self):
        return f"کیف‌پول @{self.user.username} (${self.balance})"


class WalletTransaction(models.Model):
    TX_TYPE_CHOICES = [
        ('signup_bonus', 'اعتبار هدیه اولیه'),
        ('topup', 'شارژ کیف‌پول'),
        ('borrow_fee', 'هزینه امانت کتاب'),
        ('extend_fee', 'هزینه تمدید امانت'),
        ('deposit_lock', 'مسدودسازی ودیعه امانت'),
        ('deposit_release', 'آزادسازی ودیعه امانت'),
        ('late_fee', 'جریمه تأخیر در تحویل'),
        ('fine_settlement', 'تسویه جریمه معوقه'),
        ('owner_earning', 'درآمد امانت کتاب'),
        ('admin_credit', 'افزایش دستی توسط مدیر'),
        ('admin_debit', 'کسر دستی توسط مدیر'),
    ]

    DIRECTION_CHOICES = [
        ('credit', 'واریز'),
        ('debit', 'برداشت'),
        ('lock', 'بلوکه'),
        ('unlock', 'آزادسازی'),
    ]

    wallet = models.ForeignKey(Wallet, on_delete=models.CASCADE, related_name='transactions')
    reference_code = models.CharField(max_length=40, unique=True)
    tx_type = models.CharField(max_length=30, choices=TX_TYPE_CHOICES)
    direction = models.CharField(max_length=15, choices=DIRECTION_CHOICES)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    platform_commission = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    balance_before = models.DecimalField(max_digits=12, decimal_places=2)
    balance_after = models.DecimalField(max_digits=12, decimal_places=2)
    description = models.TextField()
    related_book = models.ForeignKey(
        Book, on_delete=models.SET_NULL, null=True, blank=True, related_name='wallet_transactions'
    )
    book_title_snapshot = models.CharField(max_length=255, blank=True, default='')
    related_borrowing = models.ForeignKey(
        Borrowing, on_delete=models.SET_NULL, null=True, blank=True, related_name='wallet_transactions'
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='initiated_wallet_transactions'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-id']
        verbose_name = "تراکنش کیف‌پول"
        verbose_name_plural = "تراکنش‌های کیف‌پول"

    def __str__(self):
        return f"{self.reference_code} | {self.wallet.user.username} | {self.tx_type} | ${self.amount}"
