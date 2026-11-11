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
    const now = new Date();
    const diffTime = due.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
};

