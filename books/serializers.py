from django.db.models import Avg
from django.utils import timezone
from rest_framework import serializers
from .models import Book, Borrowing, Category, Comment, Notification


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ['id', 'title', 'message', 'notif_type', 'link', 'is_read', 'created_at']
        read_only_fields = ['id', 'created_at']


class CategorySerializer(serializers.ModelSerializer):
    books_count = serializers.IntegerField(source='books.count', read_only=True)

    class Meta:
        model = Category
        fields = ['id', 'name', 'slug', 'books_count']


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


class BookListSerializer(serializers.ModelSerializer):
    category_name = serializers.ReadOnlyField(source='category.name')
    category_slug = serializers.ReadOnlyField(source='category.slug')
    comments_count = serializers.SerializerMethodField()
    average_rating = serializers.SerializerMethodField()
    author_username = serializers.ReadOnlyField(source='user.username')
    is_wishlisted = serializers.SerializerMethodField()
    current_borrower = serializers.SerializerMethodField()
    total_borrows_count = serializers.IntegerField(source='borrowings.count', read_only=True)

    class Meta:
        model = Book
        fields = [
            'id', 'title', 'author', 'price', 'covers', 'is_available',
            'category', 'category_name', 'category_slug', 'comments_count',
            'average_rating', 'user', 'author_username', 'is_wishlisted',
            'current_borrower', 'total_borrows_count'
        ]
        read_only_fields = ['id', 'user', 'is_available']

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
        if obj.is_available:
            return None
        active = obj.borrowings.filter(return_date__isnull=True).select_related('user').first()
        if active and active.user:
            full_name = f"{active.user.first_name} {active.user.last_name}".strip()
            return full_name if full_name else active.user.username
        return None


class BorrowingSerializer(serializers.ModelSerializer):
    book_details = BookListSerializer(source='book', read_only=True)
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
            'book_details', 'borrow_date', 'due_date', 'return_date',
            'status', 'is_extended', 'returned_by', 'returned_by_username',
            'returned_by_label', 'duration_days', 'is_late', 'late_days'
        ]
        read_only_fields = [
            'id', 'user', 'borrow_date', 'return_date', 'status',
            'is_extended', 'returned_by'
        ]

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

    class Meta:
        model = Book
        fields = [
            'id', 'title', 'author', 'description', 'price', 'covers',
            'is_available', 'category', 'category_details', 'user',
            'author_username', 'comments', 'average_rating', 'ratings_count',
            'is_borrowed_by_user', 'is_wishlisted', 'is_reserved_by_user',
            'waitlist_count', 'related_books', 'current_borrower',
            'total_borrows_count', 'borrowing_history'
        ]
        read_only_fields = ['id', 'user', 'is_available']

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
        if obj.is_available:
            return None
        active = obj.borrowings.filter(return_date__isnull=True).select_related('user').first()
        if active and active.user:
            full_name = f"{active.user.first_name} {active.user.last_name}".strip()
            return full_name if full_name else active.user.username
        return None

    def get_borrowing_history(self, obj):
        request = self.context.get('request')
        if not (request and request.user.is_authenticated and (request.user.is_staff or request.user.is_superuser)):
            return []
        records = obj.borrowings.select_related('user', 'returned_by', 'book').order_by('-borrow_date')
        return BorrowingSerializer(records, many=True, context=self.context).data

    def get_related_books(self, obj):
        qs = Book.objects.select_related('category', 'user').exclude(id=obj.id)
        if obj.category_id:
            same_cat = list(qs.filter(category_id=obj.category_id).order_by('-id')[:4])
            if len(same_cat) < 4:
                needed = 4 - len(same_cat)
                existing_ids = [b.id for b in same_cat] + [obj.id]
                others = list(Book.objects.select_related('category', 'user').exclude(id__in=existing_ids).order_by('-id')[:needed])
                same_cat.extend(others)
            related = same_cat
        else:
            related = list(qs.order_by('-id')[:4])
        return BookListSerializer(related, many=True, context=self.context).data

