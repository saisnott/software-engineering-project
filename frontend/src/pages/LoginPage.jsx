import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { LogIn, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';

export const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const { showToast } = useNotifications();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const from = location.state?.from?.pathname;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const data = await login(username, password);
      showToast(`خوش آمدید ${username}! با موفقیت وارد حساب شدید.`, 'success');
      const loggedInUser = data?.user;
      const defaultTarget =
        loggedInUser?.is_superuser || loggedInUser?.is_staff
          ? '/manager/dashboard'
          : '/dashboard';
      navigate(from || defaultTarget, { replace: true });
    } catch (err) {
      const errMsg =
        err.response?.data?.error ||
        err.response?.data?.detail ||
        'نام کاربری یا رمز عبور اشتباه است. لطفاً دوباره تلاش کنید.';
      setError(errMsg);
      showToast(errMsg, 'danger');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: '440px', padding: '40px 20px' }}>
      <div className="card" style={{ padding: '32px' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div
            className="brand-logo-box"
            style={{ width: '56px', height: '56px', borderRadius: '16px', margin: '0 auto 16px' }}
          >
            <LogIn size={26} />
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '6px' }}>
            ورود به حساب کاربری
          </h1>
          <p style={{ color: 'var(--text-dim)', fontSize: '13.5px' }}>
            برای دسترسی به پنل کتابخانه، اطلاعات حساب خود را وارد کنید.
          </p>
        </div>

        {error && (
          <div className="alert alert-danger" style={{ fontSize: '13.5px' }}>
            <AlertCircle size={16} /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">نام کاربری</label>
            <input
              type="text"
              className="form-control"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="مثلاً: hossein"
              dir="ltr"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">رمز عبور</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                className="form-control"
                style={{ paddingRight: '42px' }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                dir="ltr"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--muted)',
                  display: 'flex'
                }}
                aria-label={showPassword ? 'پنهان کردن رمز' : 'نمایش رمز'}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '11px 0', marginTop: '10px' }}
          >
            {loading ? 'در حال بررسی...' : 'ورود به کتاب‌سرا'}
          </button>
        </form>

        <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '13.5px', color: 'var(--text-dim)' }}>
          هنوز حساب کاربری ندارید؟{' '}
          <Link to="/register" style={{ color: 'var(--accent2)', fontWeight: 700 }}>
            ثبت‌نام رایگان
          </Link>
        </div>
      </div>
    </div>
  );
};
