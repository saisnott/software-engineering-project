import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Wallet,
  TrendingUp,
  Lock,
  ShoppingBag,
  Settings,
  Receipt,
  CheckCircle,
  AlertCircle,
  SlidersHorizontal,
  Save,
  Search
} from 'lucide-react';
import api from '../api/client';
import { useNotifications } from '../context/NotificationContext';
import { formatPrice, formatPersianDate, toPersianDigits, extractApiError } from '../utils/formatters';

export const ManagerFinanceSection = ({ membersDirectory = [], isSuperuser = false, onFinanceChanged }) => {
  const { showToast, refreshNotifications } = useNotifications();

  const [financeData, setFinanceData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [txTypeFilter, setTxTypeFilter] = useState('');
  const [txSearch, setTxSearch] = useState('');

  // Superuser manual wallet adjustment state
  const [adjustUser, setAdjustUser] = useState('');
  const [adjustAction, setAdjustAction] = useState('credit'); // 'credit' | 'debit' | 'toggle_freeze'
  const [adjustAmount, setAdjustAmount] = useState('20');
  const [adjustReason, setAdjustReason] = useState('');
  const [submittingAdjust, setSubmittingAdjust] = useState(false);
  const [adjustFeedback, setAdjustFeedback] = useState(null);

  // Superuser financial settings form state
  const [settingsForm, setSettingsForm] = useState({
    owner_share_percent: '80.00',
    borrow_fee_percent: '10.00',
    deposit_percent: '50.00',
    extend_fee_amount: '2.00',
    daily_late_fee: '1.00',
    signup_bonus: '100.00',
    max_topup_amount: '1000.00',
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsFeedback, setSettingsFeedback] = useState(null);

  const fetchFinance = useCallback(async (typeVal = '', searchVal = '') => {
    try {
      const params = new URLSearchParams();
      if (typeVal) params.append('tx_type', typeVal);
      if (searchVal.trim()) params.append('search', searchVal.trim());
      const q = params.toString() ? `?${params.toString()}` : '';
      const res = await api.get(`/api/manager/finance/${q}`);
      setFinanceData(res.data);
      if (res.data?.settings) {
        const s = res.data.settings;
        setSettingsForm({
          owner_share_percent: String(s.owner_share_percent ?? '80.00'),
          borrow_fee_percent: String(s.borrow_fee_percent ?? '10.00'),
          deposit_percent: String(s.deposit_percent ?? '50.00'),
          extend_fee_amount: String(s.extend_fee_amount ?? '2.00'),
          daily_late_fee: String(s.daily_late_fee ?? '1.00'),
          signup_bonus: String(s.signup_bonus ?? '100.00'),
          max_topup_amount: String(s.max_topup_amount ?? '1000.00'),
        });
      }
    } catch (err) {
      console.error('Error loading manager finance stats', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFinance(txTypeFilter, txSearch);
  }, [fetchFinance, txTypeFilter, txSearch]);

  const handleAdjustWallet = async (e) => {
    e.preventDefault();
    if (!adjustUser || submittingAdjust) return;
    setSubmittingAdjust(true);
    setAdjustFeedback(null);
    try {
      const payload = {
        user_identifier: adjustUser,
        action: adjustAction,
        reason: adjustReason.trim(),
      };
      if (adjustAction !== 'toggle_freeze') {
        payload.amount = adjustAmount;
      }
      const res = await api.post('/api/manager/wallet/adjust/', payload);
      setAdjustFeedback({ type: 'success', text: res.data.message });
      showToast(res.data.message, 'success');
      setAdjustReason('');
      await fetchFinance(txTypeFilter, txSearch);
      await refreshNotifications();
      if (onFinanceChanged) onFinanceChanged();
    } catch (err) {
      const errMsg = extractApiError(err, 'خطا در تعدیل کیف‌پول کاربر.');
      setAdjustFeedback({ type: 'danger', text: errMsg });
      showToast(errMsg, 'danger');
    } finally {
      setSubmittingAdjust(false);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    if (savingSettings) return;
    setSavingSettings(true);
    setSettingsFeedback(null);
    try {
      const res = await api.patch('/api/manager/finance/settings/', settingsForm);
      setSettingsFeedback({ type: 'success', text: res.data.message });
      showToast(res.data.message, 'success');
      await fetchFinance(txTypeFilter, txSearch);
    } catch (err) {
      const errMsg = extractApiError(err, 'خطا در ذخیره تنظیمات مالی.');
      setSettingsFeedback({ type: 'danger', text: errMsg });
      showToast(errMsg, 'danger');
    } finally {
      setSavingSettings(false);
    }
  };

  if (loading) {
    return (
      <div className="card" style={{ padding: '28px', marginBottom: '44px', textAlign: 'center', color: 'var(--muted)' }}>
        در حال بارگذاری گزارش‌های مالی فروشگاه...
      </div>
    );
  }

  const summary = financeData?.summary || {};
  const transactions = financeData?.transactions || [];
  const orders = financeData?.orders || [];

  return (
    <div style={{ marginBottom: '48px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '18px' }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Wallet size={23} color="var(--success)" />
            مدیریت و گزارش مالی فروشگاه (کیف‌پول و تقسیم درآمد)
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>
            پایش درآمد خالص فروشگاه، سهم صاحبان کتاب، ودیعه‌های بلوکه‌شده، خریدها و تراکنش‌های کل سیستم
          </p>
        </div>
      </div>

      {/* Finance KPI Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '26px' }}>
        <div className="card" style={{ padding: '20px', borderColor: 'rgba(22, 163, 74, 0.35)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)', marginBottom: '8px', fontSize: '13px' }}>
            <span>درآمد خالص فروشگاه (کارمزدها)</span>
            <TrendingUp size={18} color="var(--success)" />
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: 'var(--success)' }} dir="ltr">
            {formatPrice(summary.platform_revenue_total ?? 0)}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--text-dim)', marginTop: '4px' }}>
            سهم پلتفرم از خرید، امانت، تمدید و جریمه
          </div>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)', marginBottom: '8px', fontSize: '13px' }}>
            <span>سهم واریزی به صاحبان کتاب</span>
            <Wallet size={18} color="var(--accent2)" />
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: 'var(--accent2)' }} dir="ltr">
            {formatPrice(summary.owner_payouts_total ?? 0)}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--text-dim)', marginTop: '4px' }}>
            درآمد واریزشده به کیف‌پول ثبت‌کنندگان
          </div>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)', marginBottom: '8px', fontSize: '13px' }}>
            <span>مجموع موجودی کیف‌پول اعضا</span>
            <Wallet size={18} color="var(--success)" />
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900 }} dir="ltr">
            {formatPrice(summary.total_users_balance ?? 0)}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--text-dim)', marginTop: '4px' }}>
            ودیعه‌های بلوکه‌شده: <strong dir="ltr">{formatPrice(summary.total_locked_deposits ?? 0)}</strong>
          </div>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)', marginBottom: '8px', fontSize: '13px' }}>
            <span>حجم خریدها و جریمه‌ها</span>
            <ShoppingBag size={18} color="var(--accent2)" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 900 }} dir="ltr">
            {formatPrice(summary.purchase_volume_total ?? 0)}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--text-dim)', marginTop: '4px' }}>
            {toPersianDigits(summary.total_orders_count ?? 0)} سفارش | جریمه وصولی: <strong dir="ltr">{formatPrice(summary.late_fees_collected_total ?? 0)}</strong>
          </div>
        </div>
      </div>

      {/* Superuser Controls: Manual Adjustment & Financial Settings */}
      {isSuperuser && (
        <div className="form-grid-2" style={{ gap: '22px', marginBottom: '28px', alignItems: 'start' }}>
          {/* Manual Wallet Adjust */}
          <div className="card" style={{ padding: '24px', borderColor: 'rgba(232, 168, 56, 0.35)' }}>
            <h3 style={{ fontSize: '17.5px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <SlidersHorizontal size={19} color="var(--accent2)" />
              تعدیل دستی و مسدودسازی کیف‌پول اعضا (مدیر ارشد)
            </h3>

            {adjustFeedback && (
              <div className={`alert alert-${adjustFeedback.type}`} style={{ fontSize: '13px', marginBottom: '14px' }}>
                {adjustFeedback.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                <span>{adjustFeedback.text}</span>
              </div>
            )}

            <form onSubmit={handleAdjustWallet}>
              <div className="form-group">
                <label className="form-label" htmlFor="adjust-user-select">انتخاب عضو *</label>
                <select
                  id="adjust-user-select"
                  className="form-control"
                  value={adjustUser}
                  onChange={(e) => setAdjustUser(e.target.value)}
                  required
                >
                  <option value="">-- انتخاب عضو --</option>
                  {membersDirectory.map((m) => (
                    <option key={m.id} value={m.username} dir="ltr">
                      {`${m.username} — Balance: $${m.wallet_balance ?? '0.00'}${m.wallet_is_frozen ? ' (FROZEN)' : ''}`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label" htmlFor="adjust-action-select">نوع عملیات *</label>
                  <select
                    id="adjust-action-select"
                    className="form-control"
                    value={adjustAction}
                    onChange={(e) => setAdjustAction(e.target.value)}
                  >
                    <option value="credit">افزایش موجودی (شارژ دستی)</option>
                    <option value="debit">کسر موجودی دستی</option>
                    <option value="toggle_freeze">مسدود / فعال‌سازی کیف‌پول</option>
                  </select>
                </div>

                {adjustAction !== 'toggle_freeze' && (
                  <div className="form-group">
                    <label className="form-label" htmlFor="adjust-amount-input">مبلغ ($) *</label>
                    <input
                      id="adjust-amount-input"
                      type="number"
                      step="0.01"
                      min="0.01"
                      className="form-control"
                      value={adjustAmount}
                      onChange={(e) => setAdjustAmount(e.target.value)}
                      dir="ltr"
                      required
                    />
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="adjust-reason-input">
                  علت / توضیح {adjustAction !== 'toggle_freeze' ? '*' : '(اختیاری)'}
                </label>
                <input
                  id="adjust-reason-input"
                  type="text"
                  className="form-control"
                  placeholder="مثلاً: پاداش فعالیت، بازگشت وجه یا تخلف مالی..."
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  required={adjustAction !== 'toggle_freeze'}
                />
              </div>

              <button type="submit" disabled={submittingAdjust} className="btn-primary" style={{ width: '100%' }}>
                <Lock size={15} />
                {submittingAdjust ? 'در حال ثبت...' : 'اعمال تغییرات روی کیف‌پول'}
              </button>
            </form>
          </div>

          {/* Financial Settings Form */}
          <div className="card" style={{ padding: '24px', borderColor: 'rgba(232, 168, 56, 0.35)' }}>
            <h3 style={{ fontSize: '17.5px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <Settings size={19} color="var(--accent2)" />
              تنظیمات تعرفه‌های مالی و درصدها (مدیر ارشد)
            </h3>

            {settingsFeedback && (
              <div className={`alert alert-${settingsFeedback.type}`} style={{ fontSize: '13px', marginBottom: '14px' }}>
                {settingsFeedback.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                <span>{settingsFeedback.text}</span>
              </div>
            )}

            <form onSubmit={handleSaveSettings}>
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">سهم صاحب کتاب (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    className="form-control"
                    dir="ltr"
                    value={settingsForm.owner_share_percent}
                    onChange={(e) => setSettingsForm((p) => ({ ...p, owner_share_percent: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">هزینه امانت (% قیمت)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    className="form-control"
                    dir="ltr"
                    value={settingsForm.borrow_fee_percent}
                    onChange={(e) => setSettingsForm((p) => ({ ...p, borrow_fee_percent: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">ودیعه مسدودشونده (% قیمت)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    className="form-control"
                    dir="ltr"
                    value={settingsForm.deposit_percent}
                    onChange={(e) => setSettingsForm((p) => ({ ...p, deposit_percent: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">هزینه تمدید ۷ روزه ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-control"
                    dir="ltr"
                    value={settingsForm.extend_fee_amount}
                    onChange={(e) => setSettingsForm((p) => ({ ...p, extend_fee_amount: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">جریمه روزانه تأخیر ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-control"
                    dir="ltr"
                    value={settingsForm.daily_late_fee}
                    onChange={(e) => setSettingsForm((p) => ({ ...p, daily_late_fee: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">اعتبار هدیه ثبت‌نام ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-control"
                    dir="ltr"
                    value={settingsForm.signup_bonus}
                    onChange={(e) => setSettingsForm((p) => ({ ...p, signup_bonus: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <button type="submit" disabled={savingSettings} className="btn-success" style={{ width: '100%' }}>
                <Save size={15} />
                {savingSettings ? 'در حال ذخیره...' : 'ذخیره تنظیمات مالی'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Recent Orders Table */}
      {orders.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '24px' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 800, fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShoppingBag size={18} color="var(--success)" />
            آخرین خریدهای دائمی ثبت‌شده ({toPersianDigits(orders.length)})
          </div>
          <div className="table-wrapper" tabIndex={0} role="region" aria-label="سفارش‌های خرید">
            <table>
              <thead>
                <tr>
                  <th>کد سفارش</th>
                  <th>کتاب</th>
                  <th>خریدار</th>
                  <th>ثبت‌کننده کتاب</th>
                  <th>مبلغ کل</th>
                  <th>سهم مالک</th>
                  <th>کارمزد فروشگاه</th>
                  <th>تاریخ</th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 15).map((ord) => (
                  <tr key={ord.id}>
                    <td><span className="code-mono-badge" style={{ fontSize: '11px' }}>{ord.order_code}</span></td>
                    <td>
                      {ord.book ? (
                        <Link to={`/books/${ord.book}`} style={{ fontWeight: 700 }}>{ord.book_title}</Link>
                      ) : (
                        <strong>{ord.book_title}</strong>
                      )}
                    </td>
                    <td>@{ord.buyer_username}</td>
                    <td>@{ord.seller_username}</td>
                    <td dir="ltr" style={{ fontWeight: 700 }}>{formatPrice(ord.total_price)}</td>
                    <td dir="ltr" style={{ color: 'var(--success)', fontWeight: 700 }}>{formatPrice(ord.owner_share)}</td>
                    <td dir="ltr" style={{ color: 'var(--accent2)', fontWeight: 700 }}>{formatPrice(ord.platform_commission)}</td>
                    <td style={{ fontSize: '12px', color: 'var(--muted)' }}>{formatPersianDate(ord.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* System Transactions Ledger */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ fontWeight: 800, fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Receipt size={18} color="var(--accent2)" />
            دفترکل تراکنش‌های مالی کل سیستم ({toPersianDigits(transactions.length)})
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="search-input-wrapper" style={{ minWidth: '200px' }}>
              <Search size={14} className="search-input-icon" />
              <input
                type="text"
                className="form-control"
                style={{ padding: '6px 34px 6px 10px', fontSize: '12.5px' }}
                placeholder="جستجوی کاربر یا کد پیگیری..."
                value={txSearch}
                onChange={(e) => setTxSearch(e.target.value)}
              />
            </div>

            <select
              className="form-control"
              style={{ width: 'auto', padding: '6px 12px', fontSize: '12.5px' }}
              value={txTypeFilter}
              onChange={(e) => setTxTypeFilter(e.target.value)}
              aria-label="فیلتر نوع تراکنش"
            >
              <option value="">همه انواع تراکنش</option>
              <option value="topup">شارژ کیف‌پول</option>
              <option value="purchase">خرید کتاب</option>
              <option value="borrow_fee">هزینه امانت</option>
              <option value="extend_fee">هزینه تمدید</option>
              <option value="owner_earning">درآمد صاحبان کتاب</option>
              <option value="deposit_lock">بلوکه ودیعه</option>
              <option value="deposit_release">آزادسازی ودیعه</option>
              <option value="late_fee">جریمه تأخیر</option>
              <option value="fine_settlement">تسویه جریمه</option>
              <option value="admin_credit">افزایش دستی مدیر</option>
              <option value="admin_debit">کسر دستی مدیر</option>
            </select>
          </div>
        </div>

        {transactions.length === 0 ? (
          <div style={{ padding: '28px', textAlign: 'center', color: 'var(--muted)' }}>
            تراکنشی مطابق با فیلتر یافت نشد.
          </div>
        ) : (
          <div className="table-wrapper" tabIndex={0} role="region" aria-label="تراکنش‌های کل سیستم">
            <table>
              <thead>
                <tr>
                  <th>کد پیگیری</th>
                  <th>کاربر</th>
                  <th>نوع</th>
                  <th>شرح</th>
                  <th>مبلغ</th>
                  <th>کارمزد فروشگاه</th>
                  <th>تاریخ</th>
                </tr>
              </thead>
              <tbody>
                {transactions.slice(0, 40).map((tx) => (
                  <tr key={tx.id}>
                    <td><span className="code-mono-badge" style={{ fontSize: '11px' }}>{tx.reference_code}</span></td>
                    <td style={{ fontWeight: 700, color: 'var(--accent2)' }}>@{tx.username}</td>
                    <td><span className="badge badge-category">{tx.tx_type_label}</span></td>
                    <td style={{ maxWidth: '300px', fontSize: '12.5px', color: 'var(--text-dim)' }}>{tx.description}</td>
                    <td dir="ltr" style={{ fontWeight: 700 }}>{formatPrice(tx.amount)}</td>
                    <td dir="ltr" style={{ color: 'var(--success)', fontWeight: 700 }}>
                      {parseFloat(tx.platform_commission || 0) > 0 ? formatPrice(tx.platform_commission) : '—'}
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--muted)' }}>{formatPersianDate(tx.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
