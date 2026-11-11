import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';
import api from '../api/client';
import { useAuth } from './AuthContext';

const NotificationContext = createContext(null);

function ToastItem({ toast, onDismiss }) {
  const itemRef = useRef(null);
  const toastDomId = `toast-popover-${toast.id}`;

  useEffect(() => {
    const el = itemRef.current;
    if (el && typeof el.showPopover === 'function') {
      try {
        el.showPopover();
      } catch {
        // Fallback if already open or unsupported
      }
    }

    const timer = setTimeout(() => {
      if (el && typeof el.hidePopover === 'function') {
        try {
          el.hidePopover();
        } catch {
          // Ignore
        }
      }
      onDismiss(toast.id);
    }, 4200);

    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const handleClose = () => {
    const el = itemRef.current;
    if (el && typeof el.hidePopover === 'function') {
      try {
        el.hidePopover();
      } catch {
        // Ignore
      }
    }
    onDismiss(toast.id);
  };

  const icon =
    toast.type === 'danger' || toast.type === 'error' ? (
      <AlertCircle size={19} color="var(--danger)" style={{ flexShrink: 0 }} />
    ) : toast.type === 'info' ? (
      <Info size={19} color="var(--accent2)" style={{ flexShrink: 0 }} />
    ) : (
      <CheckCircle size={19} color="var(--success)" style={{ flexShrink: 0 }} />
    );

  return (
    <div
      ref={itemRef}
      id={toastDomId}
      role="status"
      aria-live="polite"
      className={`toast-item toast-${toast.type || 'success'}`}
      {...({ popover: 'manual' })}
    >
      <div className="toast-item-content">
        {icon}
        <div className="toast-item-text">
          {toast.title && <div className="toast-item-title">{toast.title}</div>}
          <div className="toast-item-message">{toast.message}</div>
        </div>
        <button
          type="button"
          className="toast-close-btn"
          onClick={handleClose}
          aria-label="بستن اعلان"
          {...({ popoverTarget: toastDomId, popoverTargetAction: 'hide' })}
        >
          <X size={15} />
        </button>
      </div>
      <div className="toast-progress-bar" />
    </div>
  );
}

export const NotificationProvider = ({ children }) => {
  const { isAuthenticated, user } = useAuth();
  const [toasts, setToasts] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message, type = 'success', title = '') => {
    if (!message) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-4), { id, message, type, title }]);
  }, []);

  const refreshNotifications = useCallback(async () => {
    if (!isAuthenticated) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    try {
      const res = await api.get('/api/notifications/');
      setNotifications(res.data.results || []);
      setUnreadCount(res.data.unread_count || 0);
    } catch {
      // Silent fail if unauthenticated or offline
    }
  }, [isAuthenticated]);

  useEffect(() => {
    refreshNotifications();
  }, [refreshNotifications, user?.id]);

  const markAsRead = useCallback(async (notifId) => {
    try {
      const res = await api.post('/api/notifications/mark-read/', { id: notifId });
      setUnreadCount(res.data.unread_count ?? 0);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notifId ? { ...n, is_read: true } : n))
      );
    } catch {
      // Ignore
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      await api.post('/api/notifications/mark-read/', {});
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {
      // Ignore
    }
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        showToast,
        notifications,
        unreadCount,
        refreshNotifications,
        markAsRead,
        markAllAsRead,
      }}
    >
      {children}
      <div className="toast-stack-container" aria-label="اعلان‌های لحظه‌ای">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
        ))}
      </div>
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return ctx;
};

