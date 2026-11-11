import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Filter, Layers, BookCheck, X, RotateCcw, ChevronRight, ChevronLeft } from 'lucide-react';
import api from '../api/client';
import { BookCard, BookCardSkeleton } from '../components/BookCard';
import { toPersianDigits } from '../utils/formatters';

const PAGE_SIZE = 8;

export const BookListPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [books, setBooks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  const selectedCategory = searchParams.get('category') || '';
  const search = searchParams.get('search') || '';
  const statusFilter = searchParams.get('status') || '';
  const sort = searchParams.get('sort') || 'newest';
  const currentPage = Math.max(1, parseInt(searchParams.get('page') || '1', 10));

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await api.get('/api/categories/');
        setCategories(res.data);
      } catch (err) {
        console.error('Error fetching categories', err);
      }
    };
    fetchCategories();
  }, []);

  useEffect(() => {
    const fetchBooks = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (selectedCategory) params.append('category', selectedCategory);
        if (search) params.append('search', search);
        if (statusFilter) params.append('status', statusFilter);
        if (sort) params.append('sort', sort);

        const res = await api.get(`/api/books/?${params.toString()}`);
        setBooks(res.data);
      } catch (err) {
        console.error('Error fetching books', err);
      } finally {
        setLoading(false);
      }
    };
    fetchBooks();
  }, [selectedCategory, search, statusFilter, sort]);

  const updateParam = (key, value) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set(key, value);
    } else {
      newParams.delete(key);
    }
    if (key !== 'page') {
      newParams.delete('page');
    }
    setSearchParams(newParams);
  };

  const totalPages = Math.max(1, Math.ceil(books.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;
  const paginatedBooks = books.slice(startIndex, startIndex + PAGE_SIZE);

  const hasActiveFilters = Boolean(selectedCategory || search || statusFilter || sort !== 'newest');

  return (
    <div className="container">
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '30px', fontWeight: 800, marginBottom: '6px' }}>
          کاتالوگ جامع کتاب‌ها
        </h1>
        <p style={{ color: 'var(--text-dim)', fontSize: '14.5px' }}>
          کتاب‌های موجود را مرور کنید، بر اساس دسته‌بندی فیلتر نمایید یا کتاب دلخواه خود را جستجو کنید.
        </p>
      </div>

      {/* Filter and Search Bar */}
      <div
        className="card"
        style={{
          marginBottom: '28px',
          padding: '20px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px'
        }}
      >
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* RTL Search Input */}
          <div className="search-input-wrapper">
            <Search size={17} className="search-input-icon" />
            <input
              type="text"
              className="form-control"
              placeholder="جستجو بر اساس عنوان کتاب یا نام نویسنده..."
              value={search}
              onChange={(e) => updateParam('search', e.target.value)}
            />
            {search && (
              <button
                type="button"
                className="search-input-clear"
                onClick={() => updateParam('search', '')}
                title="پاک کردن جستجو"
                aria-label="پاک کردن جستجو"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Sort Selector */}
          <div style={{ minWidth: '190px' }}>
            <select
              className="form-control"
              value={sort}
              onChange={(e) => updateParam('sort', e.target.value)}
              aria-label="مرتب‌سازی بر اساس"
            >
              <option value="newest">مرتب‌سازی: جدیدترین‌ها</option>
              <option value="price_low">قیمت: ارزان‌ترین به گران‌ترین</option>
              <option value="price_high">قیمت: گران‌ترین به ارزان‌ترین</option>
            </select>
          </div>

          {/* Availability Toggle */}
          <button
            type="button"
            className={statusFilter === 'available' ? 'btn-success' : 'btn-outline'}
            style={{ padding: '10px 16px', fontSize: '13.5px' }}
            onClick={() => updateParam('status', statusFilter === 'available' ? '' : 'available')}
          >
            <BookCheck size={16} />
            {statusFilter === 'available' ? 'نمایش: فقط کتاب‌های موجود' : 'فقط کتاب‌های موجود'}
          </button>

          {hasActiveFilters && (
            <button
              type="button"
              className="btn-outline"
              style={{ padding: '10px 14px', fontSize: '13px', color: 'var(--danger)' }}
              onClick={() => setSearchParams({})}
            >
              <RotateCcw size={14} />
              حذف فیلترها
            </button>
          )}
        </div>

        {/* Category Pills */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: '5px', marginLeft: '4px' }}>
            <Layers size={14} /> دسته‌بندی‌ها:
          </span>

          <button
            type="button"
            onClick={() => updateParam('category', '')}
            className="badge"
            style={{
              cursor: 'pointer',
              background: !selectedCategory ? 'var(--accent2)' : 'var(--surface2)',
              color: !selectedCategory ? '#fff' : 'var(--text-dim)',
              border: '1px solid var(--border-strong)',
              padding: '6px 14px',
              fontSize: '12.5px'
            }}
          >
            همه کتاب‌ها
          </button>

          {categories.map((cat) => {
            const isSelected = selectedCategory === cat.slug;
            return (
              <button
                type="button"
                key={cat.id}
                onClick={() => updateParam('category', isSelected ? '' : cat.slug)}
                className="badge"
                style={{
                  cursor: 'pointer',
                  background: isSelected ? 'var(--accent2)' : 'var(--surface2)',
                  color: isSelected ? '#fff' : 'var(--text-dim)',
                  border: '1px solid var(--border-strong)',
                  padding: '6px 14px',
                  fontSize: '12.5px'
                }}
              >
                {cat.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Book Grid */}
      {loading ? (
        <div className="books-grid">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <BookCardSkeleton key={n} />
          ))}
        </div>
      ) : books.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <Filter size={42} style={{ color: 'var(--muted)', margin: '0 auto 14px' }} />
          <h3 style={{ fontSize: '19px', marginBottom: '8px' }}>کتابی مطابق با فیلترهای شما یافت نشد</h3>
          <p style={{ color: 'var(--muted)', fontSize: '14px', marginBottom: '20px' }}>
            پیشنهاد می‌کنیم فیلترهای انتخاب‌شده را پاک کنید یا عبارت دیگری را جستجو نمایید.
          </p>
          <button
            type="button"
            className="btn-outline"
            style={{ margin: '0 auto' }}
            onClick={() => setSearchParams({})}
          >
            <RotateCcw size={15} />
            بازنشانی همه فیلترها
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', fontSize: '13.5px', color: 'var(--text-dim)', flexWrap: 'wrap', gap: '8px' }}>
            <span>
              نمایش <strong>{toPersianDigits(startIndex + 1)}</strong> تا{' '}
              <strong>{toPersianDigits(Math.min(startIndex + PAGE_SIZE, books.length))}</strong> از مجموع{' '}
              <strong>{toPersianDigits(books.length)}</strong> عنوان کتاب
            </span>
            {totalPages > 1 && (
              <span>
                صفحه {toPersianDigits(safePage)} از {toPersianDigits(totalPages)}
              </span>
            )}
          </div>

          <div className="books-grid">
            {paginatedBooks.map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '36px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-outline"
                disabled={safePage <= 1}
                onClick={() => updateParam('page', String(safePage - 1))}
                style={{ padding: '8px 14px', opacity: safePage <= 1 ? 0.5 : 1 }}
              >
                <ChevronRight size={16} />
                صفحه قبل
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => updateParam('page', String(pageNum))}
                  className={pageNum === safePage ? 'btn-primary' : 'btn-outline'}
                  style={{ minWidth: '40px', padding: '8px 12px' }}
                >
                  {toPersianDigits(pageNum)}
                </button>
              ))}

              <button
                type="button"
                className="btn-outline"
                disabled={safePage >= totalPages}
                onClick={() => updateParam('page', String(safePage + 1))}
                style={{ padding: '8px 14px', opacity: safePage >= totalPages ? 0.5 : 1 }}
              >
                صفحه بعد
                <ChevronLeft size={16} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
