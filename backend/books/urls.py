from django.urls import path
from . import views

app_name = 'books'

urlpatterns = [
    # مسیرهای اصلی کتاب‌ها
    path('', views.BookListView.as_view(), name='book_list'),
    path('<int:pk>/', views.book_detail_view, name='book_detail'),
    path('create/', views.BookCreateView.as_view(), name='book_create'),
    path('<int:pk>/update/', views.BookUpdateView.as_view(), name='book_update'),
    path('<int:pk>/delete/', views.BookDeleteView.as_view(), name='book_delete'),

    # مسیرهای داشبوردها
    path('dashboard/', views.user_dashboard_view, name='user_dashboard'),
    path('manager/dashboard/', views.LibraryManagerDashboardView.as_view(), name='manager_dashboard'),

    # مسیرهای عملیات امانت و پس دادن کتاب
    path('<int:pk>/borrow/', views.borrow_book_view, name='borrow_book'),
    path('return/<int:borrowing_id>/', views.return_book_view, name='return_book'),
]