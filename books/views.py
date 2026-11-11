from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.contrib.auth.mixins import LoginRequiredMixin, UserPassesTestMixin
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse_lazy
from django.utils import timezone
from django.views import generic

from .forms import CommentForm
from .models import Book, Borrowing, Category


# ۱. داشبورد کاربر (پروفایل من)
@login_required
def user_dashboard_view(request):
    # کتاب‌هایی که اکنون در امانت کاربر هستند
    current_borrowings = Borrowing.objects.filter(
        user=request.user,
        return_date__isnull=True
    ).select_related('book').order_by('due_date')

    # تاریخچه کتاب‌های بازگردانده شده
    borrowing_history = Borrowing.objects.filter(
        user=request.user,
        return_date__isnull=False
    ).select_related('book').order_by('-return_date')

    # لیست علاقه‌مندی‌ها
    user_wishlist = request.user.wishlist_books.all()

    context = {
        'current_borrowings': current_borrowings,
        'borrowing_history': borrowing_history,
        'user_wishlist': user_wishlist,
    }
    return render(request, 'books/user_dashboard.html', context)


# ۲. داشبورد مدیریت کتابخانه
class LibraryManagerDashboardView(LoginRequiredMixin, UserPassesTestMixin, generic.TemplateView):
    template_name = 'books/manager_dashboard.html'

    def test_func(self):
        return self.request.user.is_staff or self.request.user.is_superuser

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['total_books'] = Book.objects.count()
        context['categories'] = Category.objects.all()
        context['borrowed_books_count'] = Book.objects.filter(is_available=False).count()
        context['recent_books'] = Book.objects.order_by('-id')[:5]
        return context


# ۳. لیست کتاب‌ها همراه با فیلترها
class BookListView(generic.ListView):
    model = Book
    template_name = 'books/book_list.html'
    context_object_name = 'books'
    paginate_by = 4

    def get_queryset(self):
        queryset = Book.objects.all()

        # فیلتر کردن بر اساس دسته‌بندی
        category_slug = self.request.GET.get('category')
        if category_slug:
            queryset = queryset.filter(category__slug=category_slug)

        # فیلتر کتاب‌های موجود
        status = self.request.GET.get('status')
        if status == 'available':
            queryset = queryset.filter(is_available=True)

            # فیلتر بر اساس جدیدترین‌ها
        sort = self.request.GET.get('sort')
        if sort == 'newest':
            queryset = queryset.order_by('-id')
        return queryset

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['categories'] = Category.objects.all()
        return context


# ۴. جزئیات کتاب
@login_required
def book_detail_view(request, pk):
    book = get_object_or_404(Book, id=pk)

    if request.method == 'POST':
        comment_form = CommentForm(request.POST)
        if comment_form.is_valid():
            new_comment = comment_form.save(commit=False)
            new_comment.book = book
            new_comment.user = request.user
            new_comment.save()
            messages.success(request, "دیدگاه شما با موفقیت ثبت شد.")
            return redirect('books:book_detail', pk=book.pk)

    is_borrowed_by_user = False
    if request.user.is_authenticated:
        is_borrowed_by_user = Borrowing.objects.filter(
            user=request.user,
            book=book,
            return_date__isnull=True
        ).exists()

    context = {
        'book': book,
        'is_borrowed_by_user': is_borrowed_by_user,
    }
    return render(request, 'books/book_detail.html', context)


# ۵. ساخت کتاب جدید (نسخه اصلاح شده شامل دسته‌بندی)
class BookCreateView(LoginRequiredMixin, generic.CreateView):
    model = Book
    fields = ['title', 'author', 'description', 'price', 'covers', 'category']
    template_name = 'books/book_create.html'

    def form_valid(self, form):
        form.instance.user = self.request.user
        return super().form_valid(form)


# ۶. ویرایش کتاب
class BookUpdateView(LoginRequiredMixin, UserPassesTestMixin, generic.UpdateView):
    model = Book
    fields = ['title', 'author', 'description', 'price', 'covers', 'category']
    template_name = 'books/book_update.html'

    def test_func(self):
        obj = self.get_object()
        return obj.user == self.request.user


# ۷. حذف کتاب
class BookDeleteView(LoginRequiredMixin, UserPassesTestMixin, generic.DeleteView):
    model = Book
    template_name = 'books/book_delete.html'
    success_url = reverse_lazy('books:book_list')

    def test_func(self):
        obj = self.get_object()
        return obj.user == self.request.user


# ۸. امانت گرفتن کتاب
@login_required
def borrow_book_view(request, pk):
    book = get_object_or_404(Book, id=pk)

    if not book.is_available:
        messages.error(request, "این کتاب در حال حاضر امانت داده شده است.")
        return redirect('books:user_dashboard')

    # ثبت تراکنش امانت
    Borrowing.objects.create(
        user=request.user,
        book=book,
        borrow_date=timezone.now()
    )

    # تغییر وضعیت خود کتاب
    book.is_available = False
    book.save()

    messages.success(request, f"کتاب '{book.title}' با موفقیت امانت گرفته شد.")
    return redirect('books:user_dashboard')


# ۹. پس دادن کتاب (نسخه نهایی هماهنگ با رکورد امانت داشبورد)
@login_required
def return_book_view(request, borrowing_id):
    # پیدا کردن رکورد امانت بر اساس آی‌آی تراکنش
    borrowing = get_object_or_404(Borrowing, id=borrowing_id, user=request.user)

    if borrowing.return_date is not None:
        messages.warning(request, "این کتاب قبلاً تحویل داده شده است.")
        return redirect('books:user_dashboard')

    # ثبت تاریخ برگشت کتاب و تغییر وضعیت تراکنش
    borrowing.return_date = timezone.now()
    if hasattr(borrowing, 'status'):
        borrowing.status = 'returned'
    borrowing.save()

    # موجود کردن دوباره کتاب در کتابخانه
    book = borrowing.book
    book.is_available = True
    book.save()

    messages.success(request, f"کتاب '{book.title}' با موفقیت به کتابخانه بازگردانده شد.")
    return redirect('books:user_dashboard')


# ۱۰. لیست کل امانت‌های کاربر
class UserBorrowingsListView(LoginRequiredMixin, generic.ListView):
    model = Borrowing
    template_name = 'books/user_borrowings.html'
    context_object_name = 'borrowings'

    def get_queryset(self):
        return Borrowing.objects.filter(user=self.request.user).order_by('-borrow_date')