from django.contrib import admin
from .models import (
    Book,
    BookCopy,
    Borrowing,
    Category,
    Comment,
    FinancialSettings,
    Wallet,
    WalletTransaction,
)


@admin.register(Book)
class BookAdmin(admin.ModelAdmin):
    list_display = ('title', 'author', 'user', 'price', 'approval_status', 'is_available', 'reviewed_by', 'reviewed_at')
    list_filter = ('approval_status', 'is_available', 'category')
    search_fields = ('title', 'author', 'user__username')


@admin.register(Wallet)
class WalletAdmin(admin.ModelAdmin):
    list_display = ('user', 'balance', 'locked_balance', 'is_frozen', 'updated_at')
    list_filter = ('is_frozen',)
    search_fields = ('user__username', 'user__email')


@admin.register(WalletTransaction)
class WalletTransactionAdmin(admin.ModelAdmin):
    list_display = ('reference_code', 'wallet', 'tx_type', 'direction', 'amount', 'platform_commission', 'created_at')
    list_filter = ('tx_type', 'direction', 'created_at')
    search_fields = ('reference_code', 'wallet__user__username', 'description')


admin.site.register(FinancialSettings)
admin.site.register(BookCopy)
admin.site.register(Comment)

@admin.register(Borrowing)
class BorrowingAdmin(admin.ModelAdmin):
    list_display = ('user', 'book', 'book_copy', 'borrow_date', 'due_date', 'status')
    list_filter = ('status', 'borrow_date')

@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'slug']
    prepopulated_fields = {'slug': ('name',)} # وقتی نام را تایپ می‌کنی، اسلاگ خودش پر می‌شود