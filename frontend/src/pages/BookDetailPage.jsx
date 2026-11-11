import React, { useEffect, useState, useRef, useId } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Book as BookIcon,
  ArrowRight,
  Clock,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Send,
  Pencil,
  Trash2,
  BookCheck,
  CheckCircle,
  AlertCircle,
  Heart,
  AlertTriangle,
  Star,
  BellPlus,
  BellOff,
  Sparkles
} from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { BookCard } from '../components/BookCard';
import { formatPrice, formatPersianDate, toPersianDigits } from '../utils/formatters';

export const BookDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { showToast, refreshNotifications } = useNotifications();
  const dialogRef = useRef(null);
  const dialogTitleId = useId();

  const [book, setBook] = useState(null);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [doesRecommend, setDoesRecommend] = useState(true);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [borrowing, setBorrowing] = useState(false);
  const [reserving, setReserving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [togglingWishlist, setTogglingWishlist] = useState(false);
  const [message, setMessage] = useState(null);

  const fetchBook = async (shouldScrollTop = false) => {
    try {
      const res = await api.get(`/api/books/${id}/`);
      setBook(res.data);
    } catch (err) {
      console.error('Error fetching book detail', err);
    } finally {
      setLoading(false);
      if (shouldScrollTop) {
        requestAnimationFrame(() => {
          window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        });
      }
    }
  };

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    setLoading(true);
    setMessage(null);
    fetchBook(true);
  }, [id]);

  // Fallback for browsers without native <dialog closedby="any"> support
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (!('closedBy' in HTMLDialogElement.prototype)) {
      const handleDialogClick = (event) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;

        if (isDialogContent) return;
        dialog.close();
      };

      dialog.addEventListener('click', handleDialogClick);
      return () => dialog.removeEventListener('click', handleDialogClick);
    }
  }, [book]);

  const handleBorrow = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    setBorrowing(true);
    setMessage(null);
    try {
      const res = await api.post(`/api/books/${id}/borrow/`);
      setMessage({ type: 'success', text: res.data.message });
      showToast(res.data.message, 'success');
      await fetchBook();
      await refreshNotifications();
    } catch (err) {
      const errMsg = err.response?.data?.error || 'خطا در ثبت درخواست امانت کتاب.';
      setMessage({ type: 'danger', text: errMsg });
      showToast(errMsg, 'danger');
    } finally {
      setBorrowing(false);
    }
  };

  const handleReserveToggle = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    if (reserving) return;
    setReserving(true);
    setMessage(null);
    try {
      const res = await api.post(`/api/books/${id}/reserve/`);
      setBook((prev) =>
        prev
          ? {
              ...prev,
              is_reserved_by_user: res.data.is_reserved_by_user,
              waitlist_count: res.data.waitlist_count,
            }
          : prev
      );
      setMessage({ type: 'success', text: res.data.message });
      showToast(res.data.message, 'info');
    } catch (err) {
      const errMsg = err.response?.data?.error || 'خطا در ثبت نوبت رزرو.';
      setMessage({ type: 'danger', text: errMsg });
      showToast(errMsg, 'danger');
    } finally {
      setReserving(false);
    }
  };

  const handleWishlistToggle = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    if (togglingWishlist) return;
    setTogglingWishlist(true);
    try {
      const res = await api.post(`/api/books/${id}/wishlist/`);
      setBook((prev) => (prev ? { ...prev, is_wishlisted: res.data.is_wishlisted } : prev));
      setMessage({ type: 'success', text: res.data.message });
    } catch {
      setMessage({ type: 'danger', text: 'خطا در بروزرسانی لیست علاقه‌مندی‌ها.' });
    } finally {
      setTogglingWishlist(false);
    }
  };

  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;

    setSubmittingComment(true);
    try {
      await api.post(`/api/books/${id}/comments/`, {
        text: commentText,
        rating,
        does_recommend: doesRecommend,
      });
      setCommentText('');
      setRating(5);
      setDoesRecommend(true);
      await fetchBook();
      setMessage({ type: 'success', text: 'دیدگاه و امتیاز شما با موفقیت ثبت شد.' });
      showToast('دیدگاه و امتیاز شما با موفقیت ثبت شد.', 'success');
      await refreshNotifications();
    } catch (err) {
      console.error('Error submitting comment', err);
      setMessage({ type: 'danger', text: 'خطا در ثبت دیدگاه.' });
      showToast('خطا در ثبت دیدگاه.', 'danger');
    } finally {
      setSubmittingComment(false);
    }
  };

  const openDeleteModal = () => {
    if (dialogRef.current) {
      dialogRef.current.showModal();
    }
  };

  const confirmDeleteBook = async () => {
    setDeleting(true);
    try {
      await api.delete(`/api/books/${id}/`);
      if (dialogRef.current) dialogRef.current.close();
      showToast(`کتاب «${book?.title || ''}» با موفقیت حذف شد.`, 'info');
      navigate('/books');
    } catch {
      if (dialogRef.current) dialogRef.current.close();
      setMessage({ type: 'danger', text: 'خطا در حذف کتاب. لطفاً دوباره تلاش کنید.' });
      showToast('خطا در حذف کتاب.', 'danger');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="container">
        <div className="skeleton-box" style={{ width: '140px', height: '22px', marginBottom: '24px' }} />
        <div className="card" style={{ padding: '32px' }}>
          <div className="book-detail-grid">
            <div className="skeleton-box" style={{ height: '350px', borderRadius: '14px' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="skeleton-box" style={{ width: '90px', height: '24px', borderRadius: '50px' }} />
              <div className="skeleton-box" style={{ width: '65%', height: '36px' }} />
              <div className="skeleton-box" style={{ width: '40%', height: '20px' }} />
              <div className="skeleton-box" style={{ width: '100%', height: '120px' }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="container" style={{ textAlign: 'center', padding: '80px 0' }}>
        <h2 style={{ marginBottom: '12px' }}>کتاب مورد نظر یافت نشد</h2>
        <Link to="/books" className="btn-outline" style={{ marginTop: '12px' }}>
          <ArrowRight size={16} /> بازگشت به کاتالوگ
        </Link>
      </div>
    );
  }

  const isOwner = user && (user.id === book.user || user.is_staff || user.is_superuser);
  const commentsList = book.comments || [];
  const relatedBooks = book.related_books || [];

  return (
    <div className="container">
      <Link
        to="/books"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '7px',
          color: 'var(--text-dim)',
          fontSize: '14px',
          fontWeight: 500,
          marginBottom: '22px'
        }}
      >
        <ArrowRight size={16} /> بازگشت به کاتالوگ کتاب‌ها
      </Link>

      {message && (
        <div className={`alert alert-${message.type}`}>
          {message.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Main Book Card */}
      <div className="card" style={{ padding: '32px', marginBottom: '44px' }}>
        <div className="book-detail-grid">
          {/* Cover Column */}
          <div className="book-detail-cover-col">
            <div
              style={{
                width: '100%',
                height: '350px',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                background: 'var(--surface2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: 'var(--shadow-lg)',
                border: '1px solid var(--border-strong)'
              }}
            >
              {book.covers ? (
                <img src={book.covers} alt={book.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <BookIcon size={64} style={{ opacity: 0.3 }} />
              )}
            </div>

            <div style={{ marginTop: '18px', textAlign: 'center' }}>
              <div className="price" style={{ fontSize: '26px', marginBottom: '8px' }}>
                {formatPrice(book.price)}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                {book.is_available ? (
                  <span className="badge badge-available" style={{ fontSize: '12.5px', padding: '6px 14px' }}>
                    موجود و آماده امانت
                  </span>
                ) : (
                  <span className="badge badge-borrowed" style={{ fontSize: '12.5px', padding: '6px 14px' }}>
                    در حال حاضر امانت داده شده
                  </span>
                )}

                {!book.is_available && book.current_borrower && (
                  <span style={{ fontSize: '12.5px', color: 'var(--accent2)', fontWeight: 600 }}>
                    امانت‌گیرنده فعلی: {book.current_borrower}
                  </span>
                )}

                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                  تاکنون {toPersianDigits(book.total_borrows_count || 0)} بار امانت گرفته شده
                </span>

                {!book.is_available && book.waitlist_count > 0 && (
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                    {toPersianDigits(book.waitlist_count)} نفر در صف رزرو
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Details Column */}
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
              {book.category_details ? (
                <Link to={`/books?category=${book.category_details.slug}`} className="badge badge-category">
                  {book.category_details.name}
                </Link>
              ) : (
                <span />
              )}

              {book.average_rating && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'var(--accent-soft)',
                    border: '1px solid rgba(232, 168, 56, 0.3)',
                    padding: '4px 12px',
                    borderRadius: '50px',
                    fontSize: '13px',
                    fontWeight: 700,
                    color: 'var(--accent2)'
                  }}
                >
                  <Star size={15} fill="var(--accent2)" color="var(--accent2)" />
                  <span>{toPersianDigits(book.average_rating)} از ۵</span>
                  <span style={{ color: 'var(--muted)', fontWeight: 500, fontSize: '12px' }}>
                    ({toPersianDigits(book.ratings_count)} رأی)
                  </span>
                </div>
              )}
            </div>

            <h1 style={{ fontSize: 'clamp(24px, 3vw, 34px)', fontWeight: 800, marginBottom: '10px' }}>
              {book.title}
            </h1>

            <div style={{ fontSize: '15px', color: 'var(--text-dim)', marginBottom: '22px' }}>
              نویسنده: <strong style={{ color: 'var(--text)' }}>{book.author}</strong>
              {book.author_username && (
                <span style={{ fontSize: '13px', color: 'var(--muted)', marginRight: '10px' }}>
                  (ثبت‌شده توسط کاربر @{book.author_username})
                </span>
              )}
            </div>

            <div
              className="pretty-text"
              style={{
                fontSize: '15px',
                color: 'var(--text-dim)',
                lineHeight: '1.9',
                whiteSpace: 'pre-line',
                marginBottom: '28px',
                flex: 1
              }}
            >
              {book.description}
            </div>

            {/* Actions Bar */}
            <div
              style={{
                display: 'flex',
                gap: '12px',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                paddingTop: '22px',
                borderTop: '1px solid var(--border)'
              }}
            >
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                {book.is_borrowed_by_user ? (
                  <div className="badge badge-available" style={{ padding: '10px 18px', fontSize: '13.5px' }}>
                    <CheckCircle size={16} /> این کتاب هم‌اکنون در امانت شماست
                  </div>
                ) : book.is_available ? (
                  <button
                    type="button"
                    onClick={handleBorrow}
                    disabled={borrowing}
                    className="btn-primary"
                    style={{ padding: '11px 22px' }}
                  >
                    <BookCheck size={17} />
                    {borrowing ? 'در حال ثبت امانت...' : 'امانت گرفتن کتاب (۱۴ روزه)'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleReserveToggle}
                    disabled={reserving}
                    className={book.is_reserved_by_user ? 'btn-danger' : 'btn-primary'}
                    style={{ padding: '10px 20px' }}
                  >
                    {book.is_reserved_by_user ? (
                      <>
                        <BellOff size={16} />
                        {reserving ? 'در حال لغو...' : 'لغو نوبت رزرو (در صف انتظار)'}
                      </>
                    ) : (
                      <>
                        <BellPlus size={16} />
                        {reserving ? 'در حال ثبت رزرو...' : 'رزرو در صف انتظار'}
                      </>
                    )}
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleWishlistToggle}
                  disabled={togglingWishlist}
                  className={book.is_wishlisted ? 'btn-danger' : 'btn-outline'}
                  style={{ padding: '10px 16px' }}
                >
                  <Heart size={16} fill={book.is_wishlisted ? 'currentColor' : 'none'} />
                  {book.is_wishlisted ? 'در لیست علاقه‌مندی‌ها' : 'افزودن به علاقه‌مندی‌ها'}
                </button>
              </div>

              {isOwner && (
                <div style={{ display: 'flex', gap: '10px' }}>
                  <Link to={`/books/${book.id}/edit`} className="btn-outline" style={{ padding: '8px 16px', fontSize: '13.5px' }}>
                    <Pencil size={15} /> ویرایش
                  </Link>
                  <button
                    type="button"
                    onClick={openDeleteModal}
                    className="btn-danger"
                    style={{ padding: '8px 16px', fontSize: '13.5px' }}
                  >
                    <Trash2 size={15} /> حذف کتاب
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Native Accessible Modal Dialog for Delete Confirmation */}
      <dialog
        ref={dialogRef}
        className="confirm-dialog"
        aria-labelledby={dialogTitleId}
        {...({ closedby: 'any' })}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--danger)' }}>
          <AlertTriangle size={26} />
          <h2 id={dialogTitleId} style={{ fontSize: '19px', fontWeight: 800 }}>
            تأیید حذف دائمی کتاب
          </h2>
        </div>

        <p style={{ color: 'var(--text-dim)', fontSize: '14.5px', lineHeight: '1.8' }}>
          آیا از حذف دائمی کتاب <strong>«{book.title}»</strong> اطمینان دارید؟ این عملیات قابل بازگشت نیست.
        </p>

        <form
          method="dialog"
          style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}
        >
          <button
            type="submit"
            value="cancel"
            autoFocus
            className="btn-outline"
          >
            انصراف
          </button>
          <button
            type="button"
            onClick={confirmDeleteBook}
            disabled={deleting}
            className="btn-danger"
          >
            <Trash2 size={15} />
            {deleting ? 'در حال حذف...' : 'بله، حذف شود'}
          </button>
        </form>
      </dialog>

      {/* Discussion & Reviews Section */}
      <div style={{ marginBottom: '60px' }}>
        <h3 style={{ fontSize: '21px', fontWeight: 800, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MessageSquare size={22} color="var(--accent2)" />
          دیدگاه‌ها و نقد کاربران ({toPersianDigits(commentsList.length)})
        </h3>

        {/* Existing Comments */}
        {commentsList.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '28px' }}>
            {commentsList.map((comment) => (
              <div key={comment.id} className="card" style={{ padding: '20px 24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className="user-pill-avatar">
                      {comment.username?.[0]?.toUpperCase() || 'U'}
                    </span>
                    <span style={{ fontWeight: 700, color: 'var(--accent2)', fontSize: '14px' }}>
                      @{comment.username}
                    </span>

                    {/* Reviewer Star Rating */}
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', marginRight: '6px' }}>
                      {[1, 2, 3, 4, 5].map((starNum) => (
                        <Star
                          key={starNum}
                          size={14}
                          fill={starNum <= (comment.rating || 5) ? 'var(--accent2)' : 'none'}
                          color={starNum <= (comment.rating || 5) ? 'var(--accent2)' : 'var(--muted)'}
                        />
                      ))}
                    </div>
                  </div>
                  <span style={{ fontSize: '12.5px', color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                    <Clock size={13} />
                    {formatPersianDate(comment.datetime_created)}
                  </span>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  {comment.does_recommend ? (
                    <span className="badge badge-available">
                      <ThumbsUp size={12} /> مطالعه این کتاب را پیشنهاد می‌کند
                    </span>
                  ) : (
                    <span className="badge badge-borrowed">
                      <ThumbsDown size={12} /> مطالعه این کتاب را پیشنهاد نمی‌کند
                    </span>
                  )}
                </div>

                <p style={{ color: 'var(--text-dim)', fontSize: '14.5px', whiteSpace: 'pre-line', lineHeight: '1.85' }}>
                  {comment.text}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="card" style={{ textAlign: 'center', padding: '38px', color: 'var(--muted)', marginBottom: '28px' }}>
            هنوز دیدگاهی برای این کتاب ثبت نشده است. اولین نفری باشید که نظر خود را می‌نویسید!
          </div>
        )}

        {/* Add Comment Form */}
        {isAuthenticated ? (
          <div className="card" style={{ padding: '26px' }}>
            <h4 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px' }}>ثبت دیدگاه و امتیاز جدید</h4>
            <form onSubmit={handleCommentSubmit}>
              {/* 5-Star Rating Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-dim)' }}>
                  امتیاز شما به این کتاب:
                </span>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  {[1, 2, 3, 4, 5].map((starNum) => {
                    const active = starNum <= (hoverRating || rating);
                    return (
                      <button
                        key={starNum}
                        type="button"
                        onClick={() => setRating(starNum)}
                        onMouseEnter={() => setHoverRating(starNum)}
                        onMouseLeave={() => setHoverRating(0)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: '4px',
                          display: 'inline-flex',
                          transition: 'transform 0.15s'
                        }}
                        aria-label={`${toPersianDigits(starNum)} ستاره`}
                      >
                        <Star
                          size={22}
                          fill={active ? 'var(--accent2)' : 'none'}
                          color={active ? 'var(--accent2)' : 'var(--muted)'}
                        />
                      </button>
                    );
                  })}
                </div>
                <span className="badge badge-category">
                  {toPersianDigits(rating)} از ۵ ستاره
                </span>
              </div>

              <div className="form-group">
                <textarea
                  className="form-control"
                  rows={3}
                  placeholder="نظر صادقانه و تجربه خود از خواندن این کتاب را با دیگران به اشتراک بگذارید..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', color: 'var(--text-dim)' }}>
                  <input
                    type="checkbox"
                    checked={doesRecommend}
                    onChange={(e) => setDoesRecommend(e.target.checked)}
                  />
                  <span>مطالعه این کتاب را به دیگران پیشنهاد می‌کنم</span>
                </label>

                <button
                  type="submit"
                  disabled={submittingComment}
                  className="btn-primary"
                  style={{ padding: '9px 22px', fontSize: '14px' }}
                >
                  <Send size={15} />
                  {submittingComment ? 'در حال ارسال...' : 'ارسال دیدگاه و امتیاز'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="card" style={{ textAlign: 'center', padding: '24px' }}>
            <p style={{ color: 'var(--text-dim)', fontSize: '14.5px' }}>
              برای ثبت دیدگاه و امتیاز درباره این کتاب، لطفاً ابتدا{' '}
              <Link to="/login" style={{ color: 'var(--accent2)', fontWeight: 700 }}>
                وارد حساب کاربری خود شوید
              </Link>
              .
            </p>
          </div>
        )}
      </div>

      {/* Admin/Staff Book Circulation History Section */}
      {user && (user.is_staff || user.is_superuser) && (
        <div className="card" style={{ padding: '24px', marginBottom: '44px', borderColor: 'rgba(232, 168, 56, 0.35)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
            <div>
              <h3 style={{ fontSize: '19px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={20} color="var(--accent2)" />
                سابقه گردش و امانت‌گیرندگان این کتاب (ویژه مدیریت)
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>
                لیست تمامی کاربرانی که این کتاب را امانت گرفته یا تحویل داده‌اند
              </p>
            </div>
            <span className="badge badge-category">
              مجموع امانت‌ها: {toPersianDigits((book.borrowing_history || []).length)} نوبت
            </span>
          </div>

          {!book.borrowing_history || book.borrowing_history.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', fontSize: '14px' }}>
              این کتاب تاکنون توسط هیچ کاربری امانت گرفته نشده است.
            </div>
          ) : (
            <div className="table-wrapper" tabIndex={0} role="region" aria-label="سابقه گردش کتاب">
              <table>
                <thead>
                  <tr>
                    <th>نام امانت‌گیرنده</th>
                    <th>تاریخ امانت</th>
                    <th>مهلت بازگشت</th>
                    <th>تاریخ تحویل</th>
                    <th>مدت نگهداری</th>
                    <th>وضعیت تحویل</th>
                  </tr>
                </thead>
                <tbody>
                  {book.borrowing_history.map((rec) => (
                    <tr key={rec.id}>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontWeight: 700, color: 'var(--accent2)' }}>
                            {rec.borrower_name || rec.username}
                          </span>
                          <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
                            @{rec.username}
                          </span>
                        </div>
                      </td>
                      <td>{formatPersianDate(rec.borrow_date)}</td>
                      <td>
                        {formatPersianDate(rec.due_date)}
                        {rec.is_extended && (
                          <span style={{ fontSize: '11px', color: 'var(--accent2)', marginRight: '6px' }}>
                            (تمدید شده)
                          </span>
                        )}
                      </td>
                      <td>
                        {rec.return_date ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span>{formatPersianDate(rec.return_date)}</span>
                            {rec.returned_by_label && (
                              <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                                {rec.returned_by_label}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--accent2)', fontWeight: 600 }}>در دست امانت</span>
                        )}
                      </td>
                      <td>{toPersianDigits(rec.duration_days || 1)} روز</td>
                      <td>
                        {rec.return_date ? (
                          rec.is_late ? (
                            <span className="badge badge-borrowed">
                              تحویل با {toPersianDigits(rec.late_days)} روز تأخیر
                            </span>
                          ) : (
                            <span className="badge badge-available">تحویل به موقع</span>
                          )
                        ) : rec.is_late ? (
                          <span className="badge badge-borrowed">
                            دارای {toPersianDigits(rec.late_days)} روز تأخیر
                          </span>
                        ) : (
                          <span className="badge badge-category">در مهلت مجاز</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Related Books Section */}
      {relatedBooks.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '21px', fontWeight: 800, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={22} color="var(--accent2)" />
            کتاب‌های مشابه و پیشنهادی
          </h3>
          <div className="books-grid">
            {relatedBooks.map((relBook) => (
              <BookCard key={relBook.id} book={relBook} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
