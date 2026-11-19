from django.db.models import Avg
from django.utils import timezone
from rest_framework import serializers
from .models import Book, BookCopy, Borrowing, Category, Comment, Notification


def _can_view_borrower(request):
    user = getattr(request, 'user', None)
    return bool(user and user.is_authenticated and (user.is_staff or user.is_superuser))


def get_book_current_borrower(obj, request=None):
    if not _can_view_borrower(request):
        return None
    if hasattr(obj, 'prefetched_active_borrowings'):
        active_loans = obj.prefetched_active_borrowings
    else:
        active_loans = list(obj.borrowings.filter(return_date__isnull=True).select_related('user').order_by('id'))
    if not active_loans:
        return None
    names = []
    for loan in active_loans:
        if loan.user:
            full_name = f"{loan.user.first_name} {loan.user.last_name}".strip()
            name = full_name if full_name else loan.user.username
            if name not in names:
                names.append(name)
    return '، '.join(names) if names else None


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ['id', 'title', 'message', 'notif_type', 'link', 'is_read', 'created_at']
        read_only_fields = ['id', 'created_at']


class CategorySerializer(serializers.ModelSerializer):
    books_count = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ['id', 'name', 'slug', 'books_count']

    def get_books_count(self, obj):
        return obj.books.filter(approval_status='approved').count()


class CommentSerializer(serializers.ModelSerializer):
    username = serializers.ReadOnlyField(source='user.username')

    class Meta:
        model = Comment
        fields = ['id', 'user', 'username', 'book', 'text', 'rating', 'does_recommend', 'datetime_created']
        read_only_fields = ['id', 'user', 'book', 'datetime_created']

    def validate_rating(self, value):
        if value < 1 or value > 5:
            raise serializers.ValidationError("امتیاز باید عددی بین ۱ تا ۵ باشد.")
        return value


class BookCopySerializer(serializers.ModelSerializer):
    current_borrower = serializers.SerializerMethodField()
    current_borrowing_id = serializers.SerializerMethodField()

    class Meta:
        model = BookCopy
        fields = ['id', 'book', 'is_available', 'created_at', 'current_borrower', 'current_borrowing_id']
        read_only_fields = ['id', 'book', 'is_available', 'created_at', 'current_borrower', 'current_borrowing_id']

    def _get_active_borrowing(self, obj):
        if not _can_view_borrower(self.context.get('request')):
            return None
        if hasattr(obj, 'prefetched_active_borrowings'):
            active_list = obj.prefetched_active_borrowings
            return active_list[0] if active_list else None
        cache = getattr(self, '_active_borrowing_cache', None)
        if cache is None:
            cache = {}
            self._active_borrowing_cache = cache
        if obj.id not in cache:
            cache[obj.id] = obj.borrowings.filter(return_date__isnull=True).select_related('user').first()
        return cache[obj.id]

    def get_current_borrower(self, obj):
        if obj.is_available:
            return None
        active = self._get_active_borrowing(obj)
        if active and active.user:
            return active.user.username
        return None

    def get_current_borrowing_id(self, obj):
        if obj.is_available:
            return None
        active = self._get_active_borrowing(obj)
        return active.id if active else None


