import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Wallet,
  PlusCircle,
  Lock,
  TrendingUp,
  TrendingDown,
  Receipt,
  CheckCircle,
  AlertCircle,
  Sparkles,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownLeft
} from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { formatPrice, formatPersianDate, toPersianDigits, extractApiError } from '../utils/formatters';

const PRESET_AMOUNTS = [10, 25, 50, 100, 250];

export const WalletPage = () => {
  const { refreshProfile } = useAuth();
  const { showToast, refreshNotifications } = useNotifications();

  const [walletData, setWalletData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [topupAmount, setTopupAmount] = useState('50');
  const [submittingTopup, setSubmittingTopup] = useState(false);
  const [payingFines, setPayingFines] = useState(false);
  const [txFilter, setTxFilter] = useState('all');
  const [feedback, setFeedback] = useState(null);
  const [lastReceipt, setLastReceipt] = useState(null);

  const fetchWalletAll = useCallback(async () => {
    try {
      const walletRes = await api.get('/api/wallet/');
      setWalletData(walletRes.data);
    } catch (err) {
      console.error('Error loading wallet data', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWalletAll();
  }, [fetchWalletAll]);

  const handleTopup = async (e) => {
    e.preventDefault();
    if (!topupAmount || submittingTopup) return;
    setSubmittingTopup(true);
    setFeedback(null);
    setLastReceipt(null);
    try {
      const res = await api.post('/api/wallet/topup/', { amount: topupAmount });
      setFeedback({ type: 'success', text: res.data.message });
      setLastReceipt(res.data.transaction || null);
      showToast(res.data.message, 'success');
      await Promise.all([fetchWalletAll(), refreshProfile(), refreshNotifications()]);
    } catch (err) {
      const errMsg = extractApiError(err, 'خطا در شارژ کیف‌پول.');
      setFeedback({ type: 'danger', text: errMsg });
      showToast(errMsg, 'danger');
    } finally {
      setSubmittingTopup(false);
    }
  };

  const handlePayFines = async () => {
    if (payingFines) return;
    setPayingFines(true);
    setFeedback(null);
    try {
      const res = await api.post('/api/wallet/pay-fines/');
      setFeedback({ type: 'success', text: res.data.message });
      showToast(res.data.message, 'success');
      await Promise.all([fetchWalletAll(), refreshProfile(), refreshNotifications()]);
    } catch (err) {
      const errMsg = extractApiError(err, 'خطا در تسویه جریمه‌ها.');
      setFeedback({ type: 'danger', text: errMsg });
      showToast(errMsg, 'danger');
    } finally {
      setPayingFines(false);
    }
  };

  if (loading) {
    return (
      <div className="container" style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-dim)' }}>
        در حال بارگذاری اطلاعات کیف‌پول و تراکنش‌ها...
      </div>
    );
  }

  const wallet = walletData?.wallet || {};
  const summary = walletData?.summary || {};
  const settings = walletData?.settings || {};
  const transactions = walletData?.transactions || [];
  const unpaidFines = parseFloat(summary.unpaid_fines_total || wallet.unpaid_fines_total || 0);

  const filteredTransactions = transactions.filter((tx) => {
    if (txFilter === 'all') return true;
    if (txFilter === 'topup') return ['topup', 'signup_bonus', 'admin_credit'].includes(tx.tx_type);
    if (txFilter === 'earning') return tx.tx_type === 'owner_earning';
    if (txFilter === 'borrow') return ['borrow_fee', 'extend_fee'].includes(tx.tx_type);
    if (txFilter === 'deposit') return ['deposit_lock', 'deposit_release'].includes(tx.tx_type);
    if (txFilter === 'fine') return ['late_fee', 'fine_settlement'].includes(tx.tx_type);
    return true;
  });

  return (
    <div className="container">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <Wallet size={28} color="var(--success)" />
            کیف‌پول
          </h1>

        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Link to="/books" className="btn-outline" style={{ fontSize: '13.5px' }}>
            بازگشت به کاتالوگ کتاب‌ها
          </Link>
          <Link to="/dashboard" className="btn-primary" style={{ fontSize: '13.5px' }}>
            داشبورد کاربری
          </Link>
        </div>
      </div>

      {feedback && (
        <div className={`alert alert-${feedback.type}`} style={{ marginBottom: '20px' }}>
          {feedback.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <span>{feedback.text}</span>
        </div>
      )}

      {wallet.is_frozen && (
        <div className="alert alert-danger" style={{ marginBottom: '20px' }}>
          <ShieldAlert size={20} style={{ flexShrink: 0 }} />
          <div>
            <strong>کیف‌پول شما توسط مدیریت مسدود شده است.</strong>
            <div style={{ fontSize: '13px' }}>
              تا زمان رفع مسدودی توسط مدیر ارشد، امکان شارژ یا امانت کتاب وجود ندارد.
            </div>
          </div>
        </div>
      )}

      {unpaidFines > 0 && (
        <div
          className="card"
          style={{
            padding: '18px 22px',
            marginBottom: '24px',
            background: 'var(--danger-bg)',
            borderColor: 'rgba(220, 38, 38, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '14px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <AlertCircle size={22} color="var(--danger)" />
            <div>
              <div style={{ fontWeight: 800, color: 'var(--danger)', fontSize: '15px' }}>
                شما مبلغ {formatPrice(unpaidFines)} جریمه دیرکرد تسویه‌نشده دارید
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-dim)' }}>
                برای ادامه امانت‌گیری کتاب‌های جدید، لطفاً جریمه خود را از محل موجودی کیف‌پول تسویه کنید.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handlePayFines}
            disabled={payingFines || wallet.is_frozen}
            className="btn-danger"
            style={{ padding: '9px 18px', fontSize: '13.5px' }}
          >
            <CheckCircle size={15} />
            {payingFines ? 'در حال تسویه...' : `تسویه جریمه (${formatPrice(unpaidFines)})`}
          </button>
        </div>
      )}

      {/* 1. Wallet Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '18px', marginBottom: '36px' }}>
        <div className="card" style={{ padding: '24px', borderColor: 'rgba(22, 163, 74, 0.4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)', marginBottom: '10px' }}>
            <span style={{ fontSize: '13.5px', fontWeight: 600 }}>موجودی قابل استفاده</span>
            <Wallet size={20} color="var(--success)" />
          </div>
          <div style={{ fontSize: '30px', fontWeight: 900, color: 'var(--success)' }} dir="ltr">
            {formatPrice(wallet.balance ?? 0)}
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--text-dim)', marginTop: '4px' }}>
            آماده برای امانت و تمدید کتاب
          </div>
        </div>

        <div className="card" style={{ padding: '24px', borderColor: 'rgba(232, 168, 56, 0.35)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)', marginBottom: '10px' }}>
            <span style={{ fontSize: '13.5px', fontWeight: 600 }}>ودیعه بلوکه‌شده</span>
            <Lock size={20} color="var(--accent2)" />
          </div>
          <div style={{ fontSize: '30px', fontWeight: 900, color: 'var(--accent2)' }} dir="ltr">
            {formatPrice(wallet.locked_balance ?? 0)}
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--text-dim)', marginTop: '4px' }}>
            پس از تحویل به موقع کتاب‌ها آزاد می‌شود
          </div>
        </div>

        <div className="card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)', marginBottom: '10px' }}>
            <span style={{ fontSize: '13.5px', fontWeight: 600 }}>درآمد از کتاب‌های من</span>
            <TrendingUp size={20} color="var(--success)" />
          </div>
          <div style={{ fontSize: '30px', fontWeight: 900 }} dir="ltr">
            {formatPrice(summary.total_earnings ?? 0)}
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--text-dim)', marginTop: '4px' }}>
            سهم {toPersianDigits(parseFloat(settings.owner_share_percent || 80))}٪ از امانت کتاب‌های شما
          </div>
        </div>

        <div className="card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)', marginBottom: '10px' }}>
            <span style={{ fontSize: '13.5px', fontWeight: 600 }}>مجموع هزینه‌ها</span>
            <TrendingDown size={20} color="var(--danger)" />
          </div>
          <div style={{ fontSize: '30px', fontWeight: 900 }} dir="ltr">
            {formatPrice(summary.total_spent ?? 0)}
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--text-dim)', marginTop: '4px' }}>
            امانت‌ها، تمدیدها و جریمه‌ها
          </div>
        </div>
      </div>

      {/* 2. Top-up Form & Tariff Overview */}
      <div className="form-grid-2" style={{ gap: '22px', marginBottom: '44px', alignItems: 'start' }}>
        {/* Simulated Wallet Top-Up */}
        <div className="card" style={{ padding: '26px', border: '1px solid rgba(22, 163, 74, 0.32)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
            <h2 style={{ fontSize: '19px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <PlusCircle size={20} color="var(--success)" />
              شارژ کیف‌پول
            </h2>

          </div>



          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
            {PRESET_AMOUNTS.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => setTopupAmount(String(amt))}
                className={String(amt) === String(topupAmount) ? 'btn-primary' : 'btn-outline'}
                style={{ padding: '6px 14px', fontSize: '13px' }}
                dir="ltr"
              >
                +{formatPrice(amt)}
              </button>
            ))}
          </div>

          <form onSubmit={handleTopup}>
            <div className="form-group">
              <label className="form-label" htmlFor="wallet-topup-input">
                مبلغ شارژ ($) *
              </label>
              <input
                id="wallet-topup-input"
                type="number"
                step="0.01"
                min="1"
                max={settings.max_topup_amount || 1000}
                className="form-control"
                value={topupAmount}
                onChange={(e) => setTopupAmount(e.target.value)}
                dir="ltr"
                required
              />
            </div>

            <button
              type="submit"
              disabled={submittingTopup || wallet.is_frozen}
              className="btn-primary"
              style={{ width: '100%', padding: '11px 18px' }}
            >
              <PlusCircle size={17} />
              {submittingTopup ? 'در حال ثبت تراکنش...' : `افزایش موجودی (${formatPrice(topupAmount || 0)})`}
            </button>
          </form>

          {lastReceipt && (
            <div
              style={{
                marginTop: '16px',
                padding: '12px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--success-bg)',
                border: '1px solid rgba(22, 163, 74, 0.35)',
                fontSize: '12.5px'
              }}
            >
              <div style={{ fontWeight: 800, color: 'var(--success)', marginBottom: '4px' }}>
                رسید شارژ موفق کیف‌پول
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <span>کد پیگیری: <strong dir="ltr">{lastReceipt.reference_code}</strong></span>
                <span>موجودی جدید: <strong dir="ltr">{formatPrice(lastReceipt.balance_after)}</strong></span>
              </div>
            </div>
          )}
        </div>

        {/* Financial Rules / Tariffs Info */}
        <div className="card" style={{ padding: '26px' }}>


          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13.5px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--surface2)', borderRadius: '8px' }}>
              <span style={{ color: 'var(--text-dim)' }}>سهم ثبت‌کننده کتاب از امانت و تمدید</span>
              <strong style={{ color: 'var(--success)' }}>
                ٪{toPersianDigits(parseFloat(settings.owner_share_percent || 80))} (کارمزد کتابخانه: ٪{toPersianDigits(100 - parseFloat(settings.owner_share_percent || 80))})
              </strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--surface2)', borderRadius: '8px' }}>
              <span style={{ color: 'var(--text-dim)' }}>هزینه امانت ۱۴ روزه کتاب</span>
              <strong>٪{toPersianDigits(parseFloat(settings.borrow_fee_percent || 10))} از قیمت کتاب</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--surface2)', borderRadius: '8px' }}>
              <span style={{ color: 'var(--text-dim)' }}>ودیعه امانت (قابل برگشت پس از تحویل)</span>
              <strong style={{ color: 'var(--accent2)' }}>٪{toPersianDigits(parseFloat(settings.deposit_percent || 50))} از قیمت کتاب</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--surface2)', borderRadius: '8px' }}>
              <span style={{ color: 'var(--text-dim)' }}>هزینه هر بار تمدید (+۷ روز)</span>
              <strong dir="ltr">{formatPrice(settings.extend_fee_amount ?? 2)}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--surface2)', borderRadius: '8px' }}>
              <span style={{ color: 'var(--text-dim)' }}>جریمه هر روز تأخیر در تحویل</span>
              <strong style={{ color: 'var(--danger)' }} dir="ltr">{formatPrice(settings.daily_late_fee ?? 1)} / روز</strong>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Full Wallet Transaction Ledger */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '21px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Receipt size={22} color="var(--accent2)" />
            تاریخچه تراکنش‌ ({toPersianDigits(filteredTransactions.length)})
          </h2>

          <div className="tabs-pill-group" style={{ flexWrap: 'wrap' }}>
            {[
              ['all', 'همه'],
              ['topup', 'شارژ و هدیه'],
              ['earning', 'درآمد من'],
              ['borrow', 'امانت و تمدید'],
              ['deposit', 'ودیعه'],
              ['fine', 'جریمه'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`tab-pill-btn ${txFilter === key ? 'active' : ''}`}
                onClick={() => setTxFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {filteredTransactions.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}>
            تراکنشی در این دسته ثبت نشده است.
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-wrapper" tabIndex={0} role="region" aria-label="تراکنش‌های کیف‌پول">
              <table>
                <thead>
                  <tr>
                    <th>کد پیگیری</th>
                    <th>نوع تراکنش</th>
                    <th>شرح تراکنش</th>
                    <th>مبلغ</th>
                    <th>موجودی پس از تراکنش</th>
                    <th>تاریخ</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((tx) => {
                    const isPositive = tx.direction === 'credit' || tx.direction === 'unlock';
                    const isLock = tx.direction === 'lock';
                    const amountColor = isPositive
                      ? 'var(--success)'
                      : isLock
                        ? 'var(--accent2)'
                        : 'var(--danger)';
                    const sign = isPositive ? '+' : '-';

                    return (
                      <tr key={tx.id}>
                        <td>
                          <span className="code-mono-badge" style={{ fontSize: '11.5px' }}>
                            {tx.reference_code}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`badge ${isPositive ? 'badge-available' : isLock ? 'badge-category' : 'badge-borrowed'
                              }`}
                          >
                            {isPositive ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}
                            {tx.tx_type_label}
                          </span>
                        </td>
                        <td style={{ maxWidth: '340px', fontSize: '13px', color: 'var(--text-dim)' }}>
                          {tx.description}
                        </td>
                        <td dir="ltr" style={{ fontWeight: 800, color: amountColor }}>
                          {sign}{formatPrice(tx.amount)}
                        </td>
                        <td dir="ltr" style={{ fontWeight: 600 }}>
                          {formatPrice(tx.balance_after)}
                        </td>
                        <td style={{ fontSize: '12.5px', color: 'var(--muted)' }}>
                          {formatPersianDate(tx.created_at)}
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
    </div>
  );
};
