from datetime import timedelta
from django.db.models import Avg, F, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Book, Borrowing, Category, Comment, Notification
from .serializers import (
    BookDetailSerializer,
    BookListSerializer,
    BorrowingSerializer,
    CategorySerializer,
    CommentSerializer,
    NotificationSerializer,
)


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
        queryset = Book.objects.select_related('category', 'user').all()

        category_slug = self.request.query_params.get('category')
        if category_slug:
            queryset = queryset.filter(category__slug=category_slug)

        search_query = self.request.query_params.get('search')
        if search_query:
            queryset = queryset.filter(
                title__icontains=search_query
            ) | queryset.filter(
                author__icontains=search_query
            )

        status_filter = self.request.query_params.get('status')
        if status_filter == 'available':
            queryset = queryset.filter(is_available=True)

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
        serializer.save(user=self.request.user, is_available=True)


class BookDetailAPIView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Book.objects.select_related('category', 'user').prefetch_related('comments__user').all()
    serializer_class = BookDetailSerializer
    permission_classes = [IsOwnerOrReadOnly]

    def perform_destroy(self, instance):
        instance.delete()


class CommentCreateAPIView(generics.CreateAPIView):
    serializer_class = CommentSerializer
    permission_classes = [permissions.IsAuthenticated]

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
        book = get_object_or_404(Book, id=pk)

        if not book.is_available:
            return Response(
                {"error": "این کتاب در حال حاضر امانت داده شده است."},
                status=status.HTTP_400_BAD_REQUEST
            )

        existing = Borrowing.objects.filter(
            user=request.user,
            book=book,
            return_date__isnull=True
        ).exists()
        if existing:
            return Response(
                {"error": "شما قبلاً این کتاب را امانت گرفته‌اید."},
                status=status.HTTP_400_BAD_REQUEST
            )

        borrowing = Borrowing.objects.create(
            user=request.user,
            book=book,
            borrow_date=timezone.now(),
            status='borrowed'
        )

        book.is_available = False
        # Remove user from waitlist if they had reserved it
        book.waitlist.remove(request.user)
        book.save()

        Notification.objects.create(
            user=request.user,
            title='امانت کتاب ثبت شد',
            message=f"کتاب «{book.title}» با موفقیت برای شما به امانت ثبت شد. مهلت بازگشت: ۱۴ روز.",
            notif_type='borrow',
            link=f'/books/{book.id}'
        )

        return Response({
            "message": f"کتاب '{book.title}' با موفقیت امانت گرفته شد.",
            "borrowing": BorrowingSerializer(borrowing, context={'request': request}).data
        }, status=status.HTTP_201_CREATED)


class ReturnBookAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        if request.user.is_staff or request.user.is_superuser:
            borrowing = get_object_or_404(Borrowing, id=pk)
        else:
            borrowing = get_object_or_404(Borrowing, id=pk, user=request.user)

        if borrowing.return_date is not None:
            return Response(
                {"error": "این کتاب قبلاً تحویل داده شده است."},
                status=status.HTTP_400_BAD_REQUEST
            )

        borrowing.return_date = timezone.now()
        borrowing.status = 'returned'
        borrowing.returned_by = request.user
        borrowing.save()

        book = borrowing.book
        book.is_available = True
        book.save()

        days = max(1, (borrowing.return_date - borrowing.borrow_date).days) if borrowing.borrow_date else 1
        if request.user.id == borrowing.user_id:
            Notification.objects.create(
                user=borrowing.user,
                title='تحویل کتاب به کتابخانه',
                message=f"کتاب «{book.title}» پس از {days} روز مطالعه با موفقیت به کتابخانه بازگردانده شد.",
                notif_type='return',
                link=f'/books/{book.id}'
            )
        else:
            Notification.objects.create(
                user=borrowing.user,
                title='ثبت تحویل کتاب توسط مدیریت',
                message=f"تحویل کتاب «{book.title}» توسط مدیریت کتابخانه (@{request.user.username}) ثبت شد و از لیست امانت‌های فعال شما خارج گردید.",
                notif_type='return',
                link='/dashboard'
            )

        # Notify users waiting in the reservation waitlist for this book
        waitlist_users = list(book.waitlist.all())
        for w_user in waitlist_users:
            Notification.objects.create(
                user=w_user,
                title='موجود شدن کتاب رزرو شده!',
                message=f"مژده! کتاب «{book.title}» که در صف رزرو شما قرار داشت هم‌اکنون تحویل داده شد و آماده امانت‌گیری است.",
                notif_type='waitlist',
                link=f'/books/{book.id}'
            )

        return Response({
            "message": f"کتاب '{book.title}' با موفقیت به کتابخانه بازگردانده شد."
        }, status=status.HTTP_200_OK)


class ExtendBorrowingAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        borrowing = get_object_or_404(Borrowing, id=pk, user=request.user, return_date__isnull=True)

        if borrowing.is_extended:
            return Response(
                {"error": "مهلت امانت این کتاب قبلاً یک بار تمدید شده است."},
                status=status.HTTP_400_BAD_REQUEST
            )

        borrowing.due_date = borrowing.due_date + timedelta(days=7)
        borrowing.is_extended = True
        borrowing.save()

        Notification.objects.create(
            user=borrowing.user,
            title='تمدید مهلت امانت کتاب',
            message=f"مهلت امانت کتاب «{borrowing.book.title}» به مدت ۷ روز دیگر با موفقیت تمدید شد.",
            notif_type='extend',
            link='/dashboard'
        )

        return Response({
            "message": f"مهلت امانت کتاب '{borrowing.book.title}' به مدت ۷ روز تمدید شد.",
            "borrowing": BorrowingSerializer(borrowing, context={'request': request}).data
        }, status=status.HTTP_200_OK)


class ToggleWishlistAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        book = get_object_or_404(Book, id=pk)
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

        wishlist_books = request.user.wishlist_books.all()
        waitlist_books = request.user.waitlist_books.all()

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

        return Response({
            'current_borrowings': BorrowingSerializer(current_borrowings, many=True, context={'request': request}).data,
            'borrowing_history': BorrowingSerializer(borrowing_history, many=True, context={'request': request}).data,
            'wishlist': BookListSerializer(wishlist_books, many=True, context={'request': request}).data,
            'waitlist': BookListSerializer(waitlist_books, many=True, context={'request': request}).data,
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

        book_id = request.query_params.get('book_id')
        if book_id:
            qs = qs.filter(book_id=book_id)

        user_id = request.query_params.get('user_id')
        if user_id:
            qs = qs.filter(user_id=user_id)

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
        total_books = Book.objects.count()
        borrowed_count = Book.objects.filter(is_available=False).count()
        available_count = total_books - borrowed_count
        categories = Category.objects.all()
        categories_count = categories.count()
        recent_books = Book.objects.select_related('category', 'user').order_by('-id')[:20]

        active_borrowings = Borrowing.objects.filter(
            return_date__isnull=True
        ).select_related('book', 'user', 'returned_by').order_by('due_date')

        all_borrowings = Borrowing.objects.select_related('book', 'user', 'returned_by').order_by('-borrow_date')[:100]

        return Response({
            'total_books': total_books,
            'borrowed_count': borrowed_count,
            'available_count': available_count,
            'categories_count': categories_count,
            'recent_books': BookListSerializer(recent_books, many=True, context={'request': request}).data,
            'active_borrowings': BorrowingSerializer(active_borrowings, many=True, context={'request': request}).data,
            'all_borrowings': BorrowingSerializer(all_borrowings, many=True, context={'request': request}).data,
            'categories': CategorySerializer(categories, many=True).data,
        })


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
                if not Notification.objects.filter(user=request.user, notif_type='reminder', title=overdue_title).exists():
                    Notification.objects.create(
                        user=request.user,
                        title=overdue_title,
                        message=f"مهلت امانت کتاب «{loan.book.title}» به پایان رسیده است. لطفاً هرچه سریع‌تر نسبت به تحویل آن به کتابخانه اقدام فرمایید.",
                        notif_type='reminder',
                        link='/dashboard'
                    )
            elif 0 <= rem_days <= 2:
                due_title = f"یادآوری موعد بازگشت: «{loan.book.title}»"
                if not Notification.objects.filter(user=request.user, notif_type='reminder', title=due_title).exists():
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

