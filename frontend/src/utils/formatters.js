const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export const toPersianDigits = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\d/g, (digit) => persianDigits[Number(digit)]);
};

export const formatPrice = (price) => {
  const num = parseFloat(price);
  if (isNaN(num)) return toPersianDigits('0.00') + ' $';
  return `${toPersianDigits(num.toFixed(2))} $`;
};

export const formatPersianDate = (dateStr) => {
  if (!dateStr) return '—';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('fa-IR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return '—';
  }
};

export const getRemainingDays = (dueDateStr) => {
  if (!dueDateStr) return null;
  try {
    const due = new Date(dueDateStr);
    if (isNaN(due.getTime())) return null;
    const now = new Date();
    const dayMs = 1000 * 60 * 60 * 24;
    const diffTime = due.getTime() - now.getTime();
    if (diffTime < 0) {
      return -Math.max(1, Math.floor(Math.abs(diffTime) / dayMs));
    }
    return Math.ceil(diffTime / dayMs);
  } catch {
    return null;
  }
};

export const extractApiError = (err, fallbackMessage) => {
  const data = err?.response?.data;
  if (!data) return fallbackMessage;
  if (typeof data === 'string' && data.trim()) return data.trim();
  if (typeof data.error === 'string' && data.error.trim()) return data.error.trim();
  if (typeof data.detail === 'string' && data.detail.trim()) return data.detail.trim();
  if (typeof data === 'object') {
    const messages = Object.values(data)
      .flatMap((val) => (Array.isArray(val) ? val : [val]))
      .filter((val) => typeof val === 'string' && val.trim());
    if (messages.length > 0) return messages.join(' ');
  }
  return fallbackMessage;
};

