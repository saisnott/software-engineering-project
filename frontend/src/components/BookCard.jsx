import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Book as BookIcon, MessageSquare, Heart, ArrowUpLeft, Star } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatPrice, toPersianDigits } from '../utils/formatters';

export const BookCard = ({ book, onWishlistChange }) => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [wishlisted, setWishlisted] = useState(Boolean(book.is_wishlisted));
  const [togglingWishlist, setTogglingWishlist] = useState(false);

  const handleWishlistClick = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    if (togglingWishlist) return;

    const prev = wishlisted;
    setWishlisted(!prev);
    setTogglingWishlist(true);

    try {
      const res = await api.post(`/api/books/${book.id}/wishlist/`);
      setWishlisted(res.data.is_wishlisted);
      if (onWishlistChange) {
        onWishlistChange(book.id, res.data.is_wishlisted);
      }
    } catch {
      setWishlisted(prev);
    } finally {
      setTogglingWishlist(false);
    }
  };

  return (
    <div className="book-card">
      <div className="book-card-cover-wrap">
        <div className="book-card-top-badges">
          {book.is_available ? (
            <span className="badge badge-available" style={{ backdropFilter: 'blur(8px)', background: 'var(--surface-glass)' }}>
              موجود در قفسه
            </span>
          ) : (
            <span className="badge badge-borrowed" style={{ backdropFilter: 'blur(8px)', background: 'var(--surface-glass)' }}>
              امانت داده شده
            </span>
          )}

          <button
            type="button"
            onClick={handleWishlistClick}
            className={`wishlist-btn ${wishlisted ? 'active' : ''}`}
            title={wishlisted ? 'حذف از علاقه‌مندی‌ها' : 'افزودن به علاقه‌مندی‌ها'}
            aria-label={wishlisted ? 'حذف از علاقه‌مندی‌ها' : 'افزودن به علاقه‌مندی‌ها'}
          >
            <Heart size={16} fill={wishlisted ? 'currentColor' : 'none'} />
          </button>
        </div>

        <Link to={`/books/${book.id}`} className="book-card-cover">
          {book.covers ? (
            <img src={book.covers} alt={book.title} loading="lazy" />
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--muted)' }}>
              <BookIcon size={44} style={{ opacity: 0.4, marginBottom: '6px' }} />
              <div style={{ fontSize: '12px' }}>بدون تصویر جلد</div>
            </div>
          )}
        </Link>
      </div>

      <div className="book-card-body">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px', minHeight: '24px' }}>
          {book.category_name ? (
            <span className="badge badge-category">{book.category_name}</span>
          ) : (
            <span />
          )}

          {book.average_rating && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '12.5px',
                fontWeight: 700,
                color: 'var(--accent2)'
              }}
              title="میانگین امتیاز کاربران"
            >
              <Star size={13} fill="var(--accent2)" color="var(--accent2)" />
              {toPersianDigits(book.average_rating)}
            </span>
          )}
        </div>

        <Link to={`/books/${book.id}`} className="book-card-title" title={book.title}>
          {book.title}
        </Link>

        <div className="book-card-author">اثر {book.author}</div>

        <div className="book-card-footer">
          <span className="price">{formatPrice(book.price)}</span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {book.comments_count > 0 && (
              <span
                style={{ fontSize: '12.5px', color: 'var(--text-dim)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                title="تعداد دیدگاه‌ها"
              >
                <MessageSquare size={13} /> {toPersianDigits(book.comments_count)}
              </span>
            )}

            <Link
              to={`/books/${book.id}`}
              className="btn-outline"
              style={{ padding: '5px 10px', fontSize: '12px', borderRadius: '6px' }}
            >
              مشاهده
              <ArrowUpLeft size={13} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export const BookCardSkeleton = () => (
  <div className="book-card" aria-hidden="true">
    <div className="skeleton-box" style={{ height: '270px', borderRadius: 0 }} />
    <div className="book-card-body" style={{ gap: '10px' }}>
      <div className="skeleton-box" style={{ width: '70px', height: '20px', borderRadius: '50px' }} />
      <div className="skeleton-box" style={{ width: '85%', height: '22px' }} />
      <div className="skeleton-box" style={{ width: '55%', height: '16px' }} />
      <div style={{ marginTop: 'auto', paddingTop: '12px', display: 'flex', justifyContent: 'space-between' }}>
        <div className="skeleton-box" style={{ width: '60px', height: '22px' }} />
        <div className="skeleton-box" style={{ width: '75px', height: '28px' }} />
      </div>
    </div>
  </div>
);
