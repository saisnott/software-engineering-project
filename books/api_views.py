import re
from datetime import timedelta
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Avg, F, Prefetch, Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    Book,
    BookCopy,
    BookOrder,
    Borrowing,
    Category,
    Comment,
    FinancialSettings,
    Notification,
    Wallet,
    WalletTransaction,
)
from .serializers import (
    BookCopySerializer,
    BookDetailSerializer,
    BookListSerializer,
    BookOrderSerializer,
    BorrowingSerializer,
    CategorySerializer,
    CommentSerializer,
    FinancialSettingsSerializer,
    NotificationSerializer,
    WalletSerializer,
    WalletTransactionSerializer,
)
from .wallet_service import (
    ZERO,
    WalletOperationError,
    adjust_wallet_by_admin,
    charge_and_split_purchase,
    charge_borrow_and_lock_deposit,
    charge_extension_fee,
    ensure_user_wallet,
    get_financial_settings,
    get_user_unpaid_fines_total,
    quantize_money,
    settle_all_unpaid_fines,
    settle_return_deposit_and_fines,
    topup_wallet,
)

User = get_user_model()


class IsSuperUser(permissions.BasePermission):
    """Strict permission allowing only superusers."""
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_superuser)


def _parse_strict_int_in_range(raw_value, min_val=1, max_val=50):
    if isinstance(raw_value, bool):
        return None
    if isinstance(raw_value, int):
        val = raw_value
    elif isinstance(raw_value, str):
        text = raw_value.strip()
        if not text.isdigit():
            return None
        val = int(text)
    else:
        return None
    if val < min_val or val > max_val:
        return None
    return val


def _notify_waitlist_available(book, message):
    if getattr(book, 'approval_status', 'approved') != 'approved':
        return
    waitlist_users = list(book.waitlist.all())
    for w_user in waitlist_users:
        Notification.objects.create(
            user=w_user,
            title='موجود شدن کتاب رزرو شده!',
            message=message,
            notif_type='waitlist',
            link=f'/books/{book.id}'
        )


def _notify_staff_book_pending(book, actor, is_edit=False):
    staff_users = list(
        User.objects.filter(
            Q(is_staff=True) | Q(is_superuser=True),
            is_active=True
        ).exclude(id=actor.id)
    )
    action_text = 'ویرایش شد و مجدداً در انتظار بررسی است' if is_edit else 'ثبت شد و در انتظار بررسی و تأیید است'
    staff_title = 'درخواست بررسی مجدد کتاب ویرایش‌شده' if is_edit else 'درخواست بررسی و تأیید کتاب جدید'
    staff_notifs = [
        Notification(
            user=s_user,
            title=staff_title,
            message=f"کتاب «{book.title}» اثر {book.author} توسط کاربر @{actor.username} {action_text}.",
            notif_type='approval',
            link='/manager/dashboard'
        )
        for s_user in staff_users
    ]
    if staff_notifs:
        Notification.objects.bulk_create(staff_notifs)

    user_title = 'ارسال مجدد کتاب برای بررسی مدیریت' if is_edit else 'کتاب شما در صف بررسی قرار گرفت'
    user_msg = (
        f"تغییرات کتاب «{book.title}» ذخیره شد و پس از بررسی و تأیید مدیر یا کارمند کتابخانه در کاتالوگ منتشر خواهد شد."
        if is_edit
        else f"کتاب «{book.title}» با موفقیت ثبت شد و هم‌اکنون در انتظار بررسی و تأیید مدیر یا کارمند کتابخانه است."
    )
    Notification.objects.create(
        user=actor,
        title=user_title,
        message=user_msg,
        notif_type='approval',
        link=f'/books/{book.id}'
    )


def _with_copy_prefetches(queryset, user=None):
    is_staff_viewer = bool(user and getattr(user, 'is_authenticated', False) and (user.is_staff or user.is_superuser))
    if not is_staff_viewer:
        return queryset.prefetch_related('copies')
    active_borrowings_qs = Borrowing.objects.filter(return_date__isnull=True).select_related('user').order_by('id')
    return queryset.prefetch_related(
        Prefetch('borrowings', queryset=active_borrowings_qs, to_attr='prefetched_active_borrowings'),
        Prefetch(
            'copies',
            queryset=BookCopy.objects.prefetch_related(
                Prefetch('borrowings', queryset=active_borrowings_qs, to_attr='prefetched_active_borrowings')
            )
        ),
    )


def resolve_user_from_identifier(raw_identifier):
    """
    Resolves a user from:
    - QR payload: 'BOOKSTORE-MEMBER:LIB-U0008|USER:majid'
    - Member code: 'LIB-U0008' or 'LIB-USER-0008' or 'U0008'
    - Username: 'majid' or '@majid'
    - Numeric ID: '8'
    """
    if raw_identifier is None:
        return None
    text = str(raw_identifier).strip()
    if not text:
        return None

    # Check QR payload or LIB-Uxxxx code
    m_code = re.search(r'LIB-U(?:SER-)?0*(\d+)', text, re.IGNORECASE)
    if m_code:
        uid = int(m_code.group(1))
        return User.objects.filter(id=uid).first()

    if text.isdigit():
        return User.objects.filter(id=int(text)).first()

    clean_username = text.lstrip('@').strip()
    user = User.objects.filter(username__iexact=clean_username).first()
    if user:
        return user
    return None


def resolve_book_from_identifier(raw_identifier):
    """
    Resolves a book from:
    - QR payload: 'BOOKSTORE-BOOK:LIB-B0001|ID:1'
    - Book code: 'LIB-B0001' or 'LIB-BOOK-0001'
    - Numeric ID: '1'
    - Exact or partial title
    """
    if raw_identifier is None:
        return None
    text = str(raw_identifier).strip()
    if not text:
        return None

    m_code = re.search(r'LIB-B(?:OOK-)?0*(\d+)', text, re.IGNORECASE)
    if m_code:
        bid = int(m_code.group(1))
        return Book.objects.filter(id=bid).first()

    if text.isdigit():
        return Book.objects.filter(id=int(text)).first()

    book = Book.objects.filter(title__iexact=text).first()
    if book:
        return book
    return Book.objects.filter(title__icontains=text).first()


class IsOwnerOrReadOnly(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return obj.user == request.user or request.user.is_staff or request.user.is_superuser


class IsStaffOrReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_authenticated and (request.user.is_staff or request.user.is_superuser))


class CategoryListCreateAPIView(generics.ListCreateAPIView):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsStaffOrReadOnly]

    def create(self, request, *args, **kwargs):
        data = request.data.copy()
        if not data.get('slug') and data.get('name'):
            data['slug'] = slugify(data['name'], allow_unicode=True)
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class CategoryDetailAPIView(generics.DestroyAPIView):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [permissions.IsAdminUser]


