import React, { useEffect, useState, useRef, useId } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Book as BookIcon,
  ArrowRight,
  Clock,
  MessageSquare,
  Send,
  Pencil,
  Trash2,
  BookCheck,
  CheckCircle,
  AlertCircle,
  Heart,
  AlertTriangle,
  BellPlus,
  BellOff,
  Sparkles,
  Plus,
  ShieldCheck,
  XCircle,
  Wallet,
  Lock
} from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { BookCard } from '../components/BookCard';
import { formatPrice, formatPersianDate, toPersianDigits, extractApiError } from '../utils/formatters';

export const BookDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated, refreshProfile } = useAuth();
  const { showToast, refreshNotifications } = useNotifications();
  const dialogRef = useRef(null);
  const dialogTitleId = useId();
  const rejectDialogRef = useRef(null);
  const rejectDialogTitleId = useId();
  const payDialogRef = useRef(null);
  const payDialogTitleId = useId();

  const [book, setBook] = useState(null);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [borrowing, setBorrowing] = useState(false);
  const [reserving, setReserving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [togglingWishlist, setTogglingWishlist] = useState(false);
  const [addingCopy, setAddingCopy] = useState(false);
  const [deletingCopyId, setDeletingCopyId] = useState(null);
  const [reviewingBook, setReviewingBook] = useState(false);
  const [rejectReasonInput, setRejectReasonInput] = useState('');
  const [message, setMessage] = useState(null);

  const fetchBook = async (shouldScrollTop = false) => {
    try {
      const res = await api.get(`/api/books/${id}/`);
      setBook(res.data);
    } catch (err) {
      console.error('Error fetching book detail', err);
      setBook(null);
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
    setBook(null);
    setLoading(true);
    setMessage(null);
    fetchBook(true);
  }, [id]);

  // Fallback for browsers without native <dialog closedby="any"> support
  useEffect(() => {
    const dialogs = [dialogRef.current, rejectDialogRef.current, payDialogRef.current].filter(Boolean);
    if (dialogs.length === 0) return;

    if (!('closedBy' in HTMLDialogElement.prototype)) {
      const handleDialogClick = (event) => {
        const targetDialog = event.currentTarget;
        if (event.target !== targetDialog) return;
        const rect = targetDialog.getBoundingClientRect();
        const isDialogContent =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;

        if (isDialogContent) return;
        targetDialog.close();
      };

      dialogs.forEach((d) => d.addEventListener('click', handleDialogClick));
      return () => dialogs.forEach((d) => d.removeEventListener('click', handleDialogClick));
    }
  }, [book]);

  const openBorrowPaymentModal = () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    payDialogRef.current?.showModal();
  };

  const handleBorrow = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    setBorrowing(true);
    setMessage(null);
    try {
      const res = await api.post(`/api/books/${id}/borrow/`);
      if (payDialogRef.current?.open) payDialogRef.current.close();
      setMessage({ type: 'success', text: res.data.message });
      showToast(res.data.message, 'success');
      await Promise.all([fetchBook(), refreshProfile(), refreshNotifications()]);
    } catch (err) {
      if (payDialogRef.current?.open) payDialogRef.current.close();
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
      });
      setCommentText('');
      await fetchBook();
      setMessage({ type: 'success', text: 'دیدگاه شما با موفقیت ثبت شد.' });
      showToast('دیدگاه شما با موفقیت ثبت شد.', 'success');
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

  const handleAddCopy = async () => {
    if (addingCopy) return;
    setAddingCopy(true);
    try {
      const res = await api.post(`/api/books/${id}/copies/`, { count: 1 });
      await fetchBook();
      showToast(res.data.message || 'جلد جدید اضافه شد.', 'success');
    } catch (err) {
      const errMsg = extractApiError(err, 'خطا در افزودن جلد جدید.');
      setMessage({ type: 'danger', text: errMsg });
      showToast(errMsg, 'danger');
    } finally {
      setAddingCopy(false);
    }
  };

  const handleDeleteCopy = async (copyId) => {
    if (deletingCopyId) return;
    setDeletingCopyId(copyId);
    try {
      const res = await api.delete(`/api/books/${id}/copies/${copyId}/`);
      await fetchBook();
      showToast(res.data.message || 'شناسه حذف شد.', 'info');
    } catch (err) {
      const errMsg = extractApiError(err, 'خطا در حذف شناسه.');
      setMessage({ type: 'danger', text: errMsg });
      showToast(errMsg, 'danger');
    } finally {
      setDeletingCopyId(null);
    }
  };

  const confirmDeleteBook = async () => {
    setDeleting(true);
    try {
      await api.delete(`/api/books/${id}/`);
      if (dialogRef.current) dialogRef.current.close();
      showToast(`کتاب «${book?.title || ''}» با موفقیت حذف شد.`, 'info');
      navigate('/books');
    } catch (err) {
      if (dialogRef.current) dialogRef.current.close();
      const errMsg = extractApiError(err, 'خطا در حذف کتاب. لطفاً دوباره تلاش کنید.');
      setMessage({ type: 'danger', text: errMsg });
      showToast(errMsg, 'danger');
    } finally {
      setDeleting(false);
    }
  };

  const handleApproveBook = async () => {
    if (reviewingBook) return;
    setReviewingBook(true);
    setMessage(null);
    try {
      const res = await api.post(`/api/books/${id}/review/`, { action: 'approve' });
      setBook(res.data.book);
      setMessage({ type: 'success', text: res.data.message });
      showToast(res.data.message, 'success');
      await refreshNotifications();
    } catch (err) {
      const errMsg = extractApiError(err, 'خطا در تأیید کتاب.');
      setMessage({ type: 'danger', text: errMsg });
      showToast(errMsg, 'danger');
    } finally {
      setReviewingBook(false);
    }
  };

  const handleRejectBookSubmit = async (e) => {
    e.preventDefault();
    if (reviewingBook) return;
    setReviewingBook(true);
    setMessage(null);
    try {
      const res = await api.post(`/api/books/${id}/review/`, {
        action: 'reject',
        rejection_reason: rejectReasonInput.trim(),
      });
      setBook(res.data.book);
      if (rejectDialogRef.current) rejectDialogRef.current.close();
      setRejectReasonInput('');
      setMessage({ type: 'info', text: res.data.message });
      showToast(res.data.message, 'info');
      await refreshNotifications();
    } catch (err) {
      if (rejectDialogRef.current) rejectDialogRef.current.close();
      const errMsg = extractApiError(err, 'خطا در ثبت رد درخواست کتاب.');
      setMessage({ type: 'danger', text: errMsg });
      showToast(errMsg, 'danger');
    } finally {
      setReviewingBook(false);
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
  const isStaffOrAdmin = Boolean(user && (user.is_staff || user.is_superuser));
  const approvalStatus = book.approval_status || 'approved';
  const isApproved = approvalStatus === 'approved';
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

      {/* Approval Status & Staff Review Banner */}
      {(!isApproved || isStaffOrAdmin) && (
        <div
          className="card"
          style={{
            padding: '18px 22px',
            marginBottom: '22px',
            borderColor:
              approvalStatus === 'pending'
                ? 'rgba(232, 168, 56, 0.55)'
                : approvalStatus === 'rejected'
                  ? 'rgba(220, 38, 38, 0.45)'
                  : 'rgba(22, 163, 74, 0.35)',
            background:
              approvalStatus === 'pending'
                ? 'var(--accent-soft)'
                : approvalStatus === 'rejected'
                  ? 'var(--danger-bg)'
                  : 'var(--surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '14px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flex: 1 }}>
            {approvalStatus === 'pending' ? (
              <Clock size={22} color="var(--accent2)" style={{ flexShrink: 0, marginTop: '2px' }} />
            ) : approvalStatus === 'rejected' ? (
              <XCircle size={22} color="var(--danger)" style={{ flexShrink: 0, marginTop: '2px' }} />
            ) : (
              <ShieldCheck size={22} color="var(--success)" style={{ flexShrink: 0, marginTop: '2px' }} />
            )}

            <div>
              <div style={{ fontWeight: 800, fontSize: '15px', marginBottom: '4px' }}>
                {approvalStatus === 'pending'
                  ? 'وضعیت کتاب: در انتظار بررسی و تأیید مدیریت (Pending)'
                  : approvalStatus === 'rejected'
                    ? 'وضعیت کتاب: رد شده توسط مدیریت کتابخانه'
                    : 'وضعیت کتاب: تأیید شده و منتشر شده در کاتالوگ عمومی'}
              </div>

              {approvalStatus === 'pending' && (
                <p style={{ fontSize: '13.5px', color: 'var(--text-dim)' }}>
                  این کتاب تا زمان بررسی و تأیید توسط ادمین یا کارمند کتابخانه برای سایر کاربران در کاتالوگ عمومی نمایش داده نمی‌شود و امکان امانت‌گیری ندارد.
                </p>
              )}

              {approvalStatus === 'rejected' && (
                <div style={{ fontSize: '13.5px', color: 'var(--text-dim)' }}>
                  <div>
                    <strong>علت عدم تأیید:</strong> {book.rejection_reason || 'عدم انطباق با ضوابط کتابخانه'}
                  </div>
                  <div style={{ marginTop: '3px' }}>
                    ثبت‌کننده کتاب می‌تواند با ویرایش مشخصات، مجدداً آن را برای بررسی مدیریت ارسال کند.
                  </div>
                </div>
              )}

              {book.reviewed_by_username && (
                <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
                  بررسی‌شده توسط: @{book.reviewed_by_username}
                  {book.reviewed_at ? ` در تاریخ ${formatPersianDate(book.reviewed_at)}` : ''}
                </div>
              )}
            </div>
          </div>

          {isStaffOrAdmin && (
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {approvalStatus !== 'approved' && (
                <button
                  type="button"
                  onClick={handleApproveBook}
                  disabled={reviewingBook}
                  className="btn-success"
                  style={{ padding: '9px 16px', fontSize: '13.5px' }}
                >
                  <CheckCircle size={16} />
                  {reviewingBook ? 'در حال ثبت...' : 'تأیید و انتشار کتاب'}
                </button>
              )}

              {approvalStatus !== 'rejected' && (
                <button
                  type="button"
                  onClick={() => {
                    setRejectReasonInput(book.rejection_reason || '');
                    rejectDialogRef.current?.showModal();
                  }}
                  disabled={reviewingBook}
                  className="btn-danger"
                  style={{ padding: '9px 16px', fontSize: '13.5px' }}
                >
                  <XCircle size={16} />
                  رد درخواست انتشار
                </button>
              )}
            </div>
          )}
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
                {approvalStatus === 'pending' ? (
                  <span className="badge badge-category" style={{ fontSize: '12.5px', padding: '6px 14px' }}>
                    <Clock size={14} /> در انتظار تأیید مدیریت (Pending)
                  </span>
                ) : approvalStatus === 'rejected' ? (
                  <span className="badge badge-borrowed" style={{ fontSize: '12.5px', padding: '6px 14px' }}>
                    <XCircle size={14} /> رد شده توسط مدیریت
                  </span>
                ) : book.is_available ? (
                  <span className="badge badge-available" style={{ fontSize: '12.5px', padding: '6px 14px' }}>
                    {book.total_copies_count > 1
                      ? `موجود در قفسه (${toPersianDigits(book.available_copies_count)} از ${toPersianDigits(book.total_copies_count)} جلد)`
                      : 'موجود و آماده امانت'}
                  </span>
                ) : (
                  <span className="badge badge-borrowed" style={{ fontSize: '12.5px', padding: '6px 14px' }}>
                    {book.total_copies_count > 1
                      ? `امانت داده شده (${toPersianDigits(0)} از ${toPersianDigits(book.total_copies_count)} جلد)`
                      : 'در حال حاضر امانت داده شده'}
                  </span>
                )}

                {book.current_borrower && (
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
                marginBottom: '20px',
                flex: 1
              }}
            >
              {book.description}
            </div>

            {/* Financial Breakdown Strip */}
            {book.financial_info && isApproved && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                  gap: '10px',
                  padding: '14px 16px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  marginBottom: '20px',
                  fontSize: '12.5px'
                }}
              >
                <div>
                  <span style={{ color: 'var(--muted)', display: 'block' }}>ارزش مرجع کتاب</span>
                  <strong style={{ fontSize: '15px', color: 'var(--accent2)' }} dir="ltr">
                    {formatPrice(book.financial_info.book_price ?? book.price)}
                  </strong>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)', display: 'block' }}>هزینه امانت ۱۴ روزه</span>
                  <strong style={{ fontSize: '15px', color: 'var(--text)' }} dir="ltr">
                    {formatPrice(book.financial_info.borrow_fee)}
                  </strong>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)', display: 'block' }}>ودیعه امانت (قابل برگشت)</span>
                  <strong style={{ fontSize: '15px', color: 'var(--success)' }} dir="ltr">
                    {formatPrice(book.financial_info.deposit_amount)}
                  </strong>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)', display: 'block' }}>سهم ثبت‌کننده کتاب</span>
                  <strong style={{ fontSize: '14px', color: 'var(--success)' }}>
                    ٪{toPersianDigits(parseFloat(book.financial_info.owner_share_percent || 80))} به کیف‌پول مالک
                  </strong>
                </div>
              </div>
            )}

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
                {!isApproved ? (
                  <div
                    className={`badge ${approvalStatus === 'rejected' ? 'badge-borrowed' : 'badge-category'}`}
                    style={{ padding: '10px 18px', fontSize: '13.5px' }}
                  >
                    {approvalStatus === 'rejected' ? (
                      <>
                        <XCircle size={16} /> امکان امانت‌گیری وجود ندارد (رد شده توسط مدیریت)
                      </>
                    ) : (
                      <>
                        <Clock size={16} /> امکان امانت‌گیری پس از تأیید مدیریت فعال می‌شود
                      </>
                    )}
                  </div>
                ) : book.is_borrowed_by_user ? (
                  <div className="badge badge-available" style={{ padding: '10px 18px', fontSize: '13.5px' }}>
                    <CheckCircle size={16} /> این کتاب هم‌اکنون در امانت شماست
                  </div>
                ) : book.is_available ? (
                  <button
                    type="button"
                    onClick={openBorrowPaymentModal}
                    disabled={borrowing}
                    className="btn-primary"
                    style={{ padding: '11px 20px' }}
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

                {isApproved && (
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
                )}
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

            {/* Copies (IDs) Management for Owner/Staff/Admin */}
            {isOwner && Array.isArray(book.copies) && book.copies.length > 0 && (
              <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>
                    شناسه‌های (ID) این کتاب ({toPersianDigits(book.copies.length)} جلد):
                  </span>
                  <button
                    type="button"
                    onClick={handleAddCopy}
                    disabled={addingCopy}
                    className="btn-outline"
                    style={{ padding: '6px 12px', fontSize: '12.5px' }}
                  >
                    <Plus size={14} />
                    {addingCopy ? 'در حال افزودن...' : 'افزودن جلد جدید'}
                  </button>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {book.copies.map((copyItem) => (
                    <div
                      key={copyItem.id}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        background: 'var(--surface2)',
                        border: '1px solid var(--border)',
                        fontSize: '12.5px'
                      }}
                    >
                      <strong dir="ltr" style={{ color: 'var(--text)' }}>
                        ID: #{copyItem.id}
                      </strong>
                      {copyItem.is_available ? (
                        <span className="badge badge-available" style={{ fontSize: '11px', padding: '2px 8px' }}>
                          موجود
                        </span>
                      ) : (
                        <span className="badge badge-borrowed" style={{ fontSize: '11px', padding: '2px 8px' }}>
                          امانت {copyItem.current_borrower ? `(@${copyItem.current_borrower})` : ''}
                        </span>
                      )}
                      {copyItem.is_available && (book.total_copies_count ?? book.copies.length) > 1 && (
                        <button
                          type="button"
                          onClick={() => handleDeleteCopy(copyItem.id)}
                          disabled={deletingCopyId === copyItem.id}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--danger)',
                            cursor: 'pointer',
                            padding: '2px',
                            display: 'inline-flex'
                          }}
                          title="حذف این شناسه"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
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

      {/* Native Accessible Modal Dialog for Rejecting a Book */}
      <dialog
        ref={rejectDialogRef}
        className="confirm-dialog"
        aria-labelledby={rejectDialogTitleId}
        {...({ closedby: 'any' })}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--danger)' }}>
          <XCircle size={26} />
          <h2 id={rejectDialogTitleId} style={{ fontSize: '19px', fontWeight: 800 }}>
            رد درخواست انتشار کتاب
          </h2>
        </div>

        <form onSubmit={handleRejectBookSubmit}>
          <div className="form-group" style={{ marginTop: '8px' }}>
            <label className="form-label" htmlFor="reject-book-reason-input">
              علت عدم تأیید (برای نمایش به کاربر ثبت‌کننده)
            </label>
            <textarea
              id="reject-book-reason-input"
              className="form-control"
              rows={3}
              placeholder="مثلاً: نقص در توضیحات کتاب، تصویر جلد نامناسب یا تکراری بودن عنوان..."
              value={rejectReasonInput}
              onChange={(e) => setRejectReasonInput(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '14px' }}>
            <button
              type="button"
              onClick={() => rejectDialogRef.current?.close()}
              className="btn-outline"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={reviewingBook}
              className="btn-danger"
            >
              <XCircle size={15} />
              {reviewingBook ? 'در حال ثبت...' : 'ثبت عدم تأیید'}
            </button>
          </div>
        </form>
      </dialog>

      {/* Native Accessible Modal Dialog for Wallet Payment Confirmation (Borrow) */}
      <dialog
        ref={payDialogRef}
        className="confirm-dialog"
        aria-labelledby={payDialogTitleId}
        {...({ closedby: 'any' })}
      >
        {(() => {
          const fin = book.financial_info || {};
          const userBalance = parseFloat(user?.wallet_balance ?? 0);
          const requiredAmount = parseFloat(fin.total_borrow_required ?? 0);
          const borrowFee = parseFloat(fin.borrow_fee ?? 0);
          const depositAmount = parseFloat(fin.deposit_amount ?? 0);
          const hasEnough = userBalance >= requiredAmount;
          const remainingBalance = Math.max(0, userBalance - requiredAmount);

          return (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--accent2)' }}>
                <Wallet size={24} />
                <h2 id={payDialogTitleId} style={{ fontSize: '18.5px', fontWeight: 800 }}>
                  تأیید پرداخت و امانت گرفتن کتاب
                </h2>
              </div>

              <div style={{ fontSize: '13.5px', color: 'var(--text-dim)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '15px' }}>
                  «{book.title}» — اثر {book.author}
                </div>

                <div style={{ background: 'var(--surface2)', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>موجودی فعلی کیف‌پول شما:</span>
                    <strong dir="ltr" style={{ color: 'var(--success)' }}>{formatPrice(userBalance)}</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>هزینه امانت ۱۴ روزه:</span>
                    <strong dir="ltr">{formatPrice(borrowFee)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Lock size={13} color="var(--accent2)" /> ودیعه مسدودشونده (قابل برگشت):
                    </span>
                    <strong dir="ltr" style={{ color: 'var(--accent2)' }}>{formatPrice(depositAmount)}</strong>
                  </div>

                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontWeight: 800, color: 'var(--text)' }}>
                    <span>مبلغ کل مورد نیاز:</span>
                    <span dir="ltr">{formatPrice(requiredAmount)}</span>
                  </div>

                  {hasEnough && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px' }}>
                      <span>موجودی قابل استفاده پس از تراکنش:</span>
                      <strong dir="ltr">{formatPrice(remainingBalance)}</strong>
                    </div>
                  )}
                </div>

                {!hasEnough && (
                  <div className="alert alert-danger" style={{ margin: 0, fontSize: '13px' }}>
                    <AlertCircle size={16} style={{ flexShrink: 0 }} />
                    <span>
                      موجودی کیف‌پول شما به میزان <strong>{formatPrice(requiredAmount - userBalance)}</strong> کم است. لطفاً ابتدا کیف‌پول خود را شارژ کنید.
                    </span>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => payDialogRef.current?.close()}
                  className="btn-outline"
                  autoFocus
                >
                  انصراف
                </button>

                {hasEnough ? (
                  <button
                    type="button"
                    onClick={handleBorrow}
                    disabled={borrowing}
                    className="btn-primary"
                  >
                    <BookCheck size={15} />
                    {borrowing
                      ? 'در حال پردازش...'
                      : `تأیید و امانت کتاب (${formatPrice(requiredAmount)})`}
                  </button>
                ) : (
                  <Link
                    to="/wallet"
                    onClick={() => payDialogRef.current?.close()}
                    className="btn-primary"
                  >
                    <Wallet size={15} />
                    رفتن به صفحه شارژ کیف‌پول
                  </Link>
                )}
              </div>
            </>
          );
        })()}
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
                  </div>
                  <span style={{ fontSize: '12.5px', color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                    <Clock size={13} />
                    {formatPersianDate(comment.datetime_created)}
                  </span>
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
        {!isApproved ? (
          <div className="card" style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>
            امکان ثبت دیدگاه پس از تأیید و انتشار نهایی کتاب توسط مدیریت فعال خواهد شد.
          </div>
        ) : isAuthenticated ? (
          <div className="card" style={{ padding: '26px' }}>
            <h4 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px' }}>ثبت دیدگاه جدید</h4>
            <form onSubmit={handleCommentSubmit}>
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

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                <button
                  type="submit"
                  disabled={submittingComment}
                  className="btn-primary"
                  style={{ padding: '9px 22px', fontSize: '14px' }}
                >
                  <Send size={15} />
                  {submittingComment ? 'در حال ارسال...' : 'ارسال دیدگاه'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="card" style={{ textAlign: 'center', padding: '24px' }}>
            <p style={{ color: 'var(--text-dim)', fontSize: '14.5px' }}>
              برای ثبت دیدگاه درباره این کتاب، لطفاً ابتدا{' '}
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
                            {rec.copy_id ? ` • ID: #${rec.copy_id}${rec.is_copy_deleted ? ' (حذف‌شده)' : ''}` : ''}
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
