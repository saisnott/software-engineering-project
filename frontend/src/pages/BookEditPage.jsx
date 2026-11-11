import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowRight, Save, AlertCircle, ImagePlus, Trash2 } from 'lucide-react';
import api from '../api/client';
import { useNotifications } from '../context/NotificationContext';

export const BookEditPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useNotifications();
  const fileInputRef = useRef(null);

  const [categories, setCategories] = useState([]);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('');
  const [existingCover, setExistingCover] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [catsRes, bookRes] = await Promise.all([
          api.get('/api/categories/'),
          api.get(`/api/books/${id}/`),
        ]);
        setCategories(catsRes.data);
        const b = bookRes.data;
        setTitle(b.title);
        setAuthor(b.author);
        setDescription(b.description);
        setPrice(b.price);
        setCategory(b.category || '');
        setExistingCover(b.covers || null);
      } catch {
        setError('خطا در بارگذاری اطلاعات کتاب برای ویرایش.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  useEffect(() => {
    if (!coverFile) {
      setCoverPreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(coverFile);
    setCoverPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [coverFile]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.append('title', title);
    formData.append('author', author);
    formData.append('description', description);
    formData.append('price', price);
    formData.append('category', category);
    if (coverFile) formData.append('covers', coverFile);

    try {
      await api.patch(`/api/books/${id}/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      showToast(`مشخصات کتاب «${title}» با موفقیت بروزرسانی شد.`, 'success');
      navigate(`/books/${id}`);
    } catch {
      setError('خطا در بروزرسانی اطلاعات کتاب.');
      showToast('خطا در بروزرسانی اطلاعات کتاب.', 'danger');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="container" style={{ padding: '80px 0', textAlign: 'center', color: 'var(--text-dim)' }}>
        در حال بارگذاری اطلاعات کتاب...
      </div>
    );
  }

  const activePreview = coverPreview || existingCover;

  return (
    <div className="container" style={{ maxWidth: '720px' }}>
      <Link
        to={`/books/${id}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '7px',
          color: 'var(--text-dim)',
          fontSize: '14px',
          marginBottom: '20px'
        }}
      >
        <ArrowRight size={16} /> بازگشت به صفحه کتاب
      </Link>

      <div className="card" style={{ padding: '32px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 800, marginBottom: '8px' }}>
          ویرایش مشخصات کتاب
        </h1>
        <p style={{ color: 'var(--text-dim)', fontSize: '14px', marginBottom: '24px' }}>
          اطلاعات عنوان، نویسنده، قیمت، دسته‌بندی یا تصویر جلد این کتاب را بروزرسانی کنید.
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
                <option value="">بدون دسته‌بندی</option>
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
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">تصویر جلد کتاب</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => {
                if (e.target.files?.[0]) setCoverFile(e.target.files[0]);
              }}
              style={{ display: 'none' }}
            />

            {activePreview ? (
              <div className="cover-preview-container">
                <img src={activePreview} alt="پیش‌نمایش جلد" className="cover-preview-img" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '4px' }}>
                    {coverFile ? coverFile.name : 'تصویر جلد فعلی'}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>
                    {coverFile ? 'تصویر جدید انتخاب شد' : 'می‌توانید تصویر جدیدی جایگزین کنید'}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn-outline"
                      style={{ padding: '6px 12px', fontSize: '12.5px' }}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      انتخاب تصویر جدید
                    </button>
                    {coverFile && (
                      <button
                        type="button"
                        className="btn-danger"
                        style={{ padding: '6px 12px', fontSize: '12.5px' }}
                        onClick={() => {
                          setCoverFile(null);
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                      >
                        <Trash2 size={14} /> لغو تغییر تصویر
                      </button>
                    )}
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
                  برای بارگذاری تصویر جلد کلیک کنید
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '28px' }}>
            <Link to={`/books/${id}`} className="btn-outline">
              انصراف
            </Link>
            <button type="submit" disabled={submitting} className="btn-primary">
              <Save size={16} />
              {submitting ? 'در حال ذخیره تغییرات...' : 'ذخیره تغییرات'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
