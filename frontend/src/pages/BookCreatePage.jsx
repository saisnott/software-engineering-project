import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowRight, Upload, AlertCircle, ImagePlus, Trash2 } from 'lucide-react';
import api from '../api/client';
import { useNotifications } from '../context/NotificationContext';

export const BookCreatePage = () => {
  const navigate = useNavigate();
  const { showToast } = useNotifications();
  const fileInputRef = useRef(null);

  const [categories, setCategories] = useState([]);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('');
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await api.get('/api/categories/');
        setCategories(res.data);
      } catch (err) {
        console.error(err);
      }
    };
    fetchCategories();
  }, []);

  useEffect(() => {
    if (!coverFile) {
      setCoverPreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(coverFile);
    setCoverPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [coverFile]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setCoverFile(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.append('title', title);
    formData.append('author', author);
    formData.append('description', description);
    formData.append('price', price);
    if (category) formData.append('category', category);
    if (coverFile) formData.append('covers', coverFile);

    try {
      const res = await api.post('/api/books/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      showToast(`کتاب «${title}» با موفقیت در کتابخانه منتشر شد.`, 'success');
      navigate(`/books/${res.data.id}`);
    } catch (err) {
      console.error(err);
      setError('خطا در ثبت کتاب جدید. لطفاً مقادیر واردشده را بررسی کنید.');
      showToast('خطا در ثبت کتاب جدید.', 'danger');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: '720px' }}>
      <Link
        to="/books"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '7px',
          color: 'var(--text-dim)',
          fontSize: '14px',
          marginBottom: '20px'
        }}
      >
        <ArrowRight size={16} /> بازگشت به کاتالوگ کتاب‌ها
      </Link>

      <div className="card" style={{ padding: '32px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 800, marginBottom: '8px' }}>
          افزودن کتاب جدید به کتابخانه
        </h1>
        <p style={{ color: 'var(--text-dim)', fontSize: '14px', marginBottom: '24px' }}>
          مشخصات کتاب، دسته‌بندی و تصویر جلد آن را وارد کنید تا در کاتالوگ منتشر شود.
        </p>

        {error && (
          <div className="alert alert-danger">
            <AlertCircle size={17} /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">عنوان کتاب *</label>
            <input
              type="text"
              className="form-control"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثلاً: صد سال تنهایی"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">نام نویسنده *</label>
            <input
              type="text"
              className="form-control"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="مثلاً: گابریل گارسیا مارکز"
              required
            />
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">قیمت ($) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="form-control"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="29.99"
                dir="ltr"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">دسته‌بندی موضوعی</label>
              <select
                className="form-control"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">انتخاب دسته‌بندی...</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">معرفی و خلاصه کتاب *</label>
            <textarea
              rows={4}
              className="form-control"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="خلاصه‌ای جامع و جذاب از موضوع و محتوای کتاب بنویسید..."
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">تصویر جلد کتاب (اختیاری)</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />

            {coverPreview ? (
              <div className="cover-preview-container">
                <img src={coverPreview} alt="پیش‌نمایش جلد" className="cover-preview-img" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '4px' }}>
                    {coverFile?.name}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>
                    تصویر آماده بارگذاری است
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn-outline"
                      style={{ padding: '6px 12px', fontSize: '12.5px' }}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      تغییر تصویر
                    </button>
                    <button
                      type="button"
                      className="btn-danger"
                      style={{ padding: '6px 12px', fontSize: '12.5px' }}
                      onClick={() => {
                        setCoverFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                    >
                      <Trash2 size={14} /> حذف
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                className="cover-upload-box"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus size={32} color="var(--accent2)" />
                <div style={{ fontWeight: 600, fontSize: '14px' }}>
                  برای انتخاب تصویر جلد کتاب کلیک کنید
                </div>
                <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                  فرمت‌های مجاز: JPG, PNG, WEBP
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '28px' }}>
            <Link to="/books" className="btn-outline">
              انصراف
            </Link>
            <button type="submit" disabled={submitting} className="btn-primary">
              <Upload size={16} />
              {submitting ? 'در حال ثبت کتاب...' : 'ذخیره و انتشار کتاب'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
