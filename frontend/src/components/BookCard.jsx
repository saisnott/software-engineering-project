import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Book as BookIcon, MessageSquare, Heart, ArrowUpLeft, Star, Clock, XCircle } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatPrice, toPersianDigits } from '../utils/formatters';

export const BookCard = ({ book, onWishlistChange }) => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const approvalStatus = book.approval_status || 'approved';
  const isApproved = approvalStatus === 'approved';
  const expectedWishlist = isAuthenticated && isApproved && Boolean(book.is_wishlisted);
  const [wishlisted, setWishlisted] = useState(expectedWishlist);
  const [syncKey, setSyncKey] = useState(`${book.id}:${expectedWishlist}`);
  const [togglingWishlist, setTogglingWishlist] = useState(false);

  const nextSyncKey = `${book.id}:${expectedWishlist}`;
  if (syncKey !== nextSyncKey) {
    setSyncKey(nextSyncKey);
    setWishlisted(expectedWishlist);
  }

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
          {approvalStatus === 'pending' ? (
            <span
              className="badge badge-category"
              style={{
                backdropFilter: 'blur(8px)',
                background: 'var(--surface-glass)',
                borderColor: 'rgba(232, 168, 56, 0.65)',
                color: 'var(--accent2)'
              }}
            >
              <Clock size={12} />
              در انتظار تأیید (Pending)
            </span>
          ) : approvalStatus === 'rejected' ? (
            <span
              className="badge badge-borrowed"
              style={{ backdropFilter: 'blur(8px)', background: 'var(--surface-glass)' }}
            >
              <XCircle size={12} />
              رد شده توسط مدیریت
            </span>
          ) : book.is_available ? (
            <span className="badge badge-available" style={{ backdropFilter: 'blur(8px)', background: 'var(--surface-glass)' }}>
              {book.total_copies_count > 1
                ? `موجود در قفسه (${toPersianDigits(book.available_copies_count)} از ${toPersianDigits(book.total_copies_count)})`
                : 'موجود در قفسه'}
            </span>
          ) : book.total_copies_count === 0 && book.sold_copies_count > 0 ? (
            <span className="badge badge-borrowed" style={{ backdropFilter: 'blur(8px)', background: 'var(--surface-glass)' }}>
              ناموجود (فروخته شده)
            </span>
          ) : (
            <span className="badge badge-borrowed" style={{ backdropFilter: 'blur(8px)', background: 'var(--surface-glass)' }}>
              {book.total_copies_count > 1
                ? `امانت داده شده (${toPersianDigits(0)} از ${toPersianDigits(book.total_copies_count)})`
                : 'امانت داده شده'}
            </span>
          )}

          {isApproved && (
            <button
              type="button"
              onClick={handleWishlistClick}
              className={`wishlist-btn ${wishlisted ? 'active' : ''}`}
              title={wishlisted ? 'حذف از علاقه‌مندی‌ها' : 'افزودن به علاقه‌مندی‌ها'}
              aria-label={wishlisted ? 'حذف از علاقه‌مندی‌ها' : 'افزودن به علاقه‌مندی‌ها'}
            >
              <Heart size={16} fill={wishlisted ? 'currentColor' : 'none'} />
            </button>
          )}
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