class BookListCreateAPIView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return BookDetailSerializer
        return BookListSerializer

    def get_queryset(self):
        user = getattr(self.request, 'user', None)
        queryset = _with_copy_prefetches(
            Book.objects.select_related('category', 'user', 'reviewed_by').all(),
            user
        )

        is_staff_or_super = bool(user and getattr(user, 'is_authenticated', False) and (user.is_staff or user.is_superuser))
        approval_param = self.request.query_params.get('approval_status')

        if is_staff_or_super:
            if approval_param in ('pending', 'approved', 'rejected'):
                queryset = queryset.filter(approval_status=approval_param)
            else:
                queryset = queryset.filter(Q(approval_status='approved') | Q(approval_status='pending'))
        elif user and getattr(user, 'is_authenticated', False):
            if approval_param == 'pending':
                queryset = queryset.filter(user=user, approval_status='pending')
            elif approval_param == 'approved':
                queryset = queryset.filter(approval_status='approved')
            else:
                queryset = queryset.filter(Q(approval_status='approved') | Q(user=user, approval_status='pending'))
        else:
            queryset = queryset.filter(approval_status='approved')

        category_slug = self.request.query_params.get('category')
        if category_slug:
            queryset = queryset.filter(category__slug=category_slug)

        search_query = self.request.query_params.get('search')
        if search_query:
            queryset = queryset.filter(
                Q(title__icontains=search_query) | Q(author__icontains=search_query)
            )

        status_filter = self.request.query_params.get('status')
        if status_filter == 'available':
            queryset = queryset.filter(is_available=True, approval_status='approved')

        sort = self.request.query_params.get('sort')
        if sort == 'newest':
            queryset = queryset.order_by('-id')
        elif sort == 'price_low':
            queryset = queryset.order_by('price')
        elif sort == 'price_high':
            queryset = queryset.order_by('-price')
        else:
            queryset = queryset.order_by('-id')

        return queryset

    def perform_create(self, serializer):
        raw_copies = serializer.validated_data.pop('copies_count', 1)
        copies_count = max(1, min(100, int(raw_copies or 1)))
        user = self.request.user
        is_staff_or_super = bool(user.is_staff or user.is_superuser)
        approval_status = 'approved' if is_staff_or_super else 'pending'
        reviewed_by = user if is_staff_or_super else None
        reviewed_at = timezone.now() if is_staff_or_super else None

        book = serializer.save(
            user=user,
            is_available=True,
            approval_status=approval_status,
            reviewed_by=reviewed_by,
            reviewed_at=reviewed_at,
        )
        existing_count = book.copies.count()
        if copies_count > existing_count:
            BookCopy.objects.bulk_create([
                BookCopy(book=book, is_available=True)
                for _ in range(copies_count - existing_count)
            ])
        book.sync_availability()
        if approval_status == 'pending':
            _notify_staff_book_pending(book, user, is_edit=False)


