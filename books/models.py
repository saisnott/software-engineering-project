from datetime import timedelta

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
    # رابطه را به تنظیمات جنگو متصل می‌کنیم تا خودش مدل کاربر درست را پیدا کند
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    title = models.CharField(max_length=200)
    author = models.CharField(max_length=200)
    description = models.TextField()
    price = models.DecimalField(max_digits=10, decimal_places=2)
    covers = models.ImageField(upload_to='covers/', blank=True)
    is_available = models.BooleanField(default=True)

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


class Comment(models.Model):
    text = models.TextField()
    rating = models.PositiveSmallIntegerField(default=5)
    datetime_created = models.DateTimeField(auto_now_add=True)
    user = models.ForeignKey(get_user_model(), on_delete=models.CASCADE)
    book = models.ForeignKey(Book, on_delete=models.CASCADE, related_name='comments')
    is_active = models.BooleanField(default=True)
    does_recommend = models.BooleanField(default=False)

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
