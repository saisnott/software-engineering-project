from django.contrib import admin
from .models import Book, Borrowing, Category, Comment

admin.site.register(Book)
admin.site.register(Comment)

@admin.register(Borrowing)
class BorrowingAdmin(admin.ModelAdmin):
    list_display = ('user', 'book', 'borrow_date', 'due_date', 'status')
    list_filter = ('status', 'borrow_date')

@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'slug']
    prepopulated_fields = {'slug': ('name',)} # وقتی نام را تایپ می‌کنی، اسلاگ خودش پر می‌شود