class BookDetailAPIView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = BookDetailSerializer
    permission_classes = [IsOwnerOrReadOnly]

    def get_queryset(self):
        user = getattr(self.request, 'user', None)
        qs = _with_copy_prefetches(
            Book.objects.select_related('category', 'user', 'reviewed_by').prefetch_related('comments__user').all(),
            user
        )
        if user and getattr(user, 'is_authenticated', False):
            if user.is_staff or user.is_superuser:
                return qs
            return qs.filter(Q(approval_status='approved') | Q(user=user))
        return qs.filter(approval_status='approved')

    def perform_update(self, serializer):
        serializer.validated_data.pop('copies_count', None)
        user = self.request.user
        is_staff_or_super = bool(user.is_staff or user.is_superuser)
        if not is_staff_or_super:
            book = serializer.save(
                approval_status='pending',
                rejection_reason='',
                reviewed_by=None,
                reviewed_at=None,
            )
            book.sync_availability()
            _notify_staff_book_pending(book, user, is_edit=True)
        else:
            book = serializer.save()
            book.sync_availability()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if Borrowing.objects.filter(book=instance, return_date__isnull=True).exists():
            return Response(
                {'error': 'این کتاب هم‌اکنون در امانت است و تا زمان بازگشت امکان حذف آن وجود ندارد.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if Borrowing.objects.filter(book=instance, unpaid_fine__gt=ZERO).exists():
            return Response(
                {'error': 'این کتاب دارای جریمه دیرکرد تسویه‌نشده است و تا زمان تسویه آن امکان حذف کتاب وجود ندارد.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        return super().destroy(request, *args, **kwargs)


class BookApprovalReviewAPIView(APIView):
    """
    Allows Admin (superuser) or Staff to approve or reject a submitted book.
    POST /api/books/<pk>/review/ with {'action': 'approve' | 'reject', 'rejection_reason': '...'}
    """
    permission_classes = [permissions.IsAdminUser]

    def post(self, request, pk):
        action = str(request.data.get('action') or '').strip().lower()
        if action not in ('approve', 'reject'):
            return Response(
                {'error': 'عملیات نامعتبر است. مقدار action باید approve یا reject باشد.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        with transaction.atomic():
            book = get_object_or_404(Book.objects.select_for_update(), id=pk)

            if action == 'approve':
                book.approval_status = 'approved'
                book.reviewed_by = request.user
                book.reviewed_at = timezone.now()
                book.rejection_reason = ''
                book.save(update_fields=['approval_status', 'reviewed_by', 'reviewed_at', 'rejection_reason'])
                book.sync_availability()

                if book.user_id and book.user_id != request.user.id:
                    Notification.objects.create(
                        user=book.user,
                        title='تأیید و انتشار کتاب شما',
                        message=(
                            f"کتاب «{book.title}» پس از بررسی توسط مدیریت (@{request.user.username}) تأیید شد "
                            f"و هم‌اکنون در کاتالوگ عمومی کتابخانه قابل مشاهده و امانت‌گیری است."
                        ),
                        notif_type='approval',
                        link=f'/books/{book.id}'
                    )

                refreshed = _with_copy_prefetches(
                    Book.objects.select_related('category', 'user', 'reviewed_by').prefetch_related('comments__user'),
                    request.user
                ).get(pk=book.pk)
                return Response({
                    'message': f'کتاب «{book.title}» با موفقیت تأیید و در کاتالوگ عمومی منتشر شد.',
                    'book': BookDetailSerializer(refreshed, context={'request': request}).data,
                }, status=status.HTTP_200_OK)

            # action == 'reject'
            if Borrowing.objects.filter(book=book, return_date__isnull=True).exists():
                return Response(
                    {'error': 'این کتاب هم‌اکنون در دست امانت است و تا زمان بازگشت امکان رد یا تعلیق آن وجود ندارد.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            reason = str(request.data.get('rejection_reason') or '').strip()
            final_reason = reason or 'عدم انطباق مشخصات کتاب با ضوابط و استانداردهای کتابخانه'
            book.approval_status = 'rejected'
            book.reviewed_by = request.user
            book.reviewed_at = timezone.now()
            book.rejection_reason = final_reason
            book.save(update_fields=['approval_status', 'reviewed_by', 'reviewed_at', 'rejection_reason'])

            if book.user_id and book.user_id != request.user.id:
                Notification.objects.create(
                    user=book.user,
                    title='عدم تأیید کتاب ثبت‌شده',
                    message=(
                        f"کتاب «{book.title}» پس از بررسی توسط مدیریت (@{request.user.username}) تأیید نشد. "
                        f"علت: {final_reason}. می‌توانید پس از ویرایش و اصلاح، مجدداً آن را برای بررسی ارسال نمایید."
                    ),
                    notif_type='approval',
                    link=f'/books/{book.id}'
                )

            refreshed = _with_copy_prefetches(
                Book.objects.select_related('category', 'user', 'reviewed_by').prefetch_related('comments__user'),
                request.user
            ).get(pk=book.pk)
            return Response({
                'message': f'درخواست انتشار کتاب «{book.title}» رد شد و به کاربر اطلاع‌رسانی گردید.',
                'book': BookDetailSerializer(refreshed, context={'request': request}).data,
            }, status=status.HTTP_200_OK)


class BookCopyCreateAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        book = get_object_or_404(Book, id=pk)
        if not (book.user_id == request.user.id or request.user.is_staff or request.user.is_superuser):
            return Response(
                {'error': 'شما اجازه مدیریت شناسه‌های این کتاب را ندارید.'},
                status=status.HTTP_403_FORBIDDEN
            )

        count = _parse_strict_int_in_range(request.data.get('count', 1), min_val=1, max_val=50)
        if count is None:
            return Response(
                {'error': 'تعداد باید یک عدد صحیح بین ۱ تا ۵۰ باشد.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        with transaction.atomic():
            created_copies = [
                BookCopy.objects.create(book=book, is_available=True)
                for _ in range(count)
            ]
            book.sync_availability()
            _notify_waitlist_available(
                book,
                f"مژده! نسخه جدیدی از کتاب «{book.title}» که در صف رزرو شما قرار داشت به کتابخانه اضافه شد و هم‌اکنون آماده امانت‌گیری است."
            )

        all_copies = book.copies.all()
        unsold_copies = all_copies.filter(is_sold=False)
        return Response({
            'message': f'{count} جلد جدید به کتاب «{book.title}» اضافه شد.',
            'created_copies': BookCopySerializer(created_copies, many=True, context={'request': request}).data,
            'copies': BookCopySerializer(all_copies, many=True, context={'request': request}).data,
            'total_copies_count': unsold_copies.count(),
            'available_copies_count': unsold_copies.filter(is_available=True).count(),
            'sold_copies_count': all_copies.filter(is_sold=True).count(),
            'is_available': book.is_available,
        }, status=status.HTTP_201_CREATED)


class BookCopyDeleteAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, pk, copy_id):
        book = get_object_or_404(Book, id=pk)
        if not (book.user_id == request.user.id or request.user.is_staff or request.user.is_superuser):
            return Response(
                {'error': 'شما اجازه مدیریت شناسه‌های این کتاب را ندارید.'},
                status=status.HTTP_403_FORBIDDEN
            )

        with transaction.atomic():
            copy_obj = get_object_or_404(BookCopy.objects.select_for_update(), id=copy_id, book=book)
            if copy_obj.is_sold:
                return Response(
                    {'error': f'شناسه #{copy_obj.id} قبلاً فروخته شده است و امکان حذف آن وجود ندارد.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            if not copy_obj.is_available or Borrowing.objects.filter(book_copy=copy_obj, return_date__isnull=True).exists():
                return Response(
                    {'error': f'شناسه #{copy_obj.id} هم‌اکنون در دست امانت است و امکان حذف آن وجود ندارد.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            if book.copies.filter(is_sold=False).count() <= 1:
                return Response(
                    {'error': 'هر کتاب باید حداقل ۱ شناسه داشته باشد. برای حذف کامل کتاب از گزینه حذف کتاب استفاده کنید.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            deleted_id = copy_obj.id
            Borrowing.objects.filter(book_copy=copy_obj, copy_id_snapshot__isnull=True).update(copy_id_snapshot=deleted_id)
            copy_obj.delete()
            book.sync_availability()

        all_copies = book.copies.all()
        unsold_copies = all_copies.filter(is_sold=False)
        return Response({
            'message': f'شناسه #{deleted_id} با موفقیت حذف شد.',
            'copies': BookCopySerializer(all_copies, many=True, context={'request': request}).data,
            'total_copies_count': unsold_copies.count(),
            'available_copies_count': unsold_copies.filter(is_available=True).count(),
            'sold_copies_count': all_copies.filter(is_sold=True).count(),
            'is_available': book.is_available,
        }, status=status.HTTP_200_OK)


class CommentCreateAPIView(generics.CreateAPIView):
    serializer_class = CommentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def create(self, request, *args, **kwargs):
        book_id = self.kwargs.get('book_id')
        book = get_object_or_404(Book, id=book_id)
        if book.approval_status != 'approved':
            return Response(
                {'error': 'امکان ثبت دیدگاه برای کتابی که هنوز توسط مدیریت تأیید نشده است وجود ندارد.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        book_id = self.kwargs.get('book_id')
        book = get_object_or_404(Book, id=book_id)
        comment = serializer.save(user=self.request.user, book=book)
        if book.user_id and book.user_id != self.request.user.id:
            Notification.objects.create(
                user=book.user,
                title='دیدگاه جدید برای کتاب شما',
                message=f"کاربر @{self.request.user.username} دیدگاهی با امتیاز {comment.rating} ستاره برای کتاب «{book.title}» ثبت کرد.",
                notif_type='comment',
                link=f'/books/{book.id}'
            )


class BorrowBookAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        try:
            with transaction.atomic():
                book = get_object_or_404(Book.objects.select_for_update(), id=pk)

                if book.approval_status != 'approved':
                    return Response(
                        {"error": "این کتاب هنوز توسط مدیریت کتابخانه تأیید نشده است و امکان امانت‌گیری آن وجود ندارد."},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                if Borrowing.objects.filter(book=book, user=request.user, return_date__isnull=True).exists():
                    return Response(
                        {"error": "شما قبلاً این کتاب را امانت گرفته‌اید."},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                if not book.copies.exists():
                    BookCopy.objects.create(book=book, is_available=book.is_available)

                available_copy = (
                    BookCopy.objects.select_for_update()
                    .filter(book=book, is_available=True, is_sold=False)
                    .order_by('id')
                    .first()
                )
                if not available_copy or not book.is_available:
                    book.sync_availability()
                    return Response(
                        {"error": "این کتاب در حال حاضر موجود نیست (امانت داده شده یا فروخته شده است)."},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                borrowing = Borrowing.objects.create(
                    user=request.user,
                    book=book,
                    book_copy=available_copy,
                    borrow_date=timezone.now(),
                    status='borrowed'
                )

                fee_summary = charge_borrow_and_lock_deposit(
                    borrower=request.user,
                    book=book,
                    borrowing=borrowing,
                    waive_fee=False,
                    actor=request.user,
                )

                available_copy.is_available = False
                available_copy.save(update_fields=['is_available'])

                # Remove user from waitlist if they had reserved it
                book.waitlist.remove(request.user)
                book.sync_availability()

                fee_note = ''
                if fee_summary['borrow_fee'] > ZERO or fee_summary['deposit_locked'] > ZERO:
                    fee_note = (
                        f" (هزینه امانت: ${fee_summary['borrow_fee']:.2f} | "
                        f"ودیعه بلوکه‌شده: ${fee_summary['deposit_locked']:.2f})"
                    )

                Notification.objects.create(
                    user=request.user,
                    title='امانت کتاب ثبت شد',
                    message=f"کتاب «{book.title}» (شناسه #{available_copy.id}) با موفقیت برای شما به امانت ثبت شد. مهلت بازگشت: ۱۴ روز.{fee_note}",
                    notif_type='borrow',
                    link=f'/books/{book.id}'
                )
        except WalletOperationError as exc:
            payload = {"error": exc.message}
            payload.update(exc.extra)
            return Response(payload, status=status.HTTP_400_BAD_REQUEST)

        wallet = ensure_user_wallet(request.user)
        return Response({
            "message": f"کتاب '{book.title}' (شناسه #{available_copy.id}) با موفقیت امانت گرفته شد.",
            "borrowing": BorrowingSerializer(borrowing, context={'request': request}).data,
            "wallet": WalletSerializer(wallet).data,
        }, status=status.HTTP_201_CREATED)


class PurchaseBookAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        try:
            with transaction.atomic():
                book = get_object_or_404(Book.objects.select_for_update(), id=pk)

                if book.approval_status != 'approved':
                    return Response(
                        {"error": "این کتاب هنوز توسط مدیریت کتابخانه تأیید نشده است و امکان خرید آن وجود ندارد."},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                if not book.copies.exists():
                    BookCopy.objects.create(book=book, is_available=book.is_available)

                available_copy = (
                    BookCopy.objects.select_for_update()
                    .filter(book=book, is_available=True, is_sold=False)
                    .order_by('id')
                    .first()
                )
                if not available_copy or not book.is_available:
                    book.sync_availability()
                    return Response(
                        {"error": "در حال حاضر جلد آزادی از این کتاب برای خرید در مخزن موجود نیست."},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                order, tx = charge_and_split_purchase(
                    buyer=request.user,
                    book=book,
                    copy_obj=available_copy,
                )
        except WalletOperationError as exc:
            payload = {"error": exc.message}
            payload.update(exc.extra)
            return Response(payload, status=status.HTTP_400_BAD_REQUEST)

        wallet = ensure_user_wallet(request.user)
        return Response({
            "message": f"کتاب «{book.title}» (جلد #{available_copy.id}) با موفقیت به مبلغ ${order.total_price:.2f} خریداری شد.",
            "order": BookOrderSerializer(order, context={'request': request}).data,
            "transaction": WalletTransactionSerializer(tx).data,
            "wallet": WalletSerializer(wallet).data,
        }, status=status.HTTP_201_CREATED)


class ReturnBookAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        with transaction.atomic():
            qs = Borrowing.objects.select_for_update().select_related('book', 'book__user', 'user')
            if request.user.is_staff or request.user.is_superuser:
                borrowing = get_object_or_404(qs, id=pk)
            else:
                borrowing = get_object_or_404(qs, id=pk, user=request.user)

            if borrowing.return_date is not None:
                return Response(
                    {"error": "این کتاب قبلاً تحویل داده شده است."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            return_dt = timezone.now()
            borrowing.return_date = return_dt
            borrowing.status = 'returned'
            borrowing.returned_by = request.user
            borrowing.save(update_fields=['return_date', 'status', 'returned_by'])

            book = Book.objects.select_for_update().get(pk=borrowing.book_id)
            if borrowing.book_copy_id:
                BookCopy.objects.filter(pk=borrowing.book_copy_id, is_sold=False).update(is_available=True)
            else:
                unavailable_copy = BookCopy.objects.filter(book=book, is_available=False, is_sold=False).order_by('id').first()
                if unavailable_copy:
                    unavailable_copy.is_available = True
                    unavailable_copy.save(update_fields=['is_available'])
            book.sync_availability()

            settlement = settle_return_deposit_and_fines(borrowing, return_dt, actor=request.user)

            days = max(1, (borrowing.return_date - borrowing.borrow_date).days) if borrowing.borrow_date else 1
            finance_note = ''
            if settlement['deposit_released'] > ZERO:
                finance_note += f" ودیعه ${settlement['deposit_released']:.2f} به کیف‌پول آزاد شد."
            if settlement['late_fee'] > ZERO:
                finance_note += f" جریمه تأخیر ({settlement['late_days']} روز): ${settlement['late_fee']:.2f}."
                if settlement['unpaid_fine'] > ZERO:
                    finance_note += f" مانده جریمه تسویه‌نشده: ${settlement['unpaid_fine']:.2f}."

            if request.user.id == borrowing.user_id:
                Notification.objects.create(
                    user=borrowing.user,
                    title='تحویل کتاب به کتابخانه',
                    message=f"کتاب «{book.title}» پس از {days} روز مطالعه با موفقیت به کتابخانه بازگردانده شد.{finance_note}",
                    notif_type='return',
                    link=f'/books/{book.id}'
                )
            else:
                Notification.objects.create(
                    user=borrowing.user,
                    title='ثبت تحویل کتاب توسط مدیریت',
                    message=f"تحویل کتاب «{book.title}» توسط مدیریت کتابخانه (@{request.user.username}) ثبت شد و از لیست امانت‌های فعال شما خارج گردید.{finance_note}",
                    notif_type='return',
                    link='/dashboard'
                )

            # Notify users waiting in the reservation waitlist for this book
            _notify_waitlist_available(
                book,
                f"مژده! کتاب «{book.title}» که در صف رزرو شما قرار داشت هم‌اکنون تحویل داده شد و آماده امانت‌گیری است."
            )

        return Response({
            "message": f"کتاب '{book.title}' با موفقیت به کتابخانه بازگردانده شد.{finance_note}",
            "settlement": {
                "late_days": settlement['late_days'],
                "late_fee": f"{settlement['late_fee']:.2f}",
                "deposit_released": f"{settlement['deposit_released']:.2f}",
                "collected_fine": f"{settlement['collected_fine']:.2f}",
                "unpaid_fine": f"{settlement['unpaid_fine']:.2f}",
            }
        }, status=status.HTTP_200_OK)


class ExtendBorrowingAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        try:
            with transaction.atomic():
                borrowing = get_object_or_404(
                    Borrowing.objects.select_for_update().select_related('book', 'book__user'),
                    id=pk,
                    user=request.user,
                    return_date__isnull=True
                )

                if borrowing.is_extended:
                    return Response(
                        {"error": "مهلت امانت این کتاب قبلاً یک بار تمدید شده است."},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                extend_fee = charge_extension_fee(request.user, borrowing)

                borrowing.due_date = borrowing.due_date + timedelta(days=7)
                borrowing.is_extended = True
                borrowing.save(update_fields=['due_date', 'is_extended'])

                fee_text = f" (هزینه تمدید: ${extend_fee:.2f})" if extend_fee > ZERO else ""
                Notification.objects.create(
                    user=borrowing.user,
                    title='تمدید مهلت امانت کتاب',
                    message=f"مهلت امانت کتاب «{borrowing.book.title}» به مدت ۷ روز دیگر با موفقیت تمدید شد.{fee_text}",
                    notif_type='extend',
                    link='/dashboard'
                )
        except WalletOperationError as exc:
            payload = {"error": exc.message}
            payload.update(exc.extra)
            return Response(payload, status=status.HTTP_400_BAD_REQUEST)

        wallet = ensure_user_wallet(request.user)
        return Response({
            "message": f"مهلت امانت کتاب '{borrowing.book.title}' به مدت ۷ روز تمدید شد.",
            "borrowing": BorrowingSerializer(borrowing, context={'request': request}).data,
            "wallet": WalletSerializer(wallet).data,
        }, status=status.HTTP_200_OK)


class ToggleWishlistAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        book = get_object_or_404(Book, id=pk)
        if book.approval_status != 'approved':
            return Response(
                {'error': 'امکان افزودن کتاب تأییدنشده به لیست علاقه‌مندی‌ها وجود ندارد.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if book.wishlist.filter(id=request.user.id).exists():
            book.wishlist.remove(request.user)
            return Response({
                'is_wishlisted': False,
                'message': f"کتاب '{book.title}' از لیست علاقه‌مندی‌ها حذف شد."
            }, status=status.HTTP_200_OK)
        else:
            book.wishlist.add(request.user)
            return Response({
                'is_wishlisted': True,
                'message': f"کتاب '{book.title}' به لیست علاقه‌مندی‌ها اضافه شد."
            }, status=status.HTTP_200_OK)


class ToggleReservationAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        book = get_object_or_404(Book, id=pk)
        if book.approval_status != 'approved':
            return Response(
                {"error": "این کتاب هنوز توسط مدیریت تأیید نشده است و امکان رزرو آن وجود ندارد."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if book.waitlist.filter(id=request.user.id).exists():
            book.waitlist.remove(request.user)
            return Response({
                'is_reserved_by_user': False,
                'waitlist_count': book.waitlist.count(),
                'message': f"نوبت رزرو شما برای کتاب '{book.title}' لغو شد."
            }, status=status.HTTP_200_OK)

        if book.is_available:
            return Response(
                {"error": "این کتاب هم‌اکنون موجود است و می‌توانید مستقیماً آن را امانت بگیرید."},
                status=status.HTTP_400_BAD_REQUEST
            )

        book.waitlist.add(request.user)
        return Response({
            'is_reserved_by_user': True,
            'waitlist_count': book.waitlist.count(),
            'message': f"شما در صف رزرو کتاب '{book.title}' قرار گرفتید. به محض تحویل کتاب در داشبورد مطلع خواهید شد."
        }, status=status.HTTP_200_OK)


class UserDashboardAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        all_user_borrowings = list(
            Borrowing.objects.filter(user=request.user)
            .select_related('book', 'user', 'returned_by')
            .order_by('-borrow_date')
        )
        current_borrowings = [b for b in all_user_borrowings if b.return_date is None]
        current_borrowings.sort(key=lambda x: x.due_date)

        borrowing_history = [b for b in all_user_borrowings if b.return_date is not None]
        borrowing_history.sort(key=lambda x: x.return_date, reverse=True)

        wishlist_books = request.user.wishlist_books.filter(approval_status='approved')
        waitlist_books = request.user.waitlist_books.filter(approval_status='approved')
        submitted_books = _with_copy_prefetches(
            Book.objects.filter(user=request.user).select_related('category', 'user', 'reviewed_by').order_by('-id'),
            request.user
        )

        # Compute reading stats
        now = timezone.now()
        total_borrowed = len(all_user_borrowings)
        total_returned = len(borrowing_history)
        total_reading_days = 0
        late_returns_count = 0

        for b in all_user_borrowings:
            end_dt = b.return_date or now
            days = max(1, (end_dt - b.borrow_date).days) if b.borrow_date else 1
            total_reading_days += days
            if b.return_date and b.due_date and b.return_date > b.due_date:
                late_returns_count += 1

        on_time_count = total_returned - late_returns_count
        on_time_rate = round((on_time_count / total_returned) * 100) if total_returned > 0 else 100

        user_comments = list(
            Comment.objects.filter(user=request.user)
            .select_related('book')
            .order_by('-datetime_created')
        )
        comments_count = len(user_comments)
        avg_rating_val = (
            round(sum(c.rating for c in user_comments) / comments_count, 1)
            if comments_count > 0 else None
        )

        # Build chronological activity timeline
        activity_timeline = []
        for b in all_user_borrowings:
            if b.borrow_date:
                activity_timeline.append({
                    'id': f'borrow-{b.id}',
                    'type': 'borrow',
                    'timestamp': b.borrow_date.isoformat(),
                    'book_id': b.book_id,
                    'book_title': b.book.title,
                    'description': f"امانت گرفتن کتاب «{b.book.title}»",
                    'is_extended': b.is_extended,
                })
            if b.is_extended and b.borrow_date:
                ext_time = b.borrow_date + timedelta(minutes=1)
                activity_timeline.append({
                    'id': f'extend-{b.id}',
                    'type': 'extend',
                    'timestamp': ext_time.isoformat(),
                    'book_id': b.book_id,
                    'book_title': b.book.title,
                    'description': f"تمدید مهلت امانت کتاب «{b.book.title}» (+۷ روز)",
                })
            if b.return_date:
                days = max(1, (b.return_date - b.borrow_date).days) if b.borrow_date else 1
                is_late = bool(b.due_date and b.return_date > b.due_date)
                activity_timeline.append({
                    'id': f'return-{b.id}',
                    'type': 'return',
                    'timestamp': b.return_date.isoformat(),
                    'book_id': b.book_id,
                    'book_title': b.book.title,
                    'duration_days': days,
                    'is_late': is_late,
                    'description': f"تحویل کتاب «{b.book.title}» به کتابخانه پس از {days} روز مطالعه",
                })

        for c in user_comments:
            if c.datetime_created:
                activity_timeline.append({
                    'id': f'comment-{c.id}',
                    'type': 'comment',
                    'timestamp': c.datetime_created.isoformat(),
                    'book_id': c.book_id,
                    'book_title': c.book.title,
                    'rating': c.rating,
                    'text': c.text,
                    'description': f"ثبت دیدگاه و امتیاز {c.rating} ستاره برای کتاب «{c.book.title}»",
                })

        activity_timeline.sort(key=lambda item: item['timestamp'], reverse=True)

        user_obj = request.user
        full_name = f"{user_obj.first_name} {user_obj.last_name}".strip() or user_obj.username
        member_code = f"LIB-U{user_obj.id:04d}"
        role_label = (
            "مدیر ارشد کتابخانه" if user_obj.is_superuser
            else ("کارمند کتابخانه" if user_obj.is_staff else "عضو رسمی کتابخانه")
        )

        wallet = ensure_user_wallet(user_obj)
        purchased_orders = BookOrder.objects.filter(buyer=user_obj).select_related('book', 'seller', 'buyer')[:50]
        owner_earnings_total = quantize_money(
            wallet.transactions.filter(tx_type='owner_earning').aggregate(total=Sum('amount')).get('total') or ZERO
        )
        fin_settings = get_financial_settings()

        return Response({
            'member_card': {
                'member_code': member_code,
                'username': user_obj.username,
                'full_name': full_name,
                'email': user_obj.email or '',
                'age': user_obj.age,
                'role_label': role_label,
                'date_joined': user_obj.date_joined,
                'active_loans_count': len(current_borrowings),
                'total_returned': total_returned,
                'on_time_rate': on_time_rate,
                'qr_payload': f"BOOKSTORE-MEMBER:{member_code}|USER:{user_obj.username}",
            },
            'wallet_summary': {
                **WalletSerializer(wallet).data,
                'owner_earnings_total': f'{owner_earnings_total:.2f}',
                'extend_fee_amount': f'{fin_settings.extend_fee_amount:.2f}',
                'daily_late_fee': f'{fin_settings.daily_late_fee:.2f}',
            },
            'purchased_orders': BookOrderSerializer(purchased_orders, many=True, context={'request': request}).data,
            'current_borrowings': BorrowingSerializer(current_borrowings, many=True, context={'request': request}).data,
            'borrowing_history': BorrowingSerializer(borrowing_history, many=True, context={'request': request}).data,
            'wishlist': BookListSerializer(wishlist_books, many=True, context={'request': request}).data,
            'waitlist': BookListSerializer(waitlist_books, many=True, context={'request': request}).data,
            'submitted_books': BookListSerializer(submitted_books, many=True, context={'request': request}).data,
            'reading_stats': {
                'total_borrowed': total_borrowed,
                'total_returned': total_returned,
                'active_count': len(current_borrowings),
                'total_reading_days': total_reading_days,
                'on_time_rate': on_time_rate,
                'late_returns_count': late_returns_count,
                'comments_count': comments_count,
                'average_user_rating': avg_rating_val,
            },
            'activity_timeline': activity_timeline[:40],
        })


class BorrowingHistoryAPIView(APIView):
    """
    Admin/Staff endpoint to query complete borrowing & return history.
    Supports filtering by ?book_id=, ?user_id=, ?status= (active|returned|late), and ?search=.
    """
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        qs = Borrowing.objects.select_related('book', 'user', 'returned_by').order_by('-borrow_date')

        for param_name in ('book_id', 'user_id'):
            raw_val = request.query_params.get(param_name)
            if raw_val not in (None, ''):
                try:
                    qs = qs.filter(**{param_name: int(raw_val)})
                except (TypeError, ValueError):
                    return Response(
                        {'error': f'مقدار پارامتر {param_name} باید عدد صحیح باشد.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )

        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(user__username__icontains=search) |
                Q(user__first_name__icontains=search) |
                Q(user__last_name__icontains=search) |
                Q(book__title__icontains=search) |
                Q(book__author__icontains=search)
            )

        status_filter = request.query_params.get('status', '').strip()
        now = timezone.now()
        if status_filter == 'active':
            qs = qs.filter(return_date__isnull=True)
        elif status_filter == 'returned':
            qs = qs.filter(return_date__isnull=False)
        elif status_filter == 'late':
            qs = qs.filter(
                Q(return_date__isnull=True, due_date__lt=now) |
                Q(return_date__isnull=False, return_date__gt=F('due_date'))
            )

        records = list(qs)
        total_records = len(records)
        active_count = sum(1 for r in records if r.return_date is None)
        returned_count = sum(1 for r in records if r.return_date is not None)
        late_count = sum(
            1 for r in records
            if (r.return_date and r.due_date and r.return_date > r.due_date)
            or (r.return_date is None and r.due_date and now > r.due_date)
        )
        on_time_returned_count = sum(
            1 for r in records
            if r.return_date is not None and (not r.due_date or r.return_date <= r.due_date)
        )
        unique_users_count = len({r.user_id for r in records})
        unique_books_count = len({r.book_id for r in records})

        return Response({
            'summary': {
                'total_records': total_records,
                'active_count': active_count,
                'returned_count': returned_count,
                'on_time_returned_count': on_time_returned_count,
                'late_count': late_count,
                'unique_users_count': unique_users_count,
                'unique_books_count': unique_books_count,
            },
            'results': BorrowingSerializer(records, many=True, context={'request': request}).data,
        })


class LibraryManagerStatsAPIView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        now = timezone.now()
        approved_copies_qs = BookCopy.objects.filter(book__approval_status='approved')
        unsold_approved_copies_qs = approved_copies_qs.filter(is_sold=False)
        approved_titles_qs = Book.objects.filter(approval_status='approved')
        total_copies = unsold_approved_copies_qs.count()
        sold_copies_count = approved_copies_qs.filter(is_sold=True).count()
        total_titles = approved_titles_qs.count()
        total_books = total_copies if total_copies > 0 else total_titles
        borrowed_count = unsold_approved_copies_qs.filter(is_available=False).count()
        available_count = max(0, total_books - borrowed_count)
        categories = Category.objects.all()
        categories_count = categories.count()
        recent_books = _with_copy_prefetches(
            Book.objects.select_related('category', 'user', 'reviewed_by').order_by('-id'),
            request.user
        )[:30]
        pending_books_qs = _with_copy_prefetches(
            Book.objects.filter(approval_status='pending').select_related('category', 'user', 'reviewed_by').order_by('-id'),
            request.user
        )
        rejected_books_qs = _with_copy_prefetches(
            Book.objects.filter(approval_status='rejected').select_related('category', 'user', 'reviewed_by').order_by('-id'),
            request.user
        )

        active_borrowings = list(
            Borrowing.objects.filter(return_date__isnull=True)
            .select_related('book', 'book_copy', 'user', 'returned_by')
            .order_by('due_date')
        )

        all_borrowings = Borrowing.objects.select_related('book', 'book_copy', 'user', 'returned_by').order_by('-borrow_date')[:100]

        # Build lightweight member directory for Staff & Superuser Quick Loan + Broadcast
        active_loans_by_user = {}
        overdue_users_set = set()
        for ab in active_borrowings:
            active_loans_by_user[ab.user_id] = active_loans_by_user.get(ab.user_id, 0) + 1
            if ab.due_date and ab.due_date < now:
                overdue_users_set.add(ab.user_id)

        members_qs = User.objects.filter(is_active=True).order_by('username')
        wallets_map = {w.user_id: w for w in Wallet.objects.filter(user__is_active=True)}
        members_directory = []
        for u in members_qs:
            full_name = f"{u.first_name} {u.last_name}".strip() or u.username
            m_code = f"LIB-U{u.id:04d}"
            w = wallets_map.get(u.id) or ensure_user_wallet(u)
            members_directory.append({
                'id': u.id,
                'username': u.username,
                'full_name': full_name,
                'email': u.email or '',
                'member_code': m_code,
                'qr_payload': f"BOOKSTORE-MEMBER:{m_code}|USER:{u.username}",
                'is_staff': u.is_staff,
                'is_superuser': u.is_superuser,
                'active_loans_count': active_loans_by_user.get(u.id, 0),
                'has_overdue': u.id in overdue_users_set,
                'wallet_balance': f'{w.balance:.2f}',
                'wallet_locked_balance': f'{w.locked_balance:.2f}',
                'wallet_is_frozen': bool(w.is_frozen),
            })

        books_qs = Book.objects.filter(approval_status='approved').select_related('category').prefetch_related('copies').order_by('-is_available', 'title')
        books_directory = []
        for b in books_qs:
            all_copies = [c for c in b.copies.all() if not c.is_sold]
            avail_copies = [c for c in all_copies if c.is_available]
            books_directory.append({
                'id': b.id,
                'book_code': f"LIB-B{b.id:04d}",
                'qr_payload': f"BOOKSTORE-BOOK:LIB-B{b.id:04d}|ID:{b.id}",
                'title': b.title,
                'author': b.author,
                'is_available': b.is_available,
                'category_name': b.category.name if b.category else 'بدون دسته',
                'total_copies_count': len(all_copies),
                'available_copies_count': len(avail_copies),
                'available_copies': [{'id': c.id} for c in avail_copies],
            })

        recent_notifs = Notification.objects.select_related('user').order_by('-created_at')[:10]
        recent_broadcasts = [
            {
                'id': n.id,
                'recipient_username': n.user.username if n.user else '',
                'recipient_code': f"LIB-U{n.user_id:04d}" if n.user_id else '',
                'title': n.title,
                'message': n.message,
                'notif_type': n.notif_type,
                'is_read': n.is_read,
                'created_at': n.created_at,
            }
            for n in recent_notifs
        ]

        pending_books_list = list(pending_books_qs)
        rejected_books_list = list(rejected_books_qs)

        return Response({
            'total_books': total_books,
            'total_titles': total_titles,
            'borrowed_count': borrowed_count,
            'available_count': available_count,
            'sold_copies_count': sold_copies_count,
            'categories_count': categories_count,
            'pending_books_count': len(pending_books_list),
            'rejected_books_count': len(rejected_books_list),
            'pending_books': BookListSerializer(pending_books_list, many=True, context={'request': request}).data,
            'rejected_books': BookListSerializer(rejected_books_list, many=True, context={'request': request}).data,
            'recent_books': BookListSerializer(recent_books, many=True, context={'request': request}).data,
            'active_borrowings': BorrowingSerializer(active_borrowings, many=True, context={'request': request}).data,
            'all_borrowings': BorrowingSerializer(all_borrowings, many=True, context={'request': request}).data,
            'categories': CategorySerializer(categories, many=True).data,
            'members_directory': members_directory,
            'books_directory': books_directory,
            'recent_broadcasts': recent_broadcasts,
        })


class ManagerSendNotificationAPIView(APIView):
    """
    Allows Admin (superuser) or Staff to send notifications:
    - target_type == 'all': broadcast to all active users
    - target_type == 'overdue': reminder to users who currently hold overdue books
    - target_type == 'single': direct notification to a specific user (by ID, username, or LIB-Uxxxx)
    """
    permission_classes = [permissions.IsAdminUser]

    def post(self, request):
        target_type = str(request.data.get('target_type', 'all')).strip()
        notif_type = str(request.data.get('notif_type', 'info')).strip()
        if notif_type not in ('info', 'reminder'):
            notif_type = 'info'

        title = str(request.data.get('title', '')).strip()
        message = str(request.data.get('message', '')).strip()
        link = str(request.data.get('link', '/dashboard')).strip() or '/dashboard'

        if not title or not message:
            return Response(
                {'error': 'لطفاً عنوان و متن پیام اطلاعیه را وارد کنید.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        now = timezone.now()
        target_users = []

        if target_type == 'all':
            target_users = list(User.objects.filter(is_active=True).order_by('id'))
            if not target_users:
                return Response(
                    {'error': 'هیچ کاربر فعالی در سامانه یافت نشد.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        elif target_type == 'overdue':
            overdue_user_ids = (
                Borrowing.objects.filter(return_date__isnull=True, due_date__lt=now)
                .values_list('user_id', flat=True)
                .distinct()
            )
            target_users = list(User.objects.filter(id__in=overdue_user_ids, is_active=True).order_by('id'))
            if not target_users:
                return Response(
                    {'error': 'در حال حاضر هیچ کاربری دارای کتاب معوقه (تأخیردار) نیست.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        elif target_type == 'single':
            user_identifier = request.data.get('user_identifier') or request.data.get('user_id')
            resolved = resolve_user_from_identifier(user_identifier)
            if not resolved:
                return Response(
                    {'error': 'کاربر مورد نظر با این شناسه، کد عضویت یا نام کاربری یافت نشد.'},
                    status=status.HTTP_404_NOT_FOUND
                )
            target_users = [resolved]
        else:
            return Response(
                {'error': 'نوع مخاطب نامعتبر است.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        sender_label = "مدیر ارشد" if request.user.is_superuser else "کارمند کتابخانه"
        formatted_title = title
        formatted_message = f"{message}\n(ارسال‌شده توسط {sender_label}: @{request.user.username})"

        notifications_to_create = [
            Notification(
                user=u,
                title=formatted_title,
                message=formatted_message,
                notif_type=notif_type,
                link=link,
            )
            for u in target_users
        ]
        Notification.objects.bulk_create(notifications_to_create)

        recipient_names = [f"@{u.username}" for u in target_users]
        return Response(
            {
                'message': f'پیام «{title}» با موفقیت برای {len(target_users)} کاربر ارسال شد.',
                'recipients_count': len(target_users),
                'recipients': recipient_names,
            },
            status=status.HTTP_201_CREATED
        )


class StaffQuickBorrowAPIView(APIView):
    """
    Allows Admin or Staff to quickly register an in-person book loan for a member
    using their Member Code (LIB-Uxxxx / QR payload / username) and Book Code (LIB-Bxxxx / QR payload / ID).
    """
    permission_classes = [permissions.IsAdminUser]

    def post(self, request):
        user_identifier = request.data.get('user_identifier')
        book_identifier = request.data.get('book_identifier')
        raw_days = request.data.get('days', 14)

        if raw_days is None or raw_days == '':
            days = 14
        else:
            if isinstance(raw_days, bool):
                return Response(
                    {'error': 'مدت امانت باید عددی بین ۱ تا ۳۶۵ روز باشد.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            try:
                days = int(raw_days)
            except (TypeError, ValueError):
                return Response(
                    {'error': 'مدت امانت باید یک عدد صحیح بین ۱ تا ۳۶۵ روز باشد.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            if days < 1 or days > 365:
                return Response(
                    {'error': 'مدت امانت باید عددی بین ۱ تا ۳۶۵ روز باشد.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        if not user_identifier or not book_identifier:
            return Response(
                {'error': 'لطفاً عضو و کتاب مورد نظر را از لیست انتخاب کنید.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        target_user = resolve_user_from_identifier(user_identifier)
        if not target_user:
            return Response(
                {'error': 'کاربر مورد نظر یافت نشد.'},
                status=status.HTTP_404_NOT_FOUND
            )

        if not target_user.is_active:
            return Response(
                {'error': f'حساب کاربری @{target_user.username} غیرفعال است و امکان ثبت امانت ندارد.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        raw_book_str = str(book_identifier).strip()
        explicit_copy_id = None
        m_copy = re.match(r'^COPY:0*(\d+)$', raw_book_str, re.IGNORECASE)
        if m_copy:
            explicit_copy_id = int(m_copy.group(1))
            copy_lookup = BookCopy.objects.select_related('book').filter(id=explicit_copy_id).first()
            resolved_book = copy_lookup.book if copy_lookup else None
        else:
            resolved_book = resolve_book_from_identifier(book_identifier)

        if not resolved_book:
            return Response(
                {'error': 'کتاب مورد نظر در مخزن یافت نشد.'},
                status=status.HTTP_404_NOT_FOUND
            )

        raw_waive = request.data.get('waive_fee', False)
        waive_fee = str(raw_waive).strip().lower() in ('true', '1', 'yes') if not isinstance(raw_waive, bool) else raw_waive

        try:
            with transaction.atomic():
                book = Book.objects.select_for_update().get(pk=resolved_book.pk)
                if book.approval_status != 'approved':
                    return Response(
                        {'error': f'کتاب «{book.title}» هنوز در وضعیت تأییدشده قرار ندارد. لطفاً ابتدا آن را تأیید کنید.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                if Borrowing.objects.filter(book=book, user=target_user, return_date__isnull=True).exists():
                    return Response(
                        {'error': f'کاربر @{target_user.username} هم‌اکنون یک جلد از کتاب «{book.title}» را در دست امانت دارد.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                if not book.copies.exists():
                    BookCopy.objects.create(book=book, is_available=book.is_available)

                if explicit_copy_id is not None:
                    selected_copy = BookCopy.objects.select_for_update().filter(id=explicit_copy_id, book=book).first()
                    if not selected_copy or not selected_copy.is_available or selected_copy.is_sold:
                        return Response(
                            {'error': f'جلد انتخاب‌شده (شناسه #{explicit_copy_id}) از کتاب «{book.title}» در حال حاضر موجود نیست.'},
                            status=status.HTTP_400_BAD_REQUEST
                        )
                else:
                    selected_copy = (
                        BookCopy.objects.select_for_update()
                        .filter(book=book, is_available=True, is_sold=False)
                        .order_by('id')
                        .first()
                    )
                    if not selected_copy or not book.is_available:
                        active_loan = Borrowing.objects.filter(book=book, return_date__isnull=True).select_related('user').first()
                        holder = f"@{active_loan.user.username}" if active_loan and active_loan.user else "کاربران دیگر"
                        return Response(
                            {'error': f'تمامی جلدهای کتاب «{book.title}» هم‌اکنون در امانت ({holder}) یا فروخته‌شده است و در قفسه موجود نیست.'},
                            status=status.HTTP_400_BAD_REQUEST
                        )

                due_date = timezone.now() + timedelta(days=days)
                borrowing = Borrowing.objects.create(
                    user=target_user,
                    book=book,
                    book_copy=selected_copy,
                    due_date=due_date,
                    status='borrowed'
                )

                charge_borrow_and_lock_deposit(
                    borrower=target_user,
                    book=book,
                    borrowing=borrowing,
                    waive_fee=waive_fee,
                    actor=request.user,
                )

                selected_copy.is_available = False
                selected_copy.save(update_fields=['is_available'])
                book.sync_availability()

                if book.waitlist.filter(id=target_user.id).exists():
                    book.waitlist.remove(target_user)

                Notification.objects.create(
                    user=target_user,
                    title=f"ثبت امانت حضوری: «{book.title}»",
                    message=(
                        f"کتاب «{book.title}» (شناسه #{selected_copy.id}) توسط مسئول میز امانت (@{request.user.username}) "
                        f"به مدت {days} روز برای شما ثبت شد."
                    ),
                    notif_type='borrow',
                    link='/dashboard'
                )
        except WalletOperationError as exc:
            payload = {'error': exc.message}
            payload.update(exc.extra)
            return Response(payload, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                'message': (
                    f"امانت حضوری کتاب «{book.title}» (شناسه #{selected_copy.id}) برای کاربر @{target_user.username} "
                    f"به مدت {days} روز با موفقیت ثبت شد."
                ),
                'borrowing': BorrowingSerializer(borrowing, context={'request': request}).data,
            },
            status=status.HTTP_201_CREATED
        )


class NotificationListAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        now = timezone.now()
        active_loans = Borrowing.objects.filter(
            user=request.user,
            return_date__isnull=True
        ).select_related('book')

        for loan in active_loans:
            if not loan.due_date:
                continue
            rem_days = (loan.due_date - now).days
            if now > loan.due_date:
                overdue_title = f"هشدار تأخیر: کتاب «{loan.book.title}»"
                if not Notification.objects.filter(
                    user=request.user,
                    notif_type='reminder',
                    title=overdue_title,
                    created_at__gte=loan.borrow_date,
                ).exists():
                    Notification.objects.create(
                        user=request.user,
                        title=overdue_title,
                        message=f"مهلت امانت کتاب «{loan.book.title}» به پایان رسیده است. لطفاً هرچه سریع‌تر نسبت به تحویل آن به کتابخانه اقدام فرمایید.",
                        notif_type='reminder',
                        link='/dashboard'
                    )
            elif 0 <= rem_days <= 2:
                due_title = f"یادآوری موعد بازگشت: «{loan.book.title}»"
                if not Notification.objects.filter(
                    user=request.user,
                    notif_type='reminder',
                    title=due_title,
                    created_at__gte=loan.borrow_date,
                ).exists():
                    Notification.objects.create(
                        user=request.user,
                        title=due_title,
                        message=f"تنها {rem_days + 1} روز تا پایان مهلت امانت کتاب «{loan.book.title}» باقی مانده است.",
                        notif_type='reminder',
                        link='/dashboard'
                    )

        qs = Notification.objects.filter(user=request.user).order_by('-created_at')
        unread_count = qs.filter(is_read=False).count()
        results = NotificationSerializer(qs[:30], many=True).data
        return Response({
            'unread_count': unread_count,
            'results': results,
        })


class NotificationMarkReadAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        notif_id = request.data.get('id')
        if notif_id:
            Notification.objects.filter(user=request.user, id=notif_id).update(is_read=True)
        else:
            Notification.objects.filter(user=request.user, is_read=False).update(is_read=True)

        unread_count = Notification.objects.filter(user=request.user, is_read=False).count()
        return Response({'unread_count': unread_count})


class WalletDetailAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        wallet = ensure_user_wallet(request.user)
        tx_type = request.query_params.get('tx_type', '').strip()
        tx_qs = wallet.transactions.select_related('related_book', 'created_by', 'wallet__user')
        if tx_type:
            tx_qs = tx_qs.filter(tx_type=tx_type)

        all_txs = wallet.transactions.all()
        total_topups = quantize_money(
            all_txs.filter(tx_type__in=['topup', 'signup_bonus', 'admin_credit']).aggregate(s=Sum('amount')).get('s') or ZERO
        )
        total_earnings = quantize_money(
            all_txs.filter(tx_type='owner_earning').aggregate(s=Sum('amount')).get('s') or ZERO
        )
        total_spent = quantize_money(
            all_txs.filter(tx_type__in=['purchase', 'borrow_fee', 'extend_fee', 'late_fee', 'fine_settlement', 'admin_debit']).aggregate(s=Sum('amount')).get('s') or ZERO
        )
        fin_settings = get_financial_settings()

        return Response({
            'wallet': WalletSerializer(wallet).data,
            'summary': {
                'total_topups': f'{total_topups:.2f}',
                'total_earnings': f'{total_earnings:.2f}',
                'total_spent': f'{total_spent:.2f}',
                'unpaid_fines_total': f'{get_user_unpaid_fines_total(request.user):.2f}',
            },
            'settings': FinancialSettingsSerializer(fin_settings).data,
            'transactions': WalletTransactionSerializer(tx_qs[:100], many=True).data,
        })


class WalletTopUpAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        try:
            wallet, tx = topup_wallet(request.user, request.data.get('amount'), actor=request.user)
        except WalletOperationError as exc:
            payload = {'error': exc.message}
            payload.update(exc.extra)
            return Response(payload, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'message': f'کیف‌پول شما با موفقیت به مبلغ ${tx.amount:.2f} شارژ شد.',
            'wallet': WalletSerializer(wallet).data,
            'transaction': WalletTransactionSerializer(tx).data,
        }, status=status.HTTP_201_CREATED)


class WalletPayFinesAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        try:
            wallet, total_paid = settle_all_unpaid_fines(request.user)
        except WalletOperationError as exc:
            payload = {'error': exc.message}
            payload.update(exc.extra)
            return Response(payload, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'message': f'تمامی جریمه‌های معوقه به مبلغ ${total_paid:.2f} با موفقیت تسویه شد.',
            'paid_amount': f'{total_paid:.2f}',
            'wallet': WalletSerializer(wallet).data,
        }, status=status.HTTP_200_OK)


class UserOrdersListAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        purchased = BookOrder.objects.filter(buyer=request.user).select_related('book', 'seller', 'buyer')
        sold = BookOrder.objects.filter(seller=request.user).select_related('book', 'seller', 'buyer')
        return Response({
            'purchased': BookOrderSerializer(purchased, many=True, context={'request': request}).data,
            'sold': BookOrderSerializer(sold, many=True, context={'request': request}).data,
        })


class ManagerFinanceStatsAPIView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        tx_type = request.query_params.get('tx_type', '').strip()
        search = request.query_params.get('search', '').strip()

        all_txs = WalletTransaction.objects.select_related('wallet__user', 'related_book', 'created_by')
        filtered_txs = all_txs
        if tx_type:
            filtered_txs = filtered_txs.filter(tx_type=tx_type)
        if search:
            filtered_txs = filtered_txs.filter(
                Q(wallet__user__username__icontains=search) |
                Q(reference_code__icontains=search) |
                Q(description__icontains=search) |
                Q(book_title_snapshot__icontains=search)
            )

        platform_revenue_total = quantize_money(
            all_txs.aggregate(s=Sum('platform_commission')).get('s') or ZERO
        )
        owner_payouts_total = quantize_money(
            all_txs.filter(tx_type='owner_earning').aggregate(s=Sum('amount')).get('s') or ZERO
        )
        purchase_volume_total = quantize_money(
            all_txs.filter(tx_type='purchase').aggregate(s=Sum('amount')).get('s') or ZERO
        )
        borrow_fees_total = quantize_money(
            all_txs.filter(tx_type__in=['borrow_fee', 'extend_fee']).aggregate(s=Sum('amount')).get('s') or ZERO
        )
        late_fees_collected_total = quantize_money(
            all_txs.filter(tx_type__in=['late_fee', 'fine_settlement']).aggregate(s=Sum('amount')).get('s') or ZERO
        )
        unpaid_fines_total = quantize_money(
            Borrowing.objects.filter(unpaid_fine__gt=ZERO).aggregate(s=Sum('unpaid_fine')).get('s') or ZERO
        )
        wallet_totals = Wallet.objects.aggregate(
            total_balance=Sum('balance'),
            total_locked=Sum('locked_balance'),
        )
        total_users_balance = quantize_money(wallet_totals.get('total_balance') or ZERO)
        total_locked_deposits = quantize_money(wallet_totals.get('total_locked') or ZERO)

        recent_orders = BookOrder.objects.select_related('book', 'buyer', 'seller')[:50]
        fin_settings = get_financial_settings()

        return Response({
            'summary': {
                'platform_revenue_total': f'{platform_revenue_total:.2f}',
                'owner_payouts_total': f'{owner_payouts_total:.2f}',
                'purchase_volume_total': f'{purchase_volume_total:.2f}',
                'borrow_fees_total': f'{borrow_fees_total:.2f}',
                'late_fees_collected_total': f'{late_fees_collected_total:.2f}',
                'unpaid_fines_total': f'{unpaid_fines_total:.2f}',
                'total_users_balance': f'{total_users_balance:.2f}',
                'total_locked_deposits': f'{total_locked_deposits:.2f}',
                'total_orders_count': BookOrder.objects.count(),
            },
            'settings': FinancialSettingsSerializer(fin_settings).data,
            'transactions': WalletTransactionSerializer(filtered_txs[:100], many=True).data,
            'orders': BookOrderSerializer(recent_orders, many=True, context={'request': request}).data,
        })


class SuperuserWalletAdjustAPIView(APIView):
    permission_classes = [IsSuperUser]

    def post(self, request):
        user_identifier = request.data.get('user_identifier') or request.data.get('user_id')
        action = request.data.get('action')
        amount = request.data.get('amount')
        reason = request.data.get('reason', '')

        target_user = resolve_user_from_identifier(user_identifier)
        if not target_user:
            return Response(
                {'error': 'کاربر مورد نظر یافت نشد.'},
                status=status.HTTP_404_NOT_FOUND
            )

        try:
            wallet, tx = adjust_wallet_by_admin(
                target_user=target_user,
                action=action,
                raw_amount=amount,
                reason=reason,
                admin_user=request.user,
            )
        except WalletOperationError as exc:
            payload = {'error': exc.message}
            payload.update(exc.extra)
            return Response(payload, status=status.HTTP_400_BAD_REQUEST)

        if tx:
            msg = f'تراکنش دستی برای کیف‌پول @{target_user.username} با موفقیت ثبت شد (موجودی جدید: ${wallet.balance:.2f}).'
        else:
            msg = f"وضعیت کیف‌پول @{target_user.username} به «{'مسدود' if wallet.is_frozen else 'فعال'}» تغییر یافت."

        return Response({
            'message': msg,
            'wallet': WalletSerializer(wallet).data,
            'transaction': WalletTransactionSerializer(tx).data if tx else None,
        }, status=status.HTTP_200_OK)


class SuperuserFinancialSettingsAPIView(APIView):
    permission_classes = [IsSuperUser]

    def get(self, request):
        fin_settings = get_financial_settings()
        return Response(FinancialSettingsSerializer(fin_settings).data)

    def patch(self, request):
        fin_settings = get_financial_settings()
        serializer = FinancialSettingsSerializer(fin_settings, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({
            'message': 'تعرفه‌ها و تنظیمات مالی فروشگاه با موفقیت بروزرسانی شد.',
            'settings': serializer.data,
        }, status=status.HTTP_200_OK)

