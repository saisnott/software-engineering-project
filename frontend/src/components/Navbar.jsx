import React, { useState, useEffect, useRef } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useNotifications } from '../context/NotificationContext';
import { formatPersianDate, toPersianDigits } from '../utils/formatters';
import {
  BookOpen,
  PlusCircle,
  User,
  LogOut,
  ShieldCheck,
  Sun,
  Moon,
  Menu,
  X,
  Home,
  Library,
  Bell,
  CheckCheck,
  RotateCcw,
  CalendarPlus,
  MessageSquare,
  AlertCircle,
  Sparkles
} from 'lucide-react';

export const Navbar = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const {
    notifications,
    unreadCount,
    refreshNotifications,
    markAsRead,
    markAllAsRead,
    showToast
  } = useNotifications();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifWrapRef = useRef(null);

  // Close mobile drawer & refresh notifications when route changes
  useEffect(() => {
    setMobileMenuOpen(false);
    setNotifOpen(false);
    if (isAuthenticated) {
      refreshNotifications();
    }
  }, [location.pathname, isAuthenticated, refreshNotifications]);

  // Close notification dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notifWrapRef.current && !notifWrapRef.current.contains(event.target)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    setMobileMenuOpen(false);
    showToast('با موفقیت از حساب کاربری خارج شدید.', 'info');
    navigate('/');
  };

  const getNotifIcon = (type) => {
    switch (type) {
      case 'return':
        return <RotateCcw size={16} color="var(--success)" />;
      case 'waitlist':
        return <Sparkles size={16} color="var(--accent2)" />;
      case 'extend':
        return <CalendarPlus size={16} color="var(--accent2)" />;
      case 'comment':
        return <MessageSquare size={16} color="var(--accent2)" />;
      case 'reminder':
        return <AlertCircle size={16} color="var(--danger)" />;
      case 'role':
        return <ShieldCheck size={16} color="var(--accent2)" />;
      default:
        return <BookOpen size={16} color="var(--accent2)" />;
    }
  };

  return (
    <>
      <header className="site-header">
        <div className="container">
          <div className="nav-inner">
            {/* Right: Brand */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
              <Link to="/" className="brand">
                <span className="brand-logo-box">
                  <Library size={20} />
                </span>
                <div>
                  <span>کتاب‌سرا</span>
                  <span className="brand-subtitle">سامانه هوشمند کتابخانه</span>
                </div>
              </Link>

              {/* Desktop Navigation Links */}
              <nav className="nav-links desktop-only">
                <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <Home size={16} />
                  صفحه اصلی
                </NavLink>

                <NavLink to="/books" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <BookOpen size={16} />
                  کاتالوگ کتاب‌ها
                </NavLink>

                {isAuthenticated && (
                  <NavLink to="/books/create" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <PlusCircle size={16} />
                    افزودن کتاب
                  </NavLink>
                )}
              </nav>
            </div>

            {/* Left: Theme Toggle + Notifications + Auth Actions + Mobile Hamburger */}
            <div className="nav-actions">
              <button
                type="button"
                onClick={toggleTheme}
                className="theme-toggle-btn"
                title={isDark ? 'تغییر به تم روشن' : 'تغییر به تم تیره'}
                aria-label={isDark ? 'تغییر به تم روشن' : 'تغییر به تم تیره'}
              >
                {isDark ? <Sun size={18} /> : <Moon size={18} />}
              </button>

              {isAuthenticated && (
                <div className="notif-bell-wrap" ref={notifWrapRef}>
                  <button
                    type="button"
                    onClick={() => setNotifOpen((prev) => !prev)}
                    className="theme-toggle-btn"
                    title="اعلان‌ها و پیام‌ها"
                    aria-label="اعلان‌ها و پیام‌ها"
                  >
                    <Bell size={18} />
                    {unreadCount > 0 && (
                      <span className="notif-badge">
                        {toPersianDigits(unreadCount > 9 ? '9+' : unreadCount)}
                      </span>
                    )}
                  </button>

                  {notifOpen && (
                    <>
                      <div
                        className="notif-mobile-backdrop"
                        onClick={() => setNotifOpen(false)}
                      />
                      <div className="notif-dropdown-panel">
                        <div
                          style={{
                            padding: '13px 16px',
                            borderBottom: '1px solid var(--border)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '8px',
                            background: 'var(--surface2)'
                          }}
                        >
                          <div style={{ fontWeight: 800, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Bell size={15} color="var(--accent2)" />
                            <span>اعلان‌های شما</span>
                            {unreadCount > 0 && (
                              <span className="badge badge-category" style={{ fontSize: '11px', padding: '2px 8px' }}>
                                {toPersianDigits(unreadCount)} جدید
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {unreadCount > 0 && (
                              <button
                                type="button"
                                onClick={markAllAsRead}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: 'var(--accent2)',
                                  fontSize: '12px',
                                  fontWeight: 700,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  cursor: 'pointer'
                                }}
                              >
                                <CheckCheck size={14} /> خواندن همه
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setNotifOpen(false)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--muted)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '2px',
                                cursor: 'pointer'
                              }}
                              aria-label="بستن اعلان‌ها"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        </div>

                      <div className="notif-dropdown-list">
                        {notifications.length === 0 ? (
                          <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: '13.5px' }}>
                            هنوز اعلانی برای شما ثبت نشده است.
                          </div>
                        ) : (
                          notifications.map((n) => (
                            <div
                              key={n.id}
                              className={`notif-dropdown-item ${!n.is_read ? 'unread' : ''}`}
                              onClick={() => {
                                if (!n.is_read) markAsRead(n.id);
                                setNotifOpen(false);
                                if (n.link) navigate(n.link);
                              }}
                            >
                              <div
                                style={{
                                  width: '34px',
                                  height: '34px',
                                  borderRadius: '10px',
                                  background: 'var(--surface2)',
                                  border: '1px solid var(--border)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                  marginTop: '2px'
                                }}
                              >
                                {getNotifIcon(n.notif_type)}
                              </div>

                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '3px' }}>
                                  <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text)' }}>
                                    {n.title}
                                  </span>
                                  {!n.is_read && (
                                    <span
                                      style={{
                                        width: '8px',
                                        height: '8px',
                                        borderRadius: '50%',
                                        background: 'var(--accent)',
                                        flexShrink: 0
                                      }}
                                    />
                                  )}
                                </div>
                                <p style={{ fontSize: '12.5px', color: 'var(--text-dim)', lineHeight: 1.5, marginBottom: '4px' }}>
                                  {n.message}
                                </p>
                                <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                                  {formatPersianDate(n.created_at)}
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                    </>
                  )}
                </div>
              )}

              {isAuthenticated ? (
                <div className="desktop-only" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Link to="/dashboard" className="user-pill" title="داشبورد کاربری">
                    <span className="user-pill-avatar">
                      {user?.username?.[0]?.toUpperCase() || <User size={14} />}
                    </span>
                    <span>{user?.username}</span>
                  </Link>

                  {(user?.is_staff || user?.is_superuser) && (
                    <Link
                      to="/manager/dashboard"
                      className="nav-link"
                      title={user?.is_superuser ? 'پنل مدیریت' : 'پنل کارمند کتابخانه'}
                    >
                      <ShieldCheck size={16} color="var(--accent2)" />
                      <span>{user?.is_superuser ? 'پنل مدیریت' : 'پنل کارمند کتابخانه'}</span>
                    </Link>
                  )}

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="btn-danger"
                    style={{ padding: '7px 14px', fontSize: '13px' }}
                  >
                    <LogOut size={15} />
                    خروج
                  </button>
                </div>
              ) : (
                <div className="desktop-only" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Link to="/login" className="btn-outline" style={{ padding: '7px 16px', fontSize: '13.5px' }}>
                    ورود به حساب
                  </Link>
                  <Link to="/register" className="btn-primary" style={{ padding: '7px 18px', fontSize: '13.5px' }}>
                    عضویت رایگان
                  </Link>
                </div>
              )}

              {/* Mobile Hamburger Trigger */}
              <button
                type="button"
                className="mobile-menu-btn"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="باز کردن منو"
              >
                <Menu size={20} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Slide-Out Drawer */}
      <div
        className={`mobile-drawer-backdrop ${mobileMenuOpen ? 'open' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
      />
      <aside className={`mobile-drawer ${mobileMenuOpen ? 'open' : ''}`} aria-label="منوی موبایل">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '16px', borderBottom: '1px solid var(--border)' }}>
          <Link to="/" className="brand" onClick={() => setMobileMenuOpen(false)}>
            <span className="brand-logo-box" style={{ width: '32px', height: '32px' }}>
              <Library size={17} />
            </span>
            <span style={{ fontSize: '18px' }}>کتاب‌سرا</span>
          </Link>
          <button
            type="button"
            className="theme-toggle-btn"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="بستن منو"
          >
            <X size={18} />
          </button>
        </div>

        {isAuthenticated && (
          <Link
            to="/dashboard"
            className="user-pill"
            style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)' }}
          >
            <span className="user-pill-avatar" style={{ width: '32px', height: '32px', fontSize: '14px' }}>
              {user?.username?.[0]?.toUpperCase() || <User size={16} />}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontWeight: 700, fontSize: '14px' }}>{user?.username}</span>
              <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>مشاهده داشبورد کاربری</span>
            </div>
          </Link>
        )}

        <nav className="mobile-drawer-links">
          <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Home size={18} />
            صفحه اصلی
          </NavLink>

          <NavLink to="/books" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <BookOpen size={18} />
            کاتالوگ کتاب‌ها
          </NavLink>

          {isAuthenticated && (
            <NavLink to="/books/create" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <PlusCircle size={18} />
              افزودن کتاب جدید
            </NavLink>
          )}

          {isAuthenticated && (
            <button
              type="button"
              className="nav-link"
              onClick={() => {
                setMobileMenuOpen(false);
                setNotifOpen(true);
              }}
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                textAlign: 'right',
                justifyContent: 'space-between'
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px' }}>
                <Bell size={18} color="var(--accent2)" />
                اعلان‌ها و پیام‌ها
              </span>
              {unreadCount > 0 && (
                <span className="badge badge-borrowed" style={{ fontSize: '11px', padding: '2px 8px' }}>
                  {toPersianDigits(unreadCount)} جدید
                </span>
              )}
            </button>
          )}

          {isAuthenticated && (user?.is_staff || user?.is_superuser) && (
            <NavLink to="/manager/dashboard" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <ShieldCheck size={18} color="var(--accent2)" />
              {user?.is_superuser ? 'پنل مدیریت' : 'پنل کارمند کتابخانه'}
            </NavLink>
          )}
        </nav>

        <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {isAuthenticated ? (
            <button
              type="button"
              onClick={handleLogout}
              className="btn-danger"
              style={{ width: '100%', padding: '10px' }}
            >
              <LogOut size={16} />
              خروج از حساب کاربری
            </button>
          ) : (
            <>
              <Link to="/login" className="btn-outline" style={{ width: '100%' }}>
                ورود به حساب
              </Link>
              <Link to="/register" className="btn-primary" style={{ width: '100%' }}>
                عضویت رایگان
              </Link>
            </>
          )}
        </div>
      </aside>
    </>
  );
};
