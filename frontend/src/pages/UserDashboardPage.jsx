import React, { useState, useEffect, useRef, useId } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  RotateCcw,
  Clock,
  CheckCircle,
  AlertCircle,
  Heart,
  PlusCircle,
  CalendarPlus,
  BellRing,
  UserCog,
  KeyRound,
  Save,
  Activity,
  Award,
  Star,
  MessageSquare,
  Search
} from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { BookCard } from '../components/BookCard';
import { formatPersianDate, getRemainingDays, toPersianDigits } from '../utils/formatters';

export const UserDashboardPage = () => {
  const { user, updateProfile } = useAuth();
  const { showToast, refreshNotifications } = useNotifications();
  const profileDialogRef = useRef(null);
  const profileDialogTitleId = useId();

  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [returningId, setReturningId] = useState(null);
  const [extendingId, setExtendingId] = useState(null);
  const [message, setMessage] = useState(null);

  // History & Activity filters
  const [historySearch, setHistorySearch] = useState('');
  const [historyFilter, setHistoryFilter] = useState('all'); // 'all' | 'ontime' | 'late'
  const [activityFilter, setActivityFilter] = useState('all'); // 'all' | 'borrowing' | 'comment'

  // Profile & Password Edit State
  const [editUsername, setEditUsername] = useState(user?.username || '');
  const [editEmail, setEditEmail] = useState(user?.email || '');
  const [editAge, setEditAge] = useState(user?.age ?? '');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [modalAlert, setModalAlert] = useState(null);

  const fetchDashboard = async () => {
    try {
      const res = await api.get('/api/dashboard/');
      setDashboardData(res.data);
    } catch (err) {
      console.error('Error fetching dashboard', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  useEffect(() => {
    if (user) {
      setEditUsername(user.username || '');
      setEditEmail(user.email || '');
      setEditAge(user.age ?? '');
    }
  }, [user]);

  // Fallback for browsers without native <dialog closedby="any"> support
  useEffect(() => {
    const dialog = profileDialogRef.current;
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
  }, [loading]);

  const handleReturn = async (borrowingId) => {
    setReturningId(borrowingId);
    setMessage(null);
    try {
      const res = await api.post(`/api/borrowings/${borrowingId}/return/`);
      setMessage({ type: 'success', text: res.data.message });
      showToast(res.data.message, 'success');
      await fetchDashboard();
      await refreshNotifications();
    } catch (err) {
      const errMsg = err.response?.data?.error || 'خطا در بازگرداندن کتاب.';
      setMessage({ type: 'danger', text: errMsg });
      showToast(errMsg, 'danger');
    } finally {
      setReturningId(null);
    }
  };

  const handleExtendLoan = async (borrowingId) => {
    setExtendingId(borrowingId);
    setMessage(null);
    try {
      const res = await api.post(`/api/borrowings/${borrowingId}/extend/`);
      setMessage({ type: 'success', text: res.data.message });
      showToast(res.data.message, 'success');
      await fetchDashboard();
      await refreshNotifications();
    } catch (err) {
      const errMsg = err.response?.data?.error || 'خطا در تمدید مهلت امانت.';
      setMessage({ type: 'danger', text: errMsg });
      showToast(errMsg, 'danger');
    } finally {
      setExtendingId(null);
    }
  };

  const handleWishlistUpdated = (bookId, isWishlisted) => {
    if (!isWishlisted) {
      setDashboardData((prev) =>
        prev
          ? {
              ...prev,
              wishlist: (prev.wishlist || []).filter((b) => b.id !== bookId),
            }
          : prev
      );
    }
  };

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    setModalAlert(null);
    try {
      await updateProfile({
        username: editUsername,
        email: editEmail,
        age: editAge !== '' ? parseInt(editAge, 10) : null,
      });
      setModalAlert({ type: 'success', text: 'اطلاعات پروفایل با موفقیت بروزرسانی شد.' });
      showToast('اطلاعات پروفایل با موفقیت بروزرسانی شد.', 'success');
    } catch (err) {
      const data = err.response?.data;
      const firstErr = data ? Object.values(data)[0] : null;
      const errText = firstErr ? String(Array.isArray(firstErr) ? firstErr[0] : firstErr) : 'خطا در بروزرسانی پروفایل.';
      setModalAlert({
        type: 'danger',
        text: errText
      });
      showToast(errText, 'danger');
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setChangingPassword(true);
    setModalAlert(null);
    try {
      const res = await api.post('/api/auth/change-password/', {
        old_password: oldPassword,
        new_password: newPassword,
      });
      setOldPassword('');
      setNewPassword('');
      setModalAlert({ type: 'success', text: res.data.message });
      showToast(res.data.message, 'success');
    } catch (err) {
      const errText = err.response?.data?.error || 'خطا در تغییر رمز عبور.';
      setModalAlert({
        type: 'danger',
        text: errText
      });
      showToast(errText, 'danger');
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="container" style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-dim)' }}>
        در حال بارگذاری داشبورد کاربری...
      </div>
    );
  }

  const {
    current_borrowings = [],
    borrowing_history = [],
    wishlist = [],
    waitlist = [],
    reading_stats = {},
    activity_timeline = []
  } = dashboardData || {};

  const filteredHistory = borrowing_history.filter((rec) => {
    const matchesSearch =
      !historySearch.trim() ||
      (rec.book_details?.title || '').toLowerCase().includes(historySearch.toLowerCase()) ||
      (rec.book_details?.author || '').toLowerCase().includes(historySearch.toLowerCase());
    if (!matchesSearch) return false;
    if (historyFilter === 'ontime') return !rec.is_late;
    if (historyFilter === 'late') return Boolean(rec.is_late);
    return true;
  });

  const filteredTimeline = activity_timeline.filter((act) => {
    if (activityFilter === 'borrowing') {
      return act.type === 'borrow' || act.type === 'return' || act.type === 'extend';
    }
    if (activityFilter === 'comment') {
      return act.type === 'comment';
    }
    return true;
  });

  return (
    <div className="container">
      {/* Profile Header */}
      <div
        className="card"
        style={{
          padding: '28px',
          marginBottom: '36px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '20px',
          flexWrap: 'wrap'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>
          <div
            style={{
              width: '68px',
              height: '68px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '26px',
              fontWeight: 800,
              color: '#fff',
              boxShadow: '0 8px 20px rgba(192, 57, 43, 0.3)'
            }}
          >
            {user?.username?.[0]?.toUpperCase()}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
              <h1 style={{ fontSize: '24px', fontWeight: 800 }}>
                خوش آمدید، {user?.username}
              </h1>
              {user?.is_staff && <span className="badge badge-category">مدیر کتابخانه</span>}
            </div>

            <div style={{ color: 'var(--text-dim)', fontSize: '13.5px', display: 'flex', gap: '18px', flexWrap: 'wrap' }}>
              <span>ایمیل: <strong>{user?.email || 'ثبت نشده'}</strong></span>
              {user?.age && <span>سن: <strong>{toPersianDigits(user.age)} سال</strong></span>}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-outline"
            style={{ fontSize: '13.5px' }}
            onClick={() => {
              setModalAlert(null);
              profileDialogRef.current?.showModal();
            }}
          >
            <UserCog size={16} /> ویرایش پروفایل و رمز عبور
          </button>
          <Link to="/books/create" className="btn-primary" style={{ fontSize: '13.5px' }}>
            <PlusCircle size={16} /> افزودن کتاب جدید
          </Link>
        </div>
      </div>

      {/* Profile & Password Edit Modal */}
      <dialog
        ref={profileDialogRef}
        className="confirm-dialog"
        aria-labelledby={profileDialogTitleId}
        style={{ maxWidth: '520px' }}
        {...({ closedby: 'any' })}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
          <h2 id={profileDialogTitleId} style={{ fontSize: '19px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UserCog size={20} color="var(--accent2)" />
            تنظیمات حساب کاربری
          </h2>
          <form method="dialog">
            <button type="submit" value="close" className="btn-outline" style={{ padding: '4px 12px', fontSize: '12.5px' }}>
              بستن
            </button>
          </form>
        </div>

        {modalAlert && (
          <div className={`alert alert-${modalAlert.type}`} style={{ marginBottom: '4px' }}>
            {modalAlert.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            <span>{modalAlert.text}</span>
          </div>
        )}

        {/* Form 1: Profile Info */}
        <form onSubmit={handleProfileSave} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '18px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>ویرایش مشخصات فردی</h3>
          <div className="form-group">
            <label className="form-label">نام کاربری</label>
            <input
              type="text"
              className="form-control"
              value={editUsername}
              onChange={(e) => setEditUsername(e.target.value)}
              dir="ltr"
              required
            />
          </div>

          <div className="form-grid-2">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">ایمیل</label>
              <input
                type="email"
                className="form-control"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                dir="ltr"
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">سن</label>
              <input
                type="number"
                min="1"
                className="form-control"
                value={editAge}
                onChange={(e) => setEditAge(e.target.value)}
                dir="ltr"
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '14px' }}>
            <button type="submit" disabled={savingProfile} className="btn-primary" style={{ fontSize: '13px', padding: '8px 16px' }}>
              <Save size={15} />
              {savingProfile ? 'در حال ذخیره...' : 'ذخیره مشخصات'}
            </button>
          </div>
        </form>

        {/* Form 2: Password Change */}
        <form onSubmit={handlePasswordChange}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <KeyRound size={16} color="var(--accent2)" /> تغییر رمز عبور
          </h3>
          <div className="form-grid-2">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">رمز عبور فعلی</label>
              <input
                type="password"
                className="form-control"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                dir="ltr"
                required
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">رمز عبور جدید</label>
              <input
                type="password"
                className="form-control"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                dir="ltr"
                required
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '14px' }}>
            <button type="submit" disabled={changingPassword} className="btn-outline" style={{ fontSize: '13px', padding: '8px 16px' }}>
              <KeyRound size={15} />
              {changingPassword ? 'در حال تغییر رمز...' : 'بروزرسانی رمز عبور'}
            </button>
          </div>
        </form>
      </dialog>

      {message && (
        <div className={`alert alert-${message.type}`}>
          {message.type === 'success' ? <CheckCircle size={17} /> : <AlertCircle size={17} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Reading Summary Stats Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '16px',
          marginBottom: '40px'
        }}
      >
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '20px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(232, 168, 56, 0.14)', color: 'var(--accent2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <BookOpen size={24} />
          </div>
          <div>
            <div style={{ fontSize: '12.5px', color: 'var(--muted)' }}>کتاب‌های تحویل داده شده</div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--text)' }}>
              {toPersianDigits(reading_stats.total_returned ?? borrowing_history.length)} <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--muted)' }}>جلد</span>
            </div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '20px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(192, 57, 43, 0.14)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Clock size={24} />
          </div>
          <div>
            <div style={{ fontSize: '12.5px', color: 'var(--muted)' }}>مجموع روزهای مطالعه</div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--text)' }}>
              {toPersianDigits(reading_stats.total_reading_days ?? 0)} <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--muted)' }}>روز</span>
            </div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '20px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--success-bg)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Award size={24} />
          </div>
          <div>
            <div style={{ fontSize: '12.5px', color: 'var(--muted)' }}>خوش‌حسابی در تحویل به موقع</div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--success)' }}>
              ٪{toPersianDigits(reading_stats.on_time_rate ?? 100)}
            </div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '20px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(232, 168, 56, 0.14)', color: 'var(--accent2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Star size={24} />
          </div>
          <div>
            <div style={{ fontSize: '12.5px', color: 'var(--muted)' }}>دیدگاه‌ها و میانگین امتیاز من</div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--text)' }}>
              {toPersianDigits(reading_stats.comments_count ?? 0)} نظر
              {reading_stats.average_user_rating && (
                <span style={{ fontSize: '13px', color: 'var(--accent2)', marginRight: '8px' }}>
                  (★ {toPersianDigits(reading_stats.average_user_rating)})
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 1. Currently Borrowed Books */}
      <div style={{ marginBottom: '48px' }}>
        <h2 style={{ fontSize: '21px', fontWeight: 800, marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BookOpen size={22} color="var(--accent2)" />
          کتاب‌های در دست امانت من ({toPersianDigits(current_borrowings.length)})
        </h2>

        {current_borrowings.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
            شما در حال حاضر هیچ کتاب فعالی در امانت ندارید.
            <div style={{ marginTop: '14px' }}>
              <Link to="/books?status=available" className="btn-outline" style={{ fontSize: '13.5px' }}>
                مشاهده کتاب‌های آماده امانت
              </Link>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: '18px' }}>
            {current_borrowings.map((item) => {
              const remainingDays = getRemainingDays(item.due_date);
              const isOverdue = remainingDays !== null && remainingDays < 0;

              return (
                <div key={item.id} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                    <div
                      style={{
                        width: '84px',
                        height: '116px',
                        background: 'var(--surface2)',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        flexShrink: 0,
                        border: '1px solid var(--border)'
                      }}
                    >
                      {item.book_details?.covers ? (
                        <img src={item.book_details.covers} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                          <BookOpen size={26} style={{ opacity: 0.3 }} />
                        </div>
                      )}
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
                        <Link
                          to={`/books/${item.book}`}
                          style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text)' }}
                        >
                          {item.book_details?.title}
                        </Link>
                        {item.is_extended && (
                          <span className="badge badge-category" style={{ fontSize: '11px' }}>
                            تمدید شده
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '10px' }}>
                        اثر {item.book_details?.author}
                      </div>

                      <div style={{ fontSize: '12.5px', color: 'var(--text-dim)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span>امانت‌گیرنده: <strong style={{ color: 'var(--text)' }}>{item.borrower_name || item.username || user?.username}</strong></span>
                        <span>تاریخ امانت: {formatPersianDate(item.borrow_date)}</span>
                        <span style={{ color: isOverdue ? 'var(--danger)' : 'var(--accent2)', fontWeight: 700 }}>
                          موعد بازگشت: {formatPersianDate(item.due_date)}
                          {remainingDays !== null && (
                            <span>
                              {' '}
                              ({isOverdue
                                ? `${toPersianDigits(Math.abs(remainingDays))} روز تأخیر`
                                : `${toPersianDigits(remainingDays)} روز باقی‌مانده`})
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 'auto', paddingTop: '14px', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px' }}>
                    {!item.is_extended && (
                      <button
                        type="button"
                        onClick={() => handleExtendLoan(item.id)}
                        disabled={extendingId === item.id}
                        className="btn-outline"
                        style={{ flex: 1, fontSize: '13px', padding: '9px 10px' }}
                        title="تمدید مهلت امانت به مدت ۷ روز"
                      >
                        <CalendarPlus size={15} />
                        {extendingId === item.id ? 'در حال تمدید...' : 'تمدید (+۷ روز)'}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleReturn(item.id)}
                      disabled={returningId === item.id}
                      className="btn-success"
                      style={{ flex: 1.3, justifyContent: 'center', padding: '9px 10px', fontSize: '13px' }}
                    >
                      <RotateCcw size={15} />
                      {returningId === item.id ? 'در حال ثبت...' : 'تحویل به کتابخانه'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. Waitlist / Reserved Books */}
      {waitlist.length > 0 && (
        <div style={{ marginBottom: '48px' }}>
          <h2 style={{ fontSize: '21px', fontWeight: 800, marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BellRing size={22} color="var(--accent2)" />
            نوبت‌های رزرو من در صف انتظار ({toPersianDigits(waitlist.length)})
          </h2>
          <div className="books-grid">
            {waitlist.map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </div>
        </div>
      )}

      {/* 3. Borrowing & Return History */}
      <div style={{ marginBottom: '48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px', marginBottom: '18px' }}>
          <div>
            <h2 style={{ fontSize: '21px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={22} color="var(--accent2)" />
              تاریخچه تحویل کتاب‌ها و امانات پیشین ({toPersianDigits(filteredHistory.length)})
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>
              فهرست کامل کتاب‌هایی که مطالعه کرده و به کتابخانه تحویل داده‌اید
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div className="search-input-wrapper" style={{ minWidth: '210px' }}>
              <Search size={15} className="search-input-icon" />
              <input
                type="text"
                className="form-control"
                placeholder="جستجو در کتاب‌های تحویل‌شده..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                style={{ padding: '7px 36px 7px 12px', fontSize: '13px' }}
              />
            </div>

            <div className="tabs-pill-bar">
              <button
                type="button"
                className={`tab-pill-btn ${historyFilter === 'all' ? 'active' : ''}`}
                onClick={() => setHistoryFilter('all')}
              >
                همه ({toPersianDigits(borrowing_history.length)})
              </button>
              <button
                type="button"
                className={`tab-pill-btn ${historyFilter === 'ontime' ? 'active' : ''}`}
                onClick={() => setHistoryFilter('ontime')}
              >
                تحویل به موقع ({toPersianDigits(borrowing_history.filter((r) => !r.is_late).length)})
              </button>
              <button
                type="button"
                className={`tab-pill-btn ${historyFilter === 'late' ? 'active' : ''}`}
                onClick={() => setHistoryFilter('late')}
              >
                دارای تأخیر ({toPersianDigits(borrowing_history.filter((r) => r.is_late).length)})
              </button>
            </div>
          </div>
        </div>

        {filteredHistory.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '28px', color: 'var(--muted)' }}>
            هنوز سابقه امانت تحویل‌شده‌ای مطابق با این فیلتر برای شما ثبت نشده است.
          </div>
        ) : (
          <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
            <div className="table-wrapper" tabIndex={0} role="region" aria-label="تاریخچه تحویل کتاب‌ها">
              <table>
                <thead>
                  <tr>
                    <th>عنوان کتاب</th>
                    <th>نام امانت‌گیرنده</th>
                    <th>تاریخ امانت</th>
                    <th>مهلت بازگشت</th>
                    <th>تاریخ تحویل</th>
                    <th>مدت مطالعه</th>
                    <th>وضعیت تحویل</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((record) => (
                    <tr key={record.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <Link to={`/books/${record.book}`} style={{ fontWeight: 700, color: 'var(--text)' }}>
                            {record.book_details?.title}
                          </Link>
                          {record.is_extended && (
                            <span className="badge badge-category" style={{ fontSize: '10.5px' }}>
                              تمدید شده
                            </span>
                          )}
                        </div>
                        {record.book_details?.author && (
                          <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                            اثر {record.book_details.author}
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontWeight: 700, color: 'var(--accent2)' }}>
                            {record.borrower_name || record.username || user?.username}
                          </span>
                          <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
                            @{record.username || user?.username}
                          </span>
                        </div>
                      </td>
                      <td>{formatPersianDate(record.borrow_date)}</td>
                      <td>{formatPersianDate(record.due_date)}</td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span>{formatPersianDate(record.return_date)}</span>
                          {record.returned_by_label && (
                            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                              {record.returned_by_label}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span style={{ fontWeight: 600 }}>
                          {toPersianDigits(record.duration_days || 1)} روز
                        </span>
                      </td>
                      <td>
                        {record.is_late ? (
                          <span className="badge badge-borrowed">
                            تحویل با {toPersianDigits(record.late_days)} روز تأخیر
                          </span>
                        ) : (
                          <span className="badge badge-available">تحویل به موقع</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 4. User Activity Timeline */}
      <div style={{ marginBottom: '48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '18px' }}>
          <div>
            <h2 style={{ fontSize: '21px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={22} color="var(--accent2)" />
              تایم‌لاین فعالیت‌های من در کتابخانه ({toPersianDigits(filteredTimeline.length)})
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>
              مرور زمانی تمام امانت‌ها، تمدیدها، تحویل‌های کتاب و دیدگاه‌های ثبت‌شده شما
            </p>
          </div>

          <div className="tabs-pill-bar">
            <button
              type="button"
              className={`tab-pill-btn ${activityFilter === 'all' ? 'active' : ''}`}
              onClick={() => setActivityFilter('all')}
            >
              همه فعالیت‌ها ({toPersianDigits(activity_timeline.length)})
            </button>
            <button
              type="button"
              className={`tab-pill-btn ${activityFilter === 'borrowing' ? 'active' : ''}`}
              onClick={() => setActivityFilter('borrowing')}
            >
              امانت و تحویل کتاب
            </button>
            <button
              type="button"
              className={`tab-pill-btn ${activityFilter === 'comment' ? 'active' : ''}`}
              onClick={() => setActivityFilter('comment')}
            >
              دیدگاه و امتیازها
            </button>
          </div>
        </div>

        {filteredTimeline.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '28px', color: 'var(--muted)' }}>
            هنوز فعالیتی در این بخش برای شما ثبت نشده است.
          </div>
        ) : (
          <div className="card" style={{ padding: '24px' }}>
            <div className="activity-timeline">
              {filteredTimeline.map((act) => {
                let dotColor = 'var(--accent2)';
                let badgeLabel = 'امانت کتاب';
                let badgeClass = 'badge-category';
                if (act.type === 'return') {
                  dotColor = act.is_late ? 'var(--danger)' : 'var(--success)';
                  badgeLabel = act.is_late ? 'تحویل با تأخیر' : 'تحویل کتاب';
                  badgeClass = act.is_late ? 'badge-borrowed' : 'badge-available';
                } else if (act.type === 'extend') {
                  dotColor = 'var(--accent2)';
                  badgeLabel = 'تمدید مهلت';
                  badgeClass = 'badge-category';
                } else if (act.type === 'comment') {
                  dotColor = 'var(--accent)';
                  badgeLabel = `ثبت دیدگاه (★ ${toPersianDigits(act.rating || 5)})`;
                  badgeClass = 'badge-category';
                }

                return (
                  <div key={act.id} className="activity-timeline-item">
                    <span className="activity-timeline-dot" style={{ borderColor: dotColor }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <span className={`badge ${badgeClass}`} style={{ fontSize: '11.5px' }}>
                          {badgeLabel}
                        </span>
                        <Link
                          to={`/books/${act.book_id}`}
                          style={{ fontWeight: 700, fontSize: '14.5px', color: 'var(--text)' }}
                        >
                          {act.description}
                        </Link>
                      </div>
                      {act.type === 'comment' && act.text && (
                        <div style={{ fontSize: '12.5px', color: 'var(--text-dim)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <MessageSquare size={13} color="var(--accent2)" />
                          <span>«{act.text}»</span>
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: '12.5px', color: 'var(--muted)', fontWeight: 600 }}>
                      {formatPersianDate(act.timestamp)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 4. Wishlist */}
      <div>
        <h2 style={{ fontSize: '21px', fontWeight: 800, marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Heart size={22} color="var(--accent)" />
          لیست علاقه‌مندی‌های من ({toPersianDigits(wishlist.length)})
        </h2>

        {wishlist.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}>
            هنوز کتابی به لیست علاقه‌مندی‌های خود اضافه نکرده‌اید. با کلیک روی آیکون قلب روی کارت کتاب‌ها می‌توانید آن‌ها را ذخیره کنید.
          </div>
        ) : (
          <div className="books-grid">
            {wishlist.map((book) => (
              <BookCard
                key={book.id}
                book={{ ...book, is_wishlisted: true }}
                onWishlistChange={handleWishlistUpdated}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