class BookListSerializer(serializers.ModelSerializer):
    book_code = serializers.SerializerMethodField()
    category_name = serializers.ReadOnlyField(source='category.name')
    category_slug = serializers.ReadOnlyField(source='category.slug')
    comments_count = serializers.SerializerMethodField()
    average_rating = serializers.SerializerMethodField()
    author_username = serializers.ReadOnlyField(source='user.username')
    is_wishlisted = serializers.SerializerMethodField()
    current_borrower = serializers.SerializerMethodField()
    total_borrows_count = serializers.IntegerField(source='borrowings.count', read_only=True)
    total_copies_count = serializers.SerializerMethodField()
    available_copies_count = serializers.SerializerMethodField()
    copies = serializers.SerializerMethodField()
    approval_status_label = serializers.SerializerMethodField()
    reviewed_by_username = serializers.ReadOnlyField(source='reviewed_by.username')

    class Meta:
        model = Book
        fields = [
            'id', 'book_code', 'title', 'author', 'description', 'price', 'covers', 'is_available',
            'approval_status', 'approval_status_label', 'rejection_reason',
            'reviewed_by', 'reviewed_by_username', 'reviewed_at', 'created_at',
            'category', 'category_name', 'category_slug', 'comments_count',
            'average_rating', 'user', 'author_username', 'is_wishlisted',
            'current_borrower', 'total_borrows_count',
            'total_copies_count', 'available_copies_count', 'copies'
        ]
        read_only_fields = [
            'id', 'book_code', 'user', 'is_available',
            'approval_status', 'approval_status_label', 'rejection_reason',
            'reviewed_by', 'reviewed_by_username', 'reviewed_at', 'created_at'
        ]

    def get_approval_status_label(self, obj):
        return obj.get_approval_status_display()

    def get_book_code(self, obj):
        return f"LIB-B{obj.id:04d}"

    def get_total_copies_count(self, obj):
        return len(obj.copies.all())

    def get_available_copies_count(self, obj):
        return sum(1 for c in obj.copies.all() if c.is_available)

    def get_copies(self, obj):
        return BookCopySerializer(obj.copies.all(), many=True, context=self.context).data

    def get_comments_count(self, obj):
        return obj.comments.filter(is_active=True).count()

    def get_average_rating(self, obj):
        avg = obj.comments.filter(is_active=True).aggregate(avg_val=Avg('rating'))['avg_val']
        return round(avg, 1) if avg is not None else None

    def get_is_wishlisted(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.wishlist.filter(id=request.user.id).exists()
        return False

    def get_current_borrower(self, obj):
        return get_book_current_borrower(obj, request=self.context.get('request'))


class BorrowingSerializer(serializers.ModelSerializer):
    book_details = BookListSerializer(source='book', read_only=True)
    copy_id = serializers.SerializerMethodField()
    is_copy_deleted = serializers.SerializerMethodField()
    username = serializers.ReadOnlyField(source='user.username')
    user_email = serializers.ReadOnlyField(source='user.email')
    borrower_name = serializers.SerializerMethodField()
    returned_by_username = serializers.ReadOnlyField(source='returned_by.username')
    returned_by_label = serializers.SerializerMethodField()
    duration_days = serializers.SerializerMethodField()
    is_late = serializers.SerializerMethodField()
    late_days = serializers.SerializerMethodField()

    class Meta:
        model = Borrowing
        fields = [
            'id', 'user', 'username', 'user_email', 'borrower_name', 'book',
            'book_copy', 'copy_id', 'is_copy_deleted', 'book_details', 'borrow_date', 'due_date', 'return_date',
            'status', 'is_extended', 'returned_by', 'returned_by_username',
            'returned_by_label', 'duration_days', 'is_late', 'late_days'
        ]
        read_only_fields = [
            'id', 'user', 'book_copy', 'copy_id', 'is_copy_deleted', 'borrow_date', 'return_date', 'status',
            'is_extended', 'returned_by'
        ]

    def get_copy_id(self, obj):
        return obj.book_copy_id or obj.copy_id_snapshot

    def get_is_copy_deleted(self, obj):
        return bool(obj.book_copy_id is None and obj.copy_id_snapshot is not None)

    def get_borrower_name(self, obj):
        if not obj.user:
            return 'کاربر ناشناس'
        full_name = f"{obj.user.first_name} {obj.user.last_name}".strip()
        return full_name if full_name else obj.user.username

    def get_returned_by_label(self, obj):
        if not obj.return_date:
            return None
        if not obj.returned_by:
            return 'ثبت سیستمی / کاربر'
        if obj.returned_by_id == obj.user_id:
            return 'توسط خود کاربر'
        return f"توسط مدیر (@{obj.returned_by.username})"

    def get_duration_days(self, obj):
        if not obj.borrow_date:
            return 1
        end_dt = obj.return_date or timezone.now()
        diff = (end_dt - obj.borrow_date).days
        return max(1, diff)

    def get_is_late(self, obj):
        if not obj.due_date:
            return False
        end_dt = obj.return_date or timezone.now()
        return end_dt > obj.due_date

    def get_late_days(self, obj):
        if not obj.due_date:
            return 0
        end_dt = obj.return_date or timezone.now()
        if end_dt <= obj.due_date:
            return 0
        return max(1, (end_dt - obj.due_date).days)


class BookDetailSerializer(serializers.ModelSerializer):
    book_code = serializers.SerializerMethodField()
    qr_payload = serializers.SerializerMethodField()
    category_details = CategorySerializer(source='category', read_only=True)
    comments = serializers.SerializerMethodField()
    average_rating = serializers.SerializerMethodField()
    ratings_count = serializers.SerializerMethodField()
    author_username = serializers.ReadOnlyField(source='user.username')
    is_borrowed_by_user = serializers.SerializerMethodField()
    is_wishlisted = serializers.SerializerMethodField()
    is_reserved_by_user = serializers.SerializerMethodField()
    waitlist_count = serializers.IntegerField(source='waitlist.count', read_only=True)
    related_books = serializers.SerializerMethodField()
    current_borrower = serializers.SerializerMethodField()
    total_borrows_count = serializers.IntegerField(source='borrowings.count', read_only=True)
    borrowing_history = serializers.SerializerMethodField()
    total_copies_count = serializers.SerializerMethodField()
    available_copies_count = serializers.SerializerMethodField()
    copies = serializers.SerializerMethodField()
    copies_count = serializers.IntegerField(write_only=True, required=False, min_value=1, max_value=100, default=1)
    approval_status_label = serializers.SerializerMethodField()
    reviewed_by_username = serializers.ReadOnlyField(source='reviewed_by.username')

    class Meta:
        model = Book
        fields = [
            'id', 'book_code', 'qr_payload', 'title', 'author', 'description', 'price', 'covers',
            'is_available', 'approval_status', 'approval_status_label', 'rejection_reason',
            'reviewed_by', 'reviewed_by_username', 'reviewed_at', 'created_at',
            'category', 'category_details', 'user',
            'author_username', 'comments', 'average_rating', 'ratings_count',
            'is_borrowed_by_user', 'is_wishlisted', 'is_reserved_by_user',
            'waitlist_count', 'related_books', 'current_borrower',
            'total_borrows_count', 'borrowing_history',
            'total_copies_count', 'available_copies_count', 'copies', 'copies_count'
        ]
        read_only_fields = [
            'id', 'book_code', 'qr_payload', 'user', 'is_available',
            'approval_status', 'approval_status_label', 'rejection_reason',
            'reviewed_by', 'reviewed_by_username', 'reviewed_at', 'created_at'
        ]

    def get_approval_status_label(self, obj):
        return obj.get_approval_status_display()

    def get_book_code(self, obj):
        return f"LIB-B{obj.id:04d}"

    def get_total_copies_count(self, obj):
        return len(obj.copies.all())

    def get_available_copies_count(self, obj):
        return sum(1 for c in obj.copies.all() if c.is_available)

    def get_copies(self, obj):
        return BookCopySerializer(obj.copies.all(), many=True, context=self.context).data

    def get_qr_payload(self, obj):
        return f"BOOKSTORE-BOOK:LIB-B{obj.id:04d}|ID:{obj.id}"

    def validate_price(self, value):
        if value < 0:
            raise serializers.ValidationError("قیمت کتاب نمی‌تواند منفی باشد.")
        return value

    def get_comments(self, obj):
        active_comments = obj.comments.filter(is_active=True).select_related('user').order_by('-datetime_created')
        return CommentSerializer(active_comments, many=True, context=self.context).data

    def get_average_rating(self, obj):
        avg = obj.comments.filter(is_active=True).aggregate(avg_val=Avg('rating'))['avg_val']
        return round(avg, 1) if avg is not None else None

    def get_ratings_count(self, obj):
        return obj.comments.filter(is_active=True).count()

    def get_is_borrowed_by_user(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return Borrowing.objects.filter(
                user=request.user,
                book=obj,
                return_date__isnull=True
            ).exists()
        return False

    def get_is_wishlisted(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.wishlist.filter(id=request.user.id).exists()
        return False

    def get_is_reserved_by_user(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.waitlist.filter(id=request.user.id).exists()
        return False

    def get_current_borrower(self, obj):
        return get_book_current_borrower(obj, request=self.context.get('request'))

    def get_borrowing_history(self, obj):
        request = self.context.get('request')
        if not (request and request.user.is_authenticated and (request.user.is_staff or request.user.is_superuser)):
            return []
        records = obj.borrowings.select_related('user', 'returned_by', 'book').order_by('-borrow_date')
        return BorrowingSerializer(records, many=True, context=self.context).data

    def get_related_books(self, obj):
        qs = Book.objects.select_related('category', 'user').filter(approval_status='approved').exclude(id=obj.id)
        if obj.category_id:
            same_cat = list(qs.filter(category_id=obj.category_id).order_by('-id')[:4])
            if len(same_cat) < 4:
                needed = 4 - len(same_cat)
                existing_ids = [b.id for b in same_cat] + [obj.id]
                others = list(
                    Book.objects.select_related('category', 'user')
                    .filter(approval_status='approved')
                    .exclude(id__in=existing_ids)
                    .order_by('-id')[:needed]
                )
                same_cat.extend(others)
            related = same_cat
        else:
            related = list(qs.order_by('-id')[:4])
        return BookListSerializer(related, many=True, context=self.context).data

