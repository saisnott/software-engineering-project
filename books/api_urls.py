from django.urls import path
from .api_views import (
    BookDetailAPIView,
    BookListCreateAPIView,
    BorrowBookAPIView,
    BorrowingHistoryAPIView,
    CategoryDetailAPIView,
    CategoryListCreateAPIView,
    CommentCreateAPIView,
    ExtendBorrowingAPIView,
    LibraryManagerStatsAPIView,
    NotificationListAPIView,
    NotificationMarkReadAPIView,
    ReturnBookAPIView,
    ToggleReservationAPIView,
    ToggleWishlistAPIView,
    UserDashboardAPIView,
)

app_name = 'books_api'

urlpatterns = [
    path('categories/', CategoryListCreateAPIView.as_view(), name='api_category_list'),
    path('categories/<int:pk>/', CategoryDetailAPIView.as_view(), name='api_category_detail'),
    path('books/', BookListCreateAPIView.as_view(), name='api_book_list_create'),
    path('books/<int:pk>/', BookDetailAPIView.as_view(), name='api_book_detail'),
    path('books/<int:book_id>/comments/', CommentCreateAPIView.as_view(), name='api_comment_create'),
    path('books/<int:pk>/borrow/', BorrowBookAPIView.as_view(), name='api_borrow_book'),
    path('books/<int:pk>/wishlist/', ToggleWishlistAPIView.as_view(), name='api_toggle_wishlist'),
    path('books/<int:pk>/reserve/', ToggleReservationAPIView.as_view(), name='api_toggle_reserve'),
    path('borrowings/history/', BorrowingHistoryAPIView.as_view(), name='api_borrowing_history'),
    path('borrowings/<int:pk>/return/', ReturnBookAPIView.as_view(), name='api_return_book'),
    path('borrowings/<int:pk>/extend/', ExtendBorrowingAPIView.as_view(), name='api_extend_borrowing'),
    path('notifications/', NotificationListAPIView.as_view(), name='api_notifications_list'),
    path('notifications/mark-read/', NotificationMarkReadAPIView.as_view(), name='api_notifications_mark_read'),
    path('dashboard/', UserDashboardAPIView.as_view(), name='api_user_dashboard'),
    path('manager/stats/', LibraryManagerStatsAPIView.as_view(), name='api_manager_stats'),
]
