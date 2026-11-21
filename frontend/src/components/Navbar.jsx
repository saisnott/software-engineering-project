import React, { useState, useEffect, useRef, useId, useCallback } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useNotifications } from '../context/NotificationContext';
import { formatPersianDate, formatPrice, toPersianDigits } from '../utils/formatters';
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
  Sparkles,
  Wallet,
  ChevronDown,
  LayoutDashboard,
  Heart,
  UserCog,
  AlertTriangle
} from 'lucide-react';

const supportsPopover = () =>
  typeof HTMLElement !== 'undefined' && Object.hasOwn(HTMLElement.prototype, 'popover');

const supportsInvokerCommands = () =>
  typeof HTMLButtonElement !== 'undefined' && 'commandForElement' in HTMLButtonElement.prototype;

const supportsAnchorPositionArea = () =>
  typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('position-area: block-end');

const supportsImplicitAnchorSource = () =>
  typeof ToggleEvent !== 'undefined' && 'source' in ToggleEvent.prototype;

const supportsFocusGroup = () =>
  typeof HTMLElement !== 'undefined' && 'focusGroup' in HTMLElement.prototype;

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
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const notifWrapRef = useRef(null);
  const userMenuTriggerRef = useRef(null);
  const userMenuPopoverRef = useRef(null);
  const userMenuGroupRef = useRef(null);
  const enterOnOpenRef = useRef(false);
  const pointerTriggeredRef = useRef(false);

  const userMenuTriggerId = useId();
  const userMenuId = useId();

  const getMenuItems = useCallback(() => {
    const group = userMenuGroupRef.current;
    if (!group) return [];
    return [...group.querySelectorAll('a[href], button')].filter(
      (item) => !item.disabled && item.getAttribute('aria-disabled') !== 'true'
    );
  }, []);

  const isUserMenuPopoverOpen = useCallback(() => {
    const popoverEl = userMenuPopoverRef.current;
    if (!popoverEl) return false;
    if (supportsPopover()) {
      try {
        return popoverEl.matches(':popover-open');
      } catch {
        return userMenuOpen;
      }
    }
    return userMenuOpen;
  }, [userMenuOpen]);

  const hideUserMenuPopover = useCallback(() => {
    const popoverEl = userMenuPopoverRef.current;
    if (!popoverEl) return;
    if (supportsPopover()) {
      try {
        if (popoverEl.matches(':popover-open')) {
          popoverEl.hidePopover();
        }
      } catch {
        // ignore if already hidden
      }
    } else {
      setUserMenuOpen(false);
    }
  }, []);

  const closeUserMenuAndRestore = useCallback(({ fromPointer = false } = {}) => {
    const triggerEl = userMenuTriggerRef.current;
    if (triggerEl) {
      try {
        triggerEl.focus(fromPointer ? { focusVisible: false } : undefined);
      } catch {
        triggerEl.focus();
      }
    }
    hideUserMenuPopover();
  }, [hideUserMenuPopover]);

  const positionPopoverFallback = useCallback(() => {
    if (supportsAnchorPositionArea()) return;
    const triggerEl = userMenuTriggerRef.current;
    const popoverEl = userMenuPopoverRef.current;
    if (!triggerEl || !popoverEl) return;

    const triggerRect = triggerEl.getBoundingClientRect();
    const popRect = popoverEl.getBoundingClientRect();
    const gap = 8;
    const pad = 12;

    let top = triggerRect.bottom + gap;
    if (top + popRect.height > window.innerHeight - pad && triggerRect.top - gap - popRect.height >= pad) {
      top = triggerRect.top - gap - popRect.height;
    }
    top = Math.max(pad, Math.min(top, window.innerHeight - popRect.height - pad));

    let left = triggerRect.left;
    if (left + popRect.width > window.innerWidth - pad) {
      left = triggerRect.right - popRect.width;
    }
    left = Math.max(pad, Math.min(left, window.innerWidth - popRect.width - pad));

    popoverEl.style.top = `${Math.round(top)}px`;
    popoverEl.style.left = `${Math.round(left)}px`;
  }, []);

  // Close mobile drawer, notifications & user menu when route changes
  useEffect(() => {
    setMobileMenuOpen(false);
    setNotifOpen(false);
    hideUserMenuPopover();
    if (isAuthenticated) {
      refreshNotifications();
    }
  }, [location.pathname, location.hash, location.search, isAuthenticated, refreshNotifications, hideUserMenuPopover]);

  // Close notification dropdown (and fallback user menu if Popover API unsupported) on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notifWrapRef.current && !notifWrapRef.current.contains(event.target)) {
        setNotifOpen(false);
      }
      if (!supportsPopover() && userMenuOpen) {
        const triggerEl = userMenuTriggerRef.current;
        const popoverEl = userMenuPopoverRef.current;
        if (
          triggerEl &&
          popoverEl &&
          !triggerEl.contains(event.target) &&
          !popoverEl.contains(event.target)
        ) {
          setUserMenuOpen(false);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [userMenuOpen]);

  // Fallback for browsers with CSS Anchor Positioning but without ToggleEvent.source implicit anchoring
  useEffect(() => {
    if (!supportsAnchorPositionArea() || supportsImplicitAnchorSource()) return;
    const triggerEl = userMenuTriggerRef.current;
    const popoverEl = userMenuPopoverRef.current;
    if (!triggerEl || !popoverEl) return;

    const anchorToken = `--user-menu-${userMenuId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    triggerEl.style.setProperty('anchor-name', anchorToken);
    popoverEl.style.setProperty('position-anchor', anchorToken);
    return () => {
      triggerEl.style.removeProperty('anchor-name');
      popoverEl.style.removeProperty('position-anchor');
    };
  }, [isAuthenticated, userMenuId]);

  // Sync aria-expanded, fallback positioning, and focus entry on native popover toggle event
  useEffect(() => {
    const popoverEl = userMenuPopoverRef.current;
    if (!popoverEl || !supportsPopover()) return;

    const handleToggle = (event) => {
      const isOpen = event.newState === 'open';
      setUserMenuOpen(isOpen);

      if (isOpen) {
        setNotifOpen(false);
        positionPopoverFallback();
        if (enterOnOpenRef.current) {
          const items = getMenuItems();
          items[0]?.focus({ preventScroll: true });
        } else if (pointerTriggeredRef.current) {
          const triggerEl = userMenuTriggerRef.current;
          if (triggerEl) {
            try {
              triggerEl.focus({ focusVisible: false });
            } catch {
              triggerEl.focus();
            }
          }
        }
      }
      enterOnOpenRef.current = false;
      pointerTriggeredRef.current = false;
    };

    popoverEl.addEventListener('toggle', handleToggle);
    return () => popoverEl.removeEventListener('toggle', handleToggle);
  }, [isAuthenticated, getMenuItems, positionPopoverFallback]);

  // Reposition fallback popover on resize/scroll when anchor positioning is unavailable
  useEffect(() => {
    if (!userMenuOpen || supportsAnchorPositionArea()) return;
    const handleReposition = () => positionPopoverFallback();
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [userMenuOpen, positionPopoverFallback]);

  // Close menu when focus moves outside both trigger and popover
  useEffect(() => {
    if (!userMenuOpen) return;
    const handleFocusIn = (event) => {
      const triggerEl = userMenuTriggerRef.current;
      const popoverEl = userMenuPopoverRef.current;
      if (
        triggerEl &&
        popoverEl &&
        !triggerEl.contains(event.target) &&
        !popoverEl.contains(event.target)
      ) {
        hideUserMenuPopover();
      }
    };
    document.addEventListener('focusin', handleFocusIn);
    return () => document.removeEventListener('focusin', handleFocusIn);
  }, [userMenuOpen, hideUserMenuPopover]);

  // Fallback for browsers without native focusgroup: infer ARIA menu roles & Arrow/Home/End navigation
  useEffect(() => {
    const groupEl = userMenuGroupRef.current;
    if (!groupEl || supportsFocusGroup()) return;

    groupEl.setAttribute('role', 'menu');
    groupEl.querySelectorAll('a[href], button').forEach((item) => {
      if (!item.hasAttribute('role')) {
        item.setAttribute('role', 'menuitem');
      }
    });

    const handleFallbackKeyDown = (event) => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      const items = getMenuItems();
      const current = items.indexOf(document.activeElement);
      if (current < 0 || items.length === 0) return;

      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? items.length - 1
            : (current + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
      event.preventDefault();
      event.stopImmediatePropagation();
      items[next].focus({ preventScroll: true });
    };

    groupEl.addEventListener('keydown', handleFallbackKeyDown, true);
    return () => groupEl.removeEventListener('keydown', handleFallbackKeyDown, true);
  }, [isAuthenticated, user?.wallet_is_frozen, user?.unpaid_fines_total, getMenuItems]);

  const handleUserMenuTriggerPointerDown = (event) => {
    event.preventDefault();
    pointerTriggeredRef.current = true;
    enterOnOpenRef.current = false;
  };

  const handleUserMenuTriggerClick = (event) => {
    if (supportsInvokerCommands()) {
      return;
    }
    event.preventDefault();
    const triggerEl = userMenuTriggerRef.current;
    const popoverEl = userMenuPopoverRef.current;
    if (!popoverEl) return;

    if (isUserMenuPopoverOpen()) {
      closeUserMenuAndRestore({ fromPointer: pointerTriggeredRef.current });
      pointerTriggeredRef.current = false;
      return;
    }

    if (!pointerTriggeredRef.current) {
      enterOnOpenRef.current = true;
    }

    if (supportsPopover()) {
      try {
        popoverEl.showPopover({ source: triggerEl });
      } catch {
        popoverEl.showPopover();
      }
    } else {
      setNotifOpen(false);
      setUserMenuOpen(true);
      requestAnimationFrame(() => {
        positionPopoverFallback();
        if (enterOnOpenRef.current) {
          getMenuItems()[0]?.focus({ preventScroll: true });
          enterOnOpenRef.current = false;
        }
      });
    }
  };

  const handleUserMenuTriggerKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (isUserMenuPopoverOpen()) {
        getMenuItems()[0]?.focus({ preventScroll: true });
        return;
      }
      pointerTriggeredRef.current = false;
      enterOnOpenRef.current = true;
      userMenuTriggerRef.current?.click();
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && !isUserMenuPopoverOpen()) {
      pointerTriggeredRef.current = false;
      enterOnOpenRef.current = true;
    }
  };

  const handleUserMenuListKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeUserMenuAndRestore({ fromPointer: false });
      return;
    }
    if (event.key === 'Tab') {
      hideUserMenuPopover();
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      const items = getMenuItems();
      if (items.length === 0) return;
      event.preventDefault();
      items[event.key === 'Home' ? 0 : items.length - 1].focus({ preventScroll: true });
    }
  };

  const handleUserMenuItemPointerMove = (event) => {
    const item = event.currentTarget;
    if (document.activeElement !== item) {
      try {
        item.focus({ focusVisible: false, preventScroll: true });
      } catch {
        item.focus({ preventScroll: true });
      }
    }
  };

  const handleLogout = () => {
    hideUserMenuPopover();
    logout();
    setMobileMenuOpen(false);
    showToast('با موفقیت از حساب کاربری خارج شدید.', 'info');
    navigate('/');
  };

  const memberCode = user?.id ? `LIB-U${String(user.id).padStart(4, '0')}` : '';
  const userRoleLabel = user?.is_superuser
    ? 'مدیر ارشد'
    : user?.is_staff
      ? 'کارمند کتابخانه'
      : 'عضو کتابخانه';
  const unpaidFinesNum = Number(user?.unpaid_fines_total || 0);
  const hasWalletAlert = Boolean(user?.wallet_is_frozen) || unpaidFinesNum > 0;

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
      case 'approval':
        return <ShieldCheck size={16} color="var(--accent2)" />;
      case 'wallet':
        return <Wallet size={16} color="var(--success)" />;
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
                    onClick={() => {
                      hideUserMenuPopover();
                      setNotifOpen((prev) => !prev);
                    }}
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
                  <Link
                    to="/wallet"
                    className="user-pill"
                    title="کیف‌پول و تراکنش‌های مالی"
                    style={{
                      borderColor: user?.wallet_is_frozen ? 'rgba(220, 38, 38, 0.45)' : 'rgba(22, 163, 74, 0.35)',
                      padding: '6px 12px',
                      gap: '6px'
                    }}
                  >
                    <Wallet size={15} color={user?.wallet_is_frozen ? 'var(--danger)' : 'var(--success)'} />
                    <span dir="ltr" style={{ fontWeight: 700, color: user?.wallet_is_frozen ? 'var(--danger)' : 'var(--success)' }}>
                      {formatPrice(user?.wallet_balance ?? 0)}
                    </span>
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

                  {/* User Profile Dropdown Trigger + Popover Menu */}
                  <button
                    ref={userMenuTriggerRef}
                    id={userMenuTriggerId}
                    type="button"
                    className="user-pill user-menu-trigger"
                    aria-haspopup="menu"
                    aria-expanded={userMenuOpen}
                    onPointerDown={handleUserMenuTriggerPointerDown}
                    onClick={handleUserMenuTriggerClick}
                    onKeyDown={handleUserMenuTriggerKeyDown}
                    {...{ commandfor: userMenuId, command: 'toggle-popover' }}
                  >
                    <span className="user-pill-avatar">
                      {user?.username?.[0]?.toUpperCase() || <User size={14} />}
                    </span>
                    <span>{user?.username}</span>
                    <ChevronDown size={14} className="user-menu-chevron" aria-hidden="true" />
                  </button>

                  <div
                    ref={userMenuPopoverRef}
                    id={userMenuId}
                    {...(supportsPopover() ? { popover: 'auto' } : {})}
                    className={`user-menu-popover${!supportsPopover() && userMenuOpen ? ' :popover-open' : ''}`}
                  >
                    <div className="user-menu-header">
                      <span className="user-menu-avatar-lg">
                        {user?.username?.[0]?.toUpperCase() || <User size={18} />}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 800, fontSize: '14px', color: 'var(--text)' }}>
                            {user?.username}
                          </span>
                          <span className="badge badge-category" style={{ fontSize: '10.5px', padding: '1px 7px' }}>
                            {userRoleLabel}
                          </span>
                        </div>
                        {user?.email && (
                          <div
                            dir="ltr"
                            style={{
                              fontSize: '11.5px',
                              color: 'var(--muted)',
                              textAlign: 'right',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              marginTop: '2px'
                            }}
                          >
                            {user.email}
                          </div>
                        )}
                        {memberCode && (
                          <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '3px' }}>
                            کد عضویت: <span dir="ltr" style={{ fontWeight: 700 }}>{memberCode}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div
                      ref={userMenuGroupRef}
                      {...{ focusgroup: 'menu nomemory' }}
                      aria-labelledby={userMenuTriggerId}
                      className="user-menu-list"
                      onKeyDown={handleUserMenuListKeyDown}
                    >
                      {hasWalletAlert && (
                        <>
                          <Link
                            to="/wallet"
                            className="user-menu-item user-menu-item-alert"
                            onClick={hideUserMenuPopover}
                            onPointerMove={handleUserMenuItemPointerMove}
                          >
                            <span className="user-menu-icon" aria-hidden="true">
                              <AlertTriangle size={15} />
                            </span>
                            <span style={{ flex: 1, fontSize: '12.5px' }}>
                              {user?.wallet_is_frozen
                                ? 'کیف‌پول مسدود است (بررسی)'
                                : `جریمه دیرکرد: ${formatPrice(unpaidFinesNum)}`}
                            </span>
                          </Link>
                          <hr className="user-menu-divider" />
                        </>
                      )}

                      <Link
                        to="/dashboard"
                        className="user-menu-item"
                        onClick={hideUserMenuPopover}
                        onPointerMove={handleUserMenuItemPointerMove}
                      >
                        <span className="user-menu-icon" aria-hidden="true">
                          <LayoutDashboard size={16} />
                        </span>
                        <span>داشبورد کاربری من</span>
                      </Link>

                      <Link
                        to="/dashboard#borrowings"
                        className="user-menu-item"
                        onClick={hideUserMenuPopover}
                        onPointerMove={handleUserMenuItemPointerMove}
                      >
                        <span className="user-menu-icon" aria-hidden="true">
                          <BookOpen size={16} />
                        </span>
                        <span>امانت‌های فعال من</span>
                      </Link>

                      <Link
                        to="/dashboard#wishlist"
                        className="user-menu-item"
                        onClick={hideUserMenuPopover}
                        onPointerMove={handleUserMenuItemPointerMove}
                      >
                        <span className="user-menu-icon" aria-hidden="true">
                          <Heart size={16} />
                        </span>
                        <span>علاقه‌مندی‌های من</span>
                      </Link>

                      <Link
                        to="/dashboard?editProfile=1"
                        className="user-menu-item"
                        onClick={hideUserMenuPopover}
                        onPointerMove={handleUserMenuItemPointerMove}
                      >
                        <span className="user-menu-icon" aria-hidden="true">
                          <UserCog size={16} />
                        </span>
                        <span>ویرایش پروفایل و رمز عبور</span>
                      </Link>

                      <hr className="user-menu-divider" />

                      <button
                        type="button"
                        className="user-menu-item user-menu-item-danger"
                        onClick={handleLogout}
                        onPointerMove={handleUserMenuItemPointerMove}
                      >
                        <span className="user-menu-icon" aria-hidden="true">
                          <LogOut size={16} />
                        </span>
                        <span>خروج از حساب کاربری</span>
                      </button>
                    </div>
                  </div>
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
            <NavLink to="/wallet" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} style={{ justifyContent: 'space-between' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px' }}>
                <Wallet size={18} color="var(--success)" />
                کیف‌پول و مالی
              </span>
              <span className="badge badge-available" dir="ltr" style={{ fontSize: '11.5px', padding: '2px 8px' }}>
                {formatPrice(user?.wallet_balance ?? 0)}
              </span>
            </NavLink>
          )}

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
