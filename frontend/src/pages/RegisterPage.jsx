import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';

export const RegisterPage = () => {
  const navigate = useNavigate();
  const { register } = useAuth();
  const { showToast } = useNotifications();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [age, setAge] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await register({
        username,
        email,
        age: age ? parseInt(age, 10) : null,
        password,
      });
      showToast(`حساب کاربری شما با موفقیت ایجاد شد. خوش آمدید ${username}!`, 'success');
      navigate('/dashboard');
    } catch (err) {
      const data = err.response?.data;
      if (data) {
        const firstErr = Object.values(data)[0];
        const errMsg = Array.isArray(firstErr) ? firstErr[0] : String(firstErr);
        setError(errMsg);
        showToast(errMsg, 'danger');
      } else {
        const errMsg = 'خطا در ایجاد حساب کاربری. لطفاً اطلاعات واردشده را بررسی کنید.';
        setError(errMsg);
        showToast(errMsg, 'danger');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: '460px', padding: '40px 20px' }}>
      <div className="card" style={{ padding: '32px' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div
            className="brand-logo-box"
            style={{ width: '56px', height: '56px', borderRadius: '16px', margin: '0 auto 16px' }}
          >
            <UserPlus size={26} />
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '6px' }}>
            عضویت در کتاب‌سرا
          </h1>
          <p style={{ color: 'var(--text-dim)', fontSize: '13.5px' }}>
            به جمع علاقه‌مندان کتاب بپیوندید، کتاب امانت بگیرید و نقد بنویسید.
          </p>
        </div>

        {error && (
          <div className="alert alert-danger" style={{ fontSize: '13.5px' }}>
            <AlertCircle size={16} /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">نام کاربری *</label>
            <input
              type="text"
              className="form-control"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="مثلاً: sarah"
              dir="ltr"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">ایمیل (اختیاری)</label>
            <input
              type="email"
              className="form-control"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="sarah@example.com"
              dir="ltr"
            />
          </div>

          <div className="form-group">
            <label className="form-label">سن (اختیاری)</label>
            <input
              type="number"
              className="form-control"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="24"
              dir="ltr"
            />
          </div>

          <div className="form-group">
            <label className="form-label">رمز عبور *</label>
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
            {loading ? 'در حال ساخت حساب...' : 'ثبت‌نام و ورود'}
          </button>
        </form>

        <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '13.5px', color: 'var(--text-dim)' }}>
          قبلاً ثبت‌نام کرده‌اید؟{' '}
          <Link to="/login" style={{ color: 'var(--accent2)', fontWeight: 700 }}>
            وارد شوید
          </Link>
        </div>
      </div>
    </div>
  );
};
