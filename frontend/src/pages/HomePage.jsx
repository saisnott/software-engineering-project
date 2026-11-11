import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  LogIn,
  BookmarkCheck,
  MessageSquareHeart,
  Library,
  Sparkles,
  Search,
  Layers,
  ArrowLeft,
  CheckCircle2,
  PlusCircle,
  BookMarked
} from 'lucide-react';
import api from '../api/client';
import { BookCard, BookCardSkeleton } from '../components/BookCard';
import { useAuth } from '../context/AuthContext';
import { toPersianDigits, formatPrice } from '../utils/formatters';

export const HomePage = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [allBooks, setAllBooks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('newest');
  const [quickSearch, setQuickSearch] = useState('');

  useEffect(() => {
    const fetchHomeData = async () => {
      try {
        const [booksRes, catsRes] = await Promise.all([
          api.get('/api/books/?sort=newest'),
          api.get('/api/categories/')
        ]);
        setAllBooks(booksRes.data || []);
        setCategories(catsRes.data || []);
      } catch (err) {
        console.error('Error fetching home data', err);
      } finally {
        setLoading(false);
      }
    };
    fetchHomeData();
  }, []);

  const handleQuickSearch = (e) => {
    e.preventDefault();
    if (quickSearch.trim()) {
      navigate(`/books?search=${encodeURIComponent(quickSearch.trim())}`);
    } else {
      navigate('/books');
    }
  };

  const displayedBooks =
    activeTab === 'available'
      ? allBooks.filter((b) => b.is_available).slice(0, 8)
      : allBooks.slice(0, 8);

  const heroStackBooks = allBooks.slice(0, 3);
  const availableCount = allBooks.filter((b) => b.is_available).length;

  return (
    <div>
      {/* ── 1. Modern 2-Column Hero Section ── */}
      <section className="hero-section">
        <div className="hero-glow" />
        <div className="hero-glow-left" />

        <div className="container">
          <div className="hero-grid">
            {/* Right Column (Content) */}
            <div>
              <div className="hero-badge">
                <Sparkles size={15} />
                <span>نسل نوین کتابخانه دیجیتال و امانت آنلاین کتاب</span>
              </div>

              <h1 className="hero-title">
                دنیایی از کتاب‌های ماندگار، آماده{' '}
                <span className="hero-title-highlight">امانت و مطالعه شما</span>
              </h1>

              <p className="hero-subtitle">
                در کتاب‌سرا به مجموعه‌ای غنی از کتاب‌های منتخب دسترسی داشته باشید، کتاب دلخواهتان را
                به‌صورت آنی برای ۱۴ روز امانت بگیرید و دیدگاه‌های خود را با جامعه کتاب‌خوان‌ها به اشتراک بگذارید.
              </p>

              {/* Quick Search Bar */}
              <form onSubmit={handleQuickSearch} className="hero-search-form">
                <div className="hero-search-input-wrap">
                  <Search size={18} color="var(--muted)" />
                  <input
                    type="text"
                    className="hero-search-input"
                    placeholder="جستجوی سریع نام کتاب یا نویسنده..."
                    value={quickSearch}
                    onChange={(e) => setQuickSearch(e.target.value)}
                  />
                </div>
                <button type="submit" className="btn-primary" style={{ padding: '10px 22px' }}>
                  جستجوی کتاب
                </button>
              </form>

              {/* CTA Buttons */}
              <div className="hero-cta-row">
                <Link to="/books" className="btn-primary" style={{ padding: '11px 24px', fontSize: '15px' }}>
                  <BookOpen size={18} />
                  کاوش در کاتالوگ
                </Link>

                {!isAuthenticated ? (
                  <Link to="/register" className="btn-outline" style={{ padding: '11px 24px', fontSize: '15px' }}>
                    <LogIn size={18} />
                    ساخت حساب رایگان
                  </Link>
                ) : (
                  <Link to="/dashboard" className="btn-outline" style={{ padding: '11px 24px', fontSize: '15px' }}>
                    <Library size={18} />
                    داشبورد کتابخانه من
                  </Link>
                )}
              </div>

              {/* Live Metrics */}
              <div className="hero-stats-row">
                <div className="hero-stat-item">
                  <span className="hero-stat-value">
                    {loading ? '...' : `+${toPersianDigits(allBooks.length || 12)}`}
                  </span>
                  <span className="hero-stat-label">عنوان کتاب ثبت‌شده</span>
                </div>

                <div className="hero-stat-item">
                  <span className="hero-stat-value">
                    {loading ? '...' : toPersianDigits(availableCount)}
                  </span>
                  <span className="hero-stat-label">کتاب آماده امانت فوری</span>
                </div>

                <div className="hero-stat-item">
                  <span className="hero-stat-value">{toPersianDigits(14)} روز</span>
                  <span className="hero-stat-label">ضمانت امانت هوشمند</span>
                </div>
              </div>
            </div>

            {/* Left Column (3D Floating Book Showcase) */}
            <div className="hero-visual">
              <div className="hero-showcase-stage">
                <div className="hero-floating-chip chip-top">
                  <CheckCircle2 size={18} color="var(--success)" />
                  <span>امانت فوری ۱۴ روزه</span>
                </div>

                <div className="hero-floating-chip chip-bottom">
                  <MessageSquareHeart size={18} color="var(--accent2)" />
                  <span>نقد و بررسی جامعه کتاب‌خوان‌ها</span>
                </div>

                {heroStackBooks.length > 0 ? (
                  heroStackBooks.map((book, idx) => {
                    const posClass =
                      idx === 0 ? 'card-main' : idx === 1 ? 'card-right' : 'card-left';
                    return (
                      <Link
                        to={`/books/${book.id}`}
                        key={book.id}
                        className={`hero-book-stack-card ${posClass}`}
                        title={book.title}
                      >
                        <div style={{ flex: 1, background: 'var(--surface2)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {book.covers ? (
                            <img src={book.covers} alt={book.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <BookMarked size={48} color="var(--accent2)" style={{ opacity: 0.5 }} />
                          )}
                        </div>
                        <div style={{ padding: '12px 14px', background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
                          <div style={{ fontWeight: 700, fontSize: '13.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {book.title}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', fontSize: '12px' }}>
                            <span style={{ color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '110px' }}>
                              {book.author}
                            </span>
                            <span style={{ color: 'var(--accent2)', fontWeight: 700 }}>
                              {formatPrice(book.price)}
                            </span>
                          </div>
                        </div>
                      </Link>
                    );
                  })
                ) : (
                  <div className="hero-book-stack-card card-main" style={{ alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center' }}>
                    <BookOpen size={52} color="var(--accent2)" style={{ marginBottom: '12px' }} />
                    <div style={{ fontWeight: 700, fontSize: '16px' }}>ویترین کتاب‌سرا</div>
                    <div style={{ fontSize: '12.5px', color: 'var(--muted)', marginTop: '6px' }}>
                      مجموعه‌ای از بهترین آثار ادبی و علمی
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="container">
        {/* ── 2. Interactive Categories Section ── */}
        {categories.length > 0 && (
          <section className="section-block">
            <div className="section-header">
              <div>
                <h2 className="section-title">
                  <Layers size={24} color="var(--accent2)" />
                  دسته‌بندی‌های موضوعی
                </h2>
                <p className="section-subtitle">بر اساس ژانر و موضوع مورد علاقه خود کتاب‌ها را فیلتر کنید</p>
              </div>
              <Link to="/books" className="btn-outline" style={{ fontSize: '13px', padding: '7px 14px' }}>
                همه دسته‌بندی‌ها
                <ArrowLeft size={14} />
              </Link>
            </div>

            <div className="categories-grid">
              {categories.map((cat) => (
                <Link
                  key={cat.id}
                  to={`/books?category=${cat.slug}`}
                  className="category-card"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span className="category-card-icon">
                      <BookMarked size={18} />
                    </span>
                    <span style={{ fontWeight: 700, fontSize: '14.5px' }}>{cat.name}</span>
                  </div>
                  <ArrowLeft size={15} color="var(--muted)" />
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── 3. Tabbed Books Showcase ── */}
        <section className="section-block">
          <div className="section-header">
            <div>
              <h2 className="section-title">
                <BookOpen size={24} color="var(--accent2)" />
                ویترین کتاب‌های منتخب
              </h2>
              <p className="section-subtitle">تازه‌ترین کتاب‌های اضافه‌شده به قفسه‌های کتابخانه</p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div className="tabs-pill-group" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'newest'}
                  className={`tab-pill-btn ${activeTab === 'newest' ? 'active' : ''}`}
                  onClick={() => setActiveTab('newest')}
                >
                  جدیدترین کتاب‌ها
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'available'}
                  className={`tab-pill-btn ${activeTab === 'available' ? 'active' : ''}`}
                  onClick={() => setActiveTab('available')}
                >
                  موجود برای امانت ({toPersianDigits(availableCount)})
                </button>
              </div>

              <Link to="/books" className="btn-outline" style={{ fontSize: '13px', padding: '8px 14px' }}>
                مشاهده همه <ArrowLeft size={14} />
              </Link>
            </div>
          </div>

          {loading ? (
            <div className="books-grid">
              {[1, 2, 3, 4].map((n) => (
                <BookCardSkeleton key={n} />
              ))}
            </div>
          ) : displayedBooks.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--muted)' }}>
              کتابی در این بخش یافت نشد.
            </div>
          ) : (
            <div className="books-grid">
              {displayedBooks.map((book) => (
                <BookCard key={book.id} book={book} />
              ))}
            </div>
          )}
        </section>

        {/* ── 4. How It Works (3 Steps) ── */}
        <section className="section-block">
          <div className="section-header">
            <div>
              <h2 className="section-title">چطور از کتاب‌سرا کتاب امانت بگیریم؟</h2>
              <p className="section-subtitle">فرآیند ساده و تمام‌دیجیتال در سه گام کوتاه</p>
            </div>
          </div>

          <div className="steps-grid">
            <div className="step-card">
              <div className="step-number">{toPersianDigits(1)}</div>
              <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>انتخاب و بررسی کتاب</h3>
              <p style={{ color: 'var(--text-dim)', fontSize: '13.5px' }}>
                در کاتالوگ جستجو کنید، خلاصه کتاب و دیدگاه‌های سایر خوانندگان را بخوانید و کتاب مورد نظر خود را بیابید.
              </p>
            </div>

            <div className="step-card">
              <div className="step-number">{toPersianDigits(2)}</div>
              <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>امانت آنی ۱۴ روزه</h3>
              <p style={{ color: 'var(--text-dim)', fontSize: '13.5px' }}>
                تنها با یک کلیک کتاب را برای ۱۴ روز به امانت بگیرید و وضعیت مهلت بازگشت آن را در داشبورد خود دنبال کنید.
              </p>
            </div>

            <div className="step-card">
              <div className="step-number">{toPersianDigits(3)}</div>
              <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>بازگشت آسان و ثبت تجربه</h3>
              <p style={{ color: 'var(--text-dim)', fontSize: '13.5px' }}>
                پس از مطالعه، کتاب را از طریق پنل کاربری به کتابخانه بازگردانید و نظر و پیشنهاد خود را برای دیگران ثبت کنید.
              </p>
            </div>
          </div>
        </section>

        {/* ── 5. Why Choose Us Features ── */}
        <section className="section-block">
          <div className="steps-grid">
            <div className="card" style={{ textAlign: 'center', padding: '30px 22px' }}>
              <BookmarkCheck size={34} color="var(--accent2)" style={{ margin: '0 auto 14px' }} />
              <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>مجموعه گلچین‌شده</h3>
              <p style={{ color: 'var(--text-dim)', fontSize: '13.5px' }}>
                دسترسی به طیف وسیعی از کتاب‌های دسته‌بندی‌شده در حوزه‌های ادبیات، مهندسی، تاریخ و علوم.
              </p>
            </div>

            <div className="card" style={{ textAlign: 'center', padding: '30px 22px' }}>
              <Library size={34} color="var(--accent2)" style={{ margin: '0 auto 14px' }} />
              <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>مدیریت هوشمند امانت</h3>
              <p style={{ color: 'var(--text-dim)', fontSize: '13.5px' }}>
                محاسبه خودکار موعد تحویل ۱۴ روزه، مشاهده سوابق امانت و امکان افزودن کتاب‌ها به لیست علاقه‌مندی‌ها.
              </p>
            </div>

            <div className="card" style={{ textAlign: 'center', padding: '30px 22px' }}>
              <MessageSquareHeart size={34} color="var(--accent2)" style={{ margin: '0 auto 14px' }} />
              <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>جامعه پویای کتاب‌خوان‌ها</h3>
              <p style={{ color: 'var(--text-dim)', fontSize: '13.5px' }}>
                امکان ثبت نقد و بررسی، مشاهده درصد پیشنهاد کاربران و مشارکت مستقیم در غنی‌تر کردن کتابخانه.
              </p>
            </div>
          </div>
        </section>

        {/* ── 6. Bottom Call-To-Action Banner ── */}
        <section className="cta-banner">
          <div style={{ maxWidth: '620px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '8px' }}>
              کتاب ارزشمندی می‌شناسید که جای آن در کتابخانه خالی است؟
            </h2>
            <p style={{ color: 'var(--text-dim)', fontSize: '14.5px' }}>
              همین حالا آن را با تصویر جلد و توضیحات کامل به مجموعه کتاب‌سرا اضافه کنید تا سایر اعضا نیز از مطالعه آن بهره‌مند شوند.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <Link
              to={isAuthenticated ? '/books/create' : '/register'}
              className="btn-primary"
              style={{ padding: '12px 24px', fontSize: '14.5px' }}
            >
              <PlusCircle size={18} />
              {isAuthenticated ? 'افزودن کتاب جدید' : 'عضویت و ثبت کتاب'}
            </Link>
            <Link to="/books" className="btn-outline" style={{ padding: '12px 20px', fontSize: '14.5px' }}>
              مشاهده کاتالوگ
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
};
