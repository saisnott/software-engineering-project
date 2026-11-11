import React, { useState, useEffect, useRef, useId } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  BookOpen,
  Layers,
  ArrowUpLeft,
  PlusCircle,
  BookCheck,
  PieChart,
  BarChart3,
  Trash2,
  RotateCcw,
  CheckCircle,
  AlertCircle,
  UserPlus,
  UserCheck,
  UserX,
  Crown,
  Search,
  BookMarked,
  History
} from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { formatPrice, formatPersianDate, getRemainingDays, toPersianDigits } from '../utils/formatters';

export const ManagerDashboardPage = () => {
  const { user: currentUser } = useAuth();
  const { showToast, refreshNotifications } = useNotifications();
  const isSuperuser = Boolean(currentUser?.is_superuser);
  const historyDialogRef = useRef(null);
  const historyDialogTitleId = useId();

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [catName, setCatName] = useState('');
  const [catSlug, setCatSlug] = useState('');
  const [creatingCat, setCreatingCat] = useState(false);
  const [returningLoanId, setReturningLoanId] = useState(null);
  const [loanFilter, setLoanFilter] = useState('all'); // 'all' | 'active' | 'returned' | 'late'
  const [loanSearch, setLoanSearch] = useState('');
  const [message, setMessage] = useState(null);

  // History Modal State (Book Circulation / User Dossier)
  const [historyModalLoading, setHistoryModalLoading] = useState(false);
  const [historyModalData, setHistoryModalData] = useState({
    mode: 'book', // 'book' | 'user'
    title: '',
    subtitle: '',
    summary: null,
    results: []
  });

  // Superuser User Management State
  const [usersList, setUsersList] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [showNewUserForm, setShowNewUserForm] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newAge, setNewAge] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('user'); // 'user' | 'staff' | 'superuser'
  const [creatingUser, setCreatingUser] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState(null);

  const fetchStats = async () => {
    try {
      const res = await api.get('/api/manager/stats/');
      setStats(res.data);
    } catch (err) {
      console.error('Error fetching manager stats', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async (searchQuery = '') => {
    if (!isSuperuser) return;
    setUsersLoading(true);
    try {
      const q = searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : '';
      const res = await api.get(`/api/auth/users/${q}`);
      setUsersList(res.data);
    } catch (err) {
      console.error('Error fetching users', err);
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    if (isSuperuser) {
      fetchUsers(userSearch);
    }
  }, [isSuperuser, userSearch]);

  // Fallback for browsers without native <dialog closedby="any"> support
  useEffect(() => {
    const dialog = historyDialogRef.current;
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

  const openBookHistoryModal = async (bookId, bookTitle) => {
    setHistoryModalData({
      mode: 'book',
      title: `سابقه گردش کتاب «${bookTitle}»`,
      subtitle: 'فهرست تمامی کاربرانی که این کتاب را امانت گرفته یا تحویل داده‌اند',
      summary: null,
      results: []
    });
    setHistoryModalLoading(true);
    historyDialogRef.current?.showModal();
    try {
      const res = await api.get(`/api/borrowings/history/?book_id=${bookId}`);
      setHistoryModalData((prev) => ({
        ...prev,
        summary: res.data.summary,
        results: res.data.results || []
      }));
    } catch (err) {
      console.error('Error fetching book history', err);
    } finally {
      setHistoryModalLoading(false);
    }
  };

  const openUserHistoryModal = async (userId, displayName, username) => {
    setHistoryModalData({
      mode: 'user',
      title: `پرونده امانات کاربر «${displayName || username}»`,
      subtitle: `فهرست تمامی کتاب‌هایی که کاربر @${username} امانت گرفته یا تحویل داده است`,
      summary: null,
      results: []
    });
    setHistoryModalLoading(true);
    historyDialogRef.current?.showModal();
    try {
      const res = await api.get(`/api/borrowings/history/?user_id=${userId}`);
      setHistoryModalData((prev) => ({
        ...prev,
        summary: res.data.summary,
        results: res.data.results || []
      }));
    } catch (err) {
      console.error('Error fetching user history', err);
    } finally {
      setHistoryModalLoading(false);
    }
  };

  const handleCreateCategory = async (e) => {
    e.preventDefault();
    if (!catName.trim()) return;
    setCreatingCat(true);
    setMessage(null);
    try {
      await api.post('/api/categories/', {
        name: catName.trim(),
        slug: catSlug.trim() || undefined,
      });
      setCatName('');
      setCatSlug('');
      setMessage({ type: 'success', text: 'دسته‌بندی جدید با موفقیت ایجاد شد.' });
      showToast('دسته‌بندی جدید با موفقیت ایجاد شد.', 'success');
      await fetchStats();
    } catch {
      const errMsg = 'خطا در ایجاد دسته‌بندی. ممکن است نام یا اسلاگ تکراری باشد.';
      setMessage({ type: 'danger', text: errMsg });
      showToast(errMsg, 'danger');
    } finally {
      setCreatingCat(false);
    }
  };

  const handleDeleteCategory = async (catId) => {
    setMessage(null);
    try {
      await api.delete(`/api/categories/${catId}/`);
      setMessage({ type: 'success', text: 'دسته‌بندی با موفقیت حذف شد.' });
      showToast('دسته‌بندی با موفقیت حذف شد.', 'info');
      await fetchStats();
    } catch {
      setMessage({ type: 'danger', text: 'خطا در حذف دسته‌بندی.' });
      showToast('خطا در حذف دسته‌بندی.', 'danger');
    }
  };

  const handleManagerReturnBook = async (borrowingId) => {
    setReturningLoanId(borrowingId);
    setMessage(null);
    try {
      const res = await api.post(`/api/borrowings/${borrowingId}/return/`);
      setMessage({ type: 'success', text: res.data.message });
      showToast(res.data.message, 'success');
      await fetchStats();
      await refreshNotifications();
      if (isSuperuser) await fetchUsers(userSearch);
    } catch {
      setMessage({ type: 'danger', text: 'خطا در ثبت بازگشت کتاب.' });
      showToast('خطا در ثبت بازگشت کتاب.', 'danger');
    } finally {
      setReturningLoanId(null);
    }
  };

  // Superuser Actions
  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword.trim()) return;
    setCreatingUser(true);
    setMessage(null);
    try {
      await api.post('/api/auth/users/', {
        username: newUsername.trim(),
        email: newEmail.trim(),
        age: newAge !== '' ? parseInt(newAge, 10) : null,
        password: newPassword,
        is_staff: newRole === 'staff' || newRole === 'superuser',
        is_superuser: newRole === 'superuser',
      });
      setNewUsername('');
      setNewEmail('');
      setNewAge('');
      setNewPassword('');
      setNewRole('user');
      setShowNewUserForm(false);
      setMessage({ type: 'success', text: 'کاربر جدید با موفقیت ایجاد شد.' });
      showToast('کاربر جدید با موفقیت ایجاد شد.', 'success');
      await fetchUsers(userSearch);
    } catch (err) {
      const data = err.response?.data;
      const firstErr = data ? Object.values(data)[0] : null;
      const errText = firstErr ? String(Array.isArray(firstErr) ? firstErr[0] : firstErr) : 'خطا در ساخت کاربر جدید.';
      setMessage({
        type: 'danger',
        text: errText
      });
      showToast(errText, 'danger');
    } finally {
      setCreatingUser(false);
    }
  };

  const handleChangeUserRole = async (targetUser, roleValue) => {
    setUpdatingUserId(targetUser.id);
    setMessage(null);
    const payload =
      roleValue === 'superuser'
        ? { is_staff: true, is_superuser: true }
        : roleValue === 'staff'
        ? { is_staff: true, is_superuser: false }
        : { is_staff: false, is_superuser: false };

    try {
      await api.patch(`/api/auth/users/${targetUser.id}/`, payload);
      const msg = `سطح دسترسی کاربر «${targetUser.username}» بروزرسانی شد.`;
      setMessage({ type: 'success', text: msg });
      showToast(msg, 'success');
      await fetchUsers(userSearch);
    } catch (err) {
      const errText = err.response?.data?.error || 'خطا در تغییر سطح دسترسی کاربر.';
      setMessage({ type: 'danger', text: errText });
      showToast(errText, 'danger');
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleToggleUserActive = async (targetUser) => {
    setUpdatingUserId(targetUser.id);
    setMessage(null);
    try {
      await api.patch(`/api/auth/users/${targetUser.id}/`, {
        is_active: !targetUser.is_active,
      });
      const msg = `وضعیت حساب کاربر «${targetUser.username}» تغییر یافت.`;
      setMessage({ type: 'success', text: msg });
      showToast(msg, 'info');
      await fetchUsers(userSearch);
    } catch (err) {
      const errText = err.response?.data?.error || 'خطا در تغییر وضعیت حساب کاربر.';
      setMessage({ type: 'danger', text: errText });
      showToast(errText, 'danger');
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleDeleteUser = async (targetUser) => {
    setUpdatingUserId(targetUser.id);
    setMessage(null);
    try {
      await api.delete(`/api/auth/users/${targetUser.id}/`);
      const msg = `کاربر «${targetUser.username}» از سامانه حذف شد.`;
      setMessage({ type: 'success', text: msg });
      showToast(msg, 'info');
      await fetchUsers(userSearch);
    } catch (err) {
      const errText = err.response?.data?.error || 'خطا در حذف کاربر.';
      setMessage({ type: 'danger', text: errText });
      showToast(errText, 'danger');
    } finally {
      setUpdatingUserId(null);
    }
  };

  if (loading) {
    return (
      <div className="container" style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-dim)' }}>
        در حال بارگذاری گزارش‌های مدیریتی...
      </div>
    );
  }

  const {
    total_books = 0,
    borrowed_count = 0,
    available_count = 0,
    categories_count = 0,
    recent_books = [],
    active_borrowings = [],
    all_borrowings = [],
    categories = []
  } = stats || {};

  const availablePercent = total_books > 0 ? Math.round((available_count / total_books) * 100) : 0;
  const borrowedPercent = total_books > 0 ? 100 - availablePercent : 0;
  const maxCatBooks = Math.max(1, ...categories.map((c) => c.books_count || 0));

  const borrowingsList = all_borrowings.length > 0 ? all_borrowings : active_borrowings;
  const filteredBorrowings = borrowingsList.filter((item) => {
    const q = loanSearch.trim().toLowerCase();
    if (q) {
      const matchBorrower =
        (item.borrower_name || '').toLowerCase().includes(q) ||
        (item.username || '').toLowerCase().includes(q);
      const matchBook =
        (item.book_details?.title || '').toLowerCase().includes(q) ||
        (item.book_details?.author || '').toLowerCase().includes(q);
      if (!matchBorrower && !matchBook) return false;
    }

    if (loanFilter === 'active') return !item.return_date;
    if (loanFilter === 'returned') return Boolean(item.return_date);
    if (loanFilter === 'late') return Boolean(item.is_late);
    return true;
  });

  return (
    <div className="container">
      {/* Header (Django Admin link removed, role badge displayed) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
            <h1 style={{ fontSize: '28px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ShieldCheck color="var(--accent2)" size={28} />
              {isSuperuser ? 'پنل مدیریت' : 'پنل کارمند کتابخانه'}
            </h1>
            {isSuperuser ? (
              <span className="badge badge-category" style={{ fontSize: '12px', padding: '5px 12px' }}>
                مدیر
              </span>
            ) : (
              <span className="badge badge-available" style={{ fontSize: '12px', padding: '5px 12px' }}>
                کارمند کتابخانه (Staff)
              </span>
            )}
          </div>
          <p style={{ color: 'var(--text-dim)', fontSize: '14.5px' }}>
            {isSuperuser
              ? 'مدیریت کامل کاربران، سطح دسترسی‌ها، دسته‌بندی‌ها، امانات و آمار مخزن کتابخانه.'
              : 'مشاهده نمودارهای تحلیلی، مدیریت دسته‌بندی‌ها، پیگیری امانت‌ها و وضعیت مخزن.'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Link to="/books/create" className="btn-primary" style={{ fontSize: '13.5px' }}>
            <PlusCircle size={16} /> افزودن کتاب جدید
          </Link>
        </div>
      </div>

      {message && (
        <div className={`alert alert-${message.type}`}>
          {message.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Book Circulation / User Borrowing History Modal */}
      <dialog
        ref={historyDialogRef}
        className="history-dialog"
        aria-labelledby={historyDialogTitleId}
        {...({ closedby: 'any' })}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '14px', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <h2 id={historyDialogTitleId} style={{ fontSize: '19px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <History size={21} color="var(--accent2)" />
              {historyModalData.title}
            </h2>
            {historyModalData.subtitle && (
              <p style={{ fontSize: '12.5px', color: 'var(--muted)', marginTop: '3px' }}>
                {historyModalData.subtitle}
              </p>
            )}
          </div>
          <form method="dialog">
            <button type="submit" value="close" className="btn-outline" style={{ padding: '5px 14px', fontSize: '12.5px' }}>
              بستن پنجره
            </button>
          </form>
        </div>

        {historyModalLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
            در حال دریافت تاریخچه امانات...
          </div>
        ) : (
          <>
            {historyModalData.summary && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11.5px', color: 'var(--muted)' }}>کل دفعات امانت</div>
                  <div style={{ fontSize: '20px', fontWeight: 800 }}>{toPersianDigits(historyModalData.summary.total_records || 0)}</div>
                </div>
                <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11.5px', color: 'var(--muted)' }}>در دست امانت فعلی</div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--accent2)' }}>{toPersianDigits(historyModalData.summary.active_count || 0)}</div>
                </div>
                <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11.5px', color: 'var(--muted)' }}>تحویل به موقع</div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--success)' }}>{toPersianDigits(historyModalData.summary.on_time_returned_count || 0)}</div>
                </div>
                <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11.5px', color: 'var(--muted)' }}>دارای تأخیر</div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--danger)' }}>{toPersianDigits(historyModalData.summary.late_count || 0)}</div>
                </div>
              </div>
            )}

            {historyModalData.results.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}>
                هیچ سابقه امانتی برای این مورد ثبت نشده است.
              </div>
            ) : (
              <div className="table-wrapper" tabIndex={0} role="region" aria-label={historyModalData.title}>
                <table>
                  <thead>
                    <tr>
                      {historyModalData.mode === 'book' ? <th>نام امانت‌گیرنده</th> : <th>عنوان کتاب</th>}
                      <th>تاریخ امانت</th>
                      <th>مهلت بازگشت</th>
                      <th>تاریخ تحویل</th>
                      <th>مدت نگهداری</th>
                      <th>وضعیت</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyModalData.results.map((rec) => (
                      <tr key={rec.id}>
                        <td>
                          {historyModalData.mode === 'book' ? (
                            <div>
                              <strong style={{ color: 'var(--text)', display: 'block' }}>
                                {rec.borrower_name || rec.username}
                              </strong>
                              <span style={{ fontSize: '11.5px', color: 'var(--accent2)' }}>
                                @{rec.username}
                              </span>
                            </div>
                          ) : (
                            <div>
                              <Link
                                to={`/books/${rec.book}`}
                                onClick={() => historyDialogRef.current?.close()}
                                style={{ fontWeight: 700, color: 'var(--text)', display: 'block' }}
                              >
                                {rec.book_details?.title || 'کتاب'}
                              </Link>
                              {rec.book_details?.author && (
                                <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
                                  اثر {rec.book_details.author}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td>{formatPersianDate(rec.borrow_date)}</td>
                        <td>
                          {formatPersianDate(rec.due_date)}
                          {rec.is_extended && (
                            <span style={{ fontSize: '10.5px', color: 'var(--accent2)', marginRight: '5px' }}>
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
                            <span style={{ color: 'var(--accent2)', fontWeight: 600 }}>هم‌اکنون در امانت</span>
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
          </>
        )}
      </dialog>

      {/* 1. Metric Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '18px', marginBottom: '36px' }}>
        <div className="card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)', marginBottom: '10px' }}>
            <span style={{ fontSize: '13.5px', fontWeight: 600 }}>کل کتاب‌های ثبت‌شده</span>
            <BookOpen size={20} color="var(--accent2)" />
          </div>
          <div style={{ fontSize: '34px', fontWeight: 800 }}>
            {toPersianDigits(total_books)}
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--text-dim)', marginTop: '4px' }}>
            مجموع کل عناوین موجود در سامانه
          </div>
        </div>

        <div className="card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)', marginBottom: '10px' }}>
            <span style={{ fontSize: '13.5px', fontWeight: 600 }}>در دست امانت</span>
            <ArrowUpLeft size={20} color="var(--danger)" />
          </div>
          <div style={{ fontSize: '34px', fontWeight: 800, color: 'var(--danger)' }}>
            {toPersianDigits(borrowed_count)}
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--text-dim)', marginTop: '4px' }}>
            کتاب‌های در اختیار اعضا
          </div>
        </div>

        <div className="card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)', marginBottom: '10px' }}>
            <span style={{ fontSize: '13.5px', fontWeight: 600 }}>موجود در قفسه</span>
            <BookCheck size={20} color="var(--success)" />
          </div>
          <div style={{ fontSize: '34px', fontWeight: 800, color: 'var(--success)' }}>
            {toPersianDigits(available_count)}
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--text-dim)', marginTop: '4px' }}>
            آماده امانت‌گیری فوری
          </div>
        </div>

        <div className="card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)', marginBottom: '10px' }}>
            <span style={{ fontSize: '13.5px', fontWeight: 600 }}>دسته‌بندی‌ها</span>
            <Layers size={20} color="var(--accent2)" />
          </div>
          <div style={{ fontSize: '34px', fontWeight: 800 }}>
            {toPersianDigits(categories_count)}
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--text-dim)', marginTop: '4px' }}>
            ژانرها و موضوعات فعال
          </div>
        </div>
      </div>

      {/* 2. SUPERUSER-ONLY: User Management Section */}
      {isSuperuser && (
        <div className="card" style={{ padding: '28px', marginBottom: '44px', border: '1px solid rgba(232, 168, 56, 0.35)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px', marginBottom: '20px' }}>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Crown size={22} color="var(--accent2)" />
                مدیریت کاربران و سطوح دسترسی ({toPersianDigits(usersList.length)} کاربر)
              </h2>
              <p style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '2px' }}>
                این بخش صرفاً برای مدیر ارشد (Superuser) قابل مشاهده است. می‌توانید نقش کاربران (کاربر عادی / کارمند / مدیر ارشد) را تغییر دهید.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div className="search-input-wrapper" style={{ flex: '1 1 220px', minWidth: '220px' }}>
                <Search size={15} className="search-input-icon" />
                <input
                  type="text"
                  className="form-control"
                  style={{ padding: '8px 38px 8px 12px', fontSize: '13px' }}
                  placeholder="جستجوی نام کاربری یا ایمیل..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                />
              </div>

              <button
                type="button"
                className="btn-primary"
                style={{ fontSize: '13px', padding: '8px 16px' }}
                onClick={() => setShowNewUserForm(!showNewUserForm)}
              >
                <UserPlus size={15} />
                {showNewUserForm ? 'بستن فرم ساخت کاربر' : 'افزودن کاربر جدید'}
              </button>
            </div>
          </div>

          {/* Create New User Form */}
          {showNewUserForm && (
            <form
              onSubmit={handleCreateUser}
              style={{
                background: 'var(--surface2)',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-md)',
                padding: '20px',
                marginBottom: '22px'
              }}
            >
              <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '14px' }}>
                ایجاد حساب کاربری یا کارمند جدید
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px' }}>
                <div>
                  <label className="form-label">نام کاربری *</label>
                  <input
                    type="text"
                    className="form-control"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="username"
                    dir="ltr"
                    required
                  />
                </div>
                <div>
                  <label className="form-label">رمز عبور *</label>
                  <input
                    type="password"
                    className="form-control"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="حداقل ۴ کاراکتر"
                    dir="ltr"
                    required
                  />
                </div>
                <div>
                  <label className="form-label">ایمیل</label>
                  <input
                    type="email"
                    className="form-control"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="user@example.com"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="form-label">سن</label>
                  <input
                    type="number"
                    min="1"
                    className="form-control"
                    value={newAge}
                    onChange={(e) => setNewAge(e.target.value)}
                    placeholder="25"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="form-label">نقش و سطح دسترسی</label>
                  <select
                    className="form-control"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                  >
                    <option value="user">کاربر عادی</option>
                    <option value="staff">کارمند کتابخانه (Staff)</option>
                    <option value="superuser">مدیر ارشد (Superuser)</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                <button
                  type="button"
                  className="btn-outline"
                  style={{ fontSize: '13px', padding: '7px 14px' }}
                  onClick={() => setShowNewUserForm(false)}
                >
                  انصراف
                </button>
                <button type="submit" disabled={creatingUser} className="btn-primary" style={{ fontSize: '13px', padding: '7px 18px' }}>
                  {creatingUser ? 'در حال ثبت...' : 'ایجاد کاربر'}
                </button>
              </div>
            </form>
          )}

          {/* Users Table */}
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>کاربر</th>
                  <th>ایمیل</th>
                  <th>سن</th>
                  <th>نقش و سطح دسترسی</th>
                  <th>امانت‌ها (فعال / کل)</th>
                  <th>وضعیت حساب</th>
                  <th>عملیات مدیر ارشد</th>
                </tr>
              </thead>
              <tbody>
                {usersLoading ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>
                      در حال بارگذاری لیست کاربران...
                    </td>
                  </tr>
                ) : usersList.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>
                      کاربری یافت نشد.
                    </td>
                  </tr>
                ) : (
                  usersList.map((u) => {
                    const isSelf = u.id === currentUser?.id;
                    const currentRoleValue = u.is_superuser
                      ? 'superuser'
                      : u.is_staff
                      ? 'staff'
                      : 'user';

                    return (
                      <tr key={u.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span className="user-pill-avatar">
                              {u.username?.[0]?.toUpperCase() || 'U'}
                            </span>
                            <div>
                              <strong style={{ color: 'var(--text)', display: 'block' }}>
                                @{u.username}
                                {isSelf && (
                                  <span style={{ fontSize: '11px', color: 'var(--accent2)', marginRight: '6px' }}>
                                    (شما)
                                  </span>
                                )}
                              </strong>
                              <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
                                عضویت: {formatPersianDate(u.date_joined)}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td dir="ltr" style={{ textAlign: 'right', color: 'var(--text-dim)', fontSize: '13px' }}>
                          {u.email || '—'}
                        </td>
                        <td>{u.age ? `${toPersianDigits(u.age)} سال` : '—'}</td>
                        <td>
                          <select
                            className="form-control"
                            style={{ padding: '5px 10px', fontSize: '12.5px', minWidth: '155px' }}
                            value={currentRoleValue}
                            disabled={isSelf || updatingUserId === u.id}
                            onChange={(e) => handleChangeUserRole(u, e.target.value)}
                            aria-label={`تغییر نقش ${u.username}`}
                          >
                            <option value="user">کاربر عادی</option>
                            <option value="staff">کارمند کتابخانه (Staff)</option>
                            <option value="superuser">مدیر ارشد (Superuser)</option>
                          </select>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span className="badge badge-category">
                              {toPersianDigits(u.active_borrowings_count || 0)} فعال
                            </span>
                            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                              از {toPersianDigits(u.total_borrowings_count || 0)}
                            </span>
                            <button
                              type="button"
                              onClick={() => openUserHistoryModal(u.id, u.username, u.username)}
                              className="btn-outline"
                              style={{ padding: '3px 9px', fontSize: '11.5px' }}
                              title="مشاهده کتاب‌های امانتی این کاربر"
                            >
                              <History size={12} /> سوابق کتاب‌ها
                            </button>
                          </div>
                        </td>
                        <td>
                          {u.is_active ? (
                            <span className="badge badge-available">فعال</span>
                          ) : (
                            <span className="badge badge-borrowed">غیرفعال</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <button
                              type="button"
                              disabled={isSelf || updatingUserId === u.id}
                              onClick={() => handleToggleUserActive(u)}
                              className={u.is_active ? 'btn-outline' : 'btn-success'}
                              style={{ padding: '5px 10px', fontSize: '12px' }}
                              title={u.is_active ? 'مسدود کردن حساب' : 'فعال‌سازی حساب'}
                            >
                              {u.is_active ? <UserX size={13} /> : <UserCheck size={13} />}
                              {u.is_active ? 'غیرفعال‌سازی' : 'فعال‌سازی'}
                            </button>

                            {!isSelf && (
                              <button
                                type="button"
                                disabled={updatingUserId === u.id}
                                onClick={() => handleDeleteUser(u)}
                                className="btn-danger"
                                style={{ padding: '5px 10px', fontSize: '12px' }}
                                title="حذف کاربر"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. Visual Analytics Charts Row */}
      <div className="form-grid-2" style={{ gap: '22px', marginBottom: '44px' }}>
        {/* Donut Chart Card */}
        <div className="card" style={{ padding: '26px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PieChart size={20} color="var(--accent2)" />
            نمودار وضعیت موجودی مخزن
          </h2>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', gap: '24px', flexWrap: 'wrap', margin: 'auto 0' }}>
            <div style={{ position: 'relative', width: '150px', height: '150px' }}>
              <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                <circle
                  cx="18"
                  cy="18"
                  r="15.915"
                  fill="transparent"
                  stroke="var(--danger)"
                  strokeWidth="3.8"
                  strokeOpacity="0.85"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="15.915"
                  fill="transparent"
                  stroke="var(--success)"
                  strokeWidth="3.8"
                  strokeDasharray={`${availablePercent} ${100 - availablePercent}`}
                  strokeLinecap="round"
                />
              </svg>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <span style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text)' }}>
                  %{toPersianDigits(availablePercent)}
                </span>
                <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>موجود در قفسه</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '4px', background: 'var(--success)' }} />
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700 }}>
                    موجود ({toPersianDigits(available_count)} جلد)
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                    %{toPersianDigits(availablePercent)} از کل مخزن
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '4px', background: 'var(--danger)' }} />
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700 }}>
                    امانت داده شده ({toPersianDigits(borrowed_count)} جلد)
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                    %{toPersianDigits(borrowedPercent)} از کل مخزن
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Category Bar Chart Card */}
        <div className="card" style={{ padding: '26px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BarChart3 size={20} color="var(--accent2)" />
            توزیع کتاب‌ها بر اساس دسته‌بندی
          </h2>

          {categories.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: '13.5px' }}>دسته‌بندی فعالی ثبت نشده است.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {categories.map((cat) => {
                const count = cat.books_count || 0;
                const widthPct = Math.max(6, Math.round((count / maxCatBooks) * 100));
                return (
                  <div key={cat.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '5px' }}>
                      <span style={{ fontWeight: 600 }}>{cat.name}</span>
                      <span style={{ color: 'var(--text-dim)' }}>{toPersianDigits(count)} کتاب</span>
                    </div>
                    <div style={{ width: '100%', height: '9px', background: 'var(--surface2)', borderRadius: '50px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${widthPct}%`,
                          height: '100%',
                          background: 'linear-gradient(90deg, var(--accent), var(--accent2))',
                          borderRadius: '50px',
                          transition: 'width 0.4s ease'
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 4. Category Management Section */}
      <div className="card" style={{ padding: '26px', marginBottom: '44px' }}>
        <h2 style={{ fontSize: '19px', fontWeight: 800, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Layers size={20} color="var(--accent2)" />
          مدیریت دسته‌بندی‌های موضوعی
        </h2>

        <form onSubmit={handleCreateCategory} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
          <input
            type="text"
            className="form-control"
            style={{ flex: '1 1 220px' }}
            placeholder="نام دسته‌بندی جدید (مثلاً: علمی و پژوهشی)"
            value={catName}
            onChange={(e) => setCatName(e.target.value)}
            required
          />
          <input
            type="text"
            className="form-control"
            style={{ flex: '1 1 180px' }}
            placeholder="اسلاگ لاتین (اختیاری، مثلاً: science)"
            value={catSlug}
            onChange={(e) => setCatSlug(e.target.value)}
            dir="ltr"
          />
          <button type="submit" disabled={creatingCat} className="btn-primary">
            <PlusCircle size={16} />
            {creatingCat ? 'در حال ثبت...' : 'افزودن دسته‌بندی'}
          </button>
        </form>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {categories.map((cat) => (
            <div
              key={cat.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background: 'var(--surface2)',
                border: '1px solid var(--border-strong)',
                borderRadius: '50px',
                padding: '6px 14px',
                fontSize: '13px'
              }}
            >
              <span style={{ fontWeight: 700 }}>{cat.name}</span>
              <span style={{ color: 'var(--muted)', fontSize: '12px' }}>
                ({toPersianDigits(cat.books_count || 0)})
              </span>
              <button
                type="button"
                onClick={() => handleDeleteCategory(cat.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--danger)',
                  display: 'inline-flex',
                  padding: '2px'
                }}
                title="حذف دسته‌بندی"
                aria-label={`حذف ${cat.name}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 5. Borrowings & Return History Table (Showing Borrower Name Clearly + Book/User History Modals) */}
      <div style={{ marginBottom: '44px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '21px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BookMarked size={22} color="var(--accent2)" />
              لیست و تاریخچه امانات کتابخانه ({toPersianDigits(filteredBorrowings.length)})
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '3px' }}>
              برای مشاهده پرونده امانات هر کاربر یا سابقه گردش هر کتاب، روی دکمه تاریخچه مقابل آن کلیک کنید
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div className="search-input-wrapper" style={{ minWidth: '220px' }}>
              <Search size={15} className="search-input-icon" />
              <input
                type="text"
                className="form-control"
                placeholder="جستجوی نام کاربر یا عنوان کتاب..."
                value={loanSearch}
                onChange={(e) => setLoanSearch(e.target.value)}
                style={{ padding: '7px 36px 7px 12px', fontSize: '13px' }}
              />
            </div>

            <div className="tabs-pill-group">
              <button
                type="button"
                className={`tab-pill-btn ${loanFilter === 'all' ? 'active' : ''}`}
                onClick={() => setLoanFilter('all')}
              >
                همه امانت‌ها ({toPersianDigits(borrowingsList.length)})
              </button>
              <button
                type="button"
                className={`tab-pill-btn ${loanFilter === 'active' ? 'active' : ''}`}
                onClick={() => setLoanFilter('active')}
              >
                در دست امانت ({toPersianDigits(active_borrowings.length)})
              </button>
              <button
                type="button"
                className={`tab-pill-btn ${loanFilter === 'returned' ? 'active' : ''}`}
                onClick={() => setLoanFilter('returned')}
              >
                تحویل داده شده ({toPersianDigits(Math.max(0, borrowingsList.length - active_borrowings.length))})
              </button>
              <button
                type="button"
                className={`tab-pill-btn ${loanFilter === 'late' ? 'active' : ''}`}
                onClick={() => setLoanFilter('late')}
              >
                دارای تأخیر ({toPersianDigits(borrowingsList.filter((item) => item.is_late).length)})
              </button>
            </div>
          </div>
        </div>

        {filteredBorrowings.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}>
            موردی در این بخش از لیست امانات یافت نشد.
          </div>
        ) : (
          <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
            <div className="table-wrapper" tabIndex={0} role="region" aria-label="لیست و تاریخچه امانات کتابخانه">
              <table>
                <thead>
                  <tr>
                    <th>نام امانت‌گیرنده</th>
                    <th>عنوان کتاب</th>
                    <th>تاریخ امانت</th>
                    <th>موعد تحویل / تاریخ بازگشت</th>
                    <th>مدت نگهداری</th>
                    <th>وضعیت</th>
                    <th>عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBorrowings.map((loan) => {
                    const isReturned = Boolean(loan.return_date);
                    const rem = getRemainingDays(loan.due_date);
                    const overdue = !isReturned && rem !== null && rem < 0;
                    const borrowerDisplay = loan.borrower_name || loan.username || 'کاربر';

                    return (
                      <tr key={loan.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span className="user-pill-avatar">
                              {borrowerDisplay[0]?.toUpperCase() || 'U'}
                            </span>
                            <div>
                              <strong style={{ color: 'var(--text)', display: 'block', fontSize: '14px' }}>
                                {borrowerDisplay}
                              </strong>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                                <span style={{ fontSize: '12px', color: 'var(--accent2)' }}>
                                  @{loan.username}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => openUserHistoryModal(loan.user, borrowerDisplay, loan.username)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--text-dim)',
                                    fontSize: '11px',
                                    textDecoration: 'underline',
                                    padding: 0,
                                    cursor: 'pointer'
                                  }}
                                  title="مشاهده تمام کتاب‌هایی که این کاربر امانت گرفته است"
                                >
                                  (پرونده کاربر)
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <Link to={`/books/${loan.book}`} style={{ fontWeight: 700, color: 'var(--text)' }}>
                              {loan.book_details?.title || 'کتاب'}
                            </Link>
                            <div>
                              <button
                                type="button"
                                onClick={() => openBookHistoryModal(loan.book, loan.book_details?.title || 'کتاب')}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: 'var(--accent2)',
                                  fontSize: '11.5px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: 0,
                                  cursor: 'pointer'
                                }}
                                title="مشاهده تمام کسانی که این کتاب را امانت گرفته‌اند"
                              >
                                <History size={12} /> سابقه گردش کتاب
                              </button>
                            </div>
                          </div>
                        </td>
                        <td>{formatPersianDate(loan.borrow_date)}</td>
                        <td>
                          {isReturned ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span>تحویل در {formatPersianDate(loan.return_date)}</span>
                              {loan.returned_by_label && (
                                <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                                  {loan.returned_by_label}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span>موعد: {formatPersianDate(loan.due_date)}</span>
                              {loan.is_extended && (
                                <span style={{ fontSize: '11px', color: 'var(--accent2)' }}>
                                  (تمدید شده +۷ روز)
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td>{toPersianDigits(loan.duration_days || 1)} روز</td>
                        <td>
                          {isReturned ? (
                            loan.is_late ? (
                              <span className="badge badge-borrowed">
                                تحویل با {toPersianDigits(loan.late_days)} روز تأخیر
                              </span>
                            ) : (
                              <span className="badge badge-available">تحویل به موقع</span>
                            )
                          ) : overdue ? (
                            <span className="badge badge-borrowed">
                              {toPersianDigits(Math.abs(rem))} روز تأخیر
                            </span>
                          ) : (
                            <span className="badge badge-category">
                              در امانت ({toPersianDigits(rem ?? 0)} روز مانده)
                            </span>
                          )}
                        </td>
                        <td>
                          {!isReturned ? (
                            <button
                              type="button"
                              onClick={() => handleManagerReturnBook(loan.id)}
                              disabled={returningLoanId === loan.id}
                              className="btn-success"
                              style={{ padding: '5px 12px', fontSize: '12px' }}
                            >
                              <RotateCcw size={13} />
                              {returningLoanId === loan.id ? 'در حال ثبت...' : 'ثبت تحویل کتاب'}
                            </button>
                          ) : (
                            <Link to={`/books/${loan.book}`} className="btn-outline" style={{ padding: '4px 10px', fontSize: '12px' }}>
                              مشاهده کتاب
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 6. Recent Additions & Book Circulation Table */}
      <div>
        <h2 style={{ fontSize: '21px', fontWeight: 800, marginBottom: '16px' }}>
          مخزن کتاب‌ها و سابقه گردش هر کتاب
        </h2>

        <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
          <div className="table-wrapper" tabIndex={0} role="region" aria-label="مخزن کتاب‌ها">
            <table>
              <thead>
                <tr>
                  <th>عنوان کتاب</th>
                  <th>نویسنده</th>
                  <th>دسته‌بندی</th>
                  <th>قیمت</th>
                  <th>وضعیت و امانت‌گیرنده فعلی</th>
                  <th>تعداد امانت</th>
                  <th>عملیات و تاریخچه</th>
                </tr>
              </thead>
              <tbody>
                {recent_books.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <strong style={{ color: 'var(--text)' }}>{b.title}</strong>
                    </td>
                    <td>{b.author}</td>
                    <td>
                      <span className="badge badge-category">{b.category_name || '—'}</span>
                    </td>
                    <td>{formatPrice(b.price)}</td>
                    <td>
                      {b.is_available ? (
                        <span className="badge badge-available">موجود در قفسه</span>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span className="badge badge-borrowed">امانت داده شده</span>
                          {b.current_borrower && (
                            <span style={{ fontSize: '12px', color: 'var(--accent2)', fontWeight: 700 }}>
                              (امانت‌گیرنده: {b.current_borrower})
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="badge badge-category">
                        {toPersianDigits(b.total_borrows_count || 0)} نوبت
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => openBookHistoryModal(b.id, b.title)}
                          className="btn-outline"
                          style={{ padding: '5px 10px', fontSize: '12px' }}
                        >
                          <History size={13} /> سابقه امانت کتاب
                        </button>
                        <Link to={`/books/${b.id}`} className="btn-outline" style={{ padding: '5px 10px', fontSize: '12px' }}>
                          مشاهده کتاب
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
