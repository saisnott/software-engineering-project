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
  BookMarked,
  Wallet
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

  const approvedBooks = allBooks.filter((b) => !b.approval_status || b.approval_status === 'approved');
  const displayedBooks =
    activeTab === 'available'
      ? approvedBooks.filter((b) => b.is_available).slice(0, 8)
      : approvedBooks.slice(0, 8);

  const heroStackBooks = approvedBooks.slice(0, 3);
  const availableCount = approvedBooks.filter((b) => b.is_available).length;

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
                <span>نسل نوین کتابخانه دیجیتال، امانت و خرید آنلاین کتاب</span>
              </div>

              <h1 className="hero-title">
                دنیایی از کتاب‌های ماندگار، آماده{' '}
                <span className="hero-title-highlight">امانت، خرید و مطالعه شما</span>
              </h1>

              <p className="hero-subtitle">
                در کتاب‌سرا به مجموعه‌ای غنی از کتاب‌های منتخب دسترسی داشته باشید، کتاب دلخواهتان را
                برای ۱۴ روز امانت بگیرید یا نسخه آن را به‌صورت دائمی خریداری کنید و دیدگاه‌های خود را با جامعه کتاب‌خوان‌ها به اشتراک بگذارید.
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
                    {loading ? '...' : `+${toPersianDigits(approvedBooks.length || 12)}`}
                  </span>
                  <span className="hero-stat-label">عنوان کتاب تأییدشده</span>
                </div>

                <div className="hero-stat-item">
                  <span className="hero-stat-value">
                    {loading ? '...' : toPersianDigits(availableCount)}
                  </span>
                  <span className="hero-stat-label">کتاب موجود در قفسه</span>
                </div>

                <div className="hero-stat-item">
                  <span className="hero-stat-value">{toPersianDigits(14)} روز</span>
                  <span className="hero-stat-label">امانت + قابلیت تمدید</span>
                </div>
              </div>
            </div>

            {/* Left Column (3D Floating Book Showcase) */}
            <div className="hero-visual">
              <div className="hero-showcase-stage">
                <div className="hero-floating-chip chip-top">
                  <CheckCircle2 size={18} color="var(--success)" />
                  <span>امانت ۱۴ روزه یا خرید دائمی</span>
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
                  موجود در قفسه ({toPersianDigits(availableCount)})
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
              <h2 className="section-title">چطور از کتاب‌سرا استفاده کنیم؟</h2>
              <p className="section-subtitle">فرآیند ساده و تمام‌دیجیتال در سه گام کوتاه</p>
            </div>
          </div>

          <div className="steps-grid">
            <div className="step-card">
              <div className="step-number">{toPersianDigits(1)}</div>
              <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>انتخاب و بررسی کتاب</h3>
              <p style={{ color: 'var(--text-dim)', fontSize: '13.5px' }}>
                در کاتالوگ جستجو کنید، وضعیت جلدهای موجود در قفسه را ببینید و خلاصه کتاب و دیدگاه‌های سایر خوانندگان را مطالعه کنید.
              </p>
            </div>

            <div className="step-card">
              <div className="step-number">{toPersianDigits(2)}</div>
              <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>امانت ۱۴ روزه یا خرید دائمی</h3>
              <p style={{ color: 'var(--text-dim)', fontSize: '13.5px' }}>
                کتاب را برای ۱۴ روز (با ودیعه قابل برگشت) به امانت بگیرید یا نسخه آن را به‌صورت دائمی از طریق کیف‌پول حساب کاربری خریداری کنید؛ در صورت تکمیل ظرفیت نیز می‌توانید وارد صف رزرو شوید.
              </p>
            </div>

            <div className="step-card">
              <div className="step-number">{toPersianDigits(3)}</div>
              <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>تمدید، تحویل و ثبت تجربه</h3>
              <p style={{ color: 'var(--text-dim)', fontSize: '13.5px' }}>
                مهلت مطالعه را تا ۷ روز تمدید کنید، پس از تحویل کتاب ودیعه خود را به‌صورت خودکار در کیف‌پول پس بگیرید و نقد و امتیازتان را ثبت کنید.
              </p>
            </div>
          </div>
        </section>

        {/* ── 5. Why Choose Us Features ── */}
        <section className="section-block">
          <div className="steps-grid">
            <div className="card" style={{ textAlign: 'center', padding: '30px 22px' }}>
              <BookmarkCheck size={34} color="var(--accent2)" style={{ margin: '0 auto 14px' }} />
              <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>کاتالوگ بررسی و تأییدشده</h3>
              <p style={{ color: 'var(--text-dim)', fontSize: '13.5px' }}>
                تمامی کتاب‌های ثبت‌شده پیش از انتشار عمومی توسط تیم کتابخانه بررسی و تأیید می‌شوند تا کیفیت و دقت مشخصات تضمین شود.
              </p>
            </div>

            <div className="card" style={{ textAlign: 'center', padding: '30px 22px' }}>
              <Library size={34} color="var(--accent2)" style={{ margin: '0 auto 14px' }} />
              <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>مدیریت هوشمند امانت و رزرو</h3>
              <p style={{ color: 'var(--text-dim)', fontSize: '13.5px' }}>
                پشتیبانی از چند جلد برای هر کتاب، امکان تمدید آنلاین مهلت مطالعه و اطلاع‌رسانی خودکار به‌محض موجود شدن کتاب‌های صف رزرو.
              </p>
            </div>

            <div className="card" style={{ textAlign: 'center', padding: '30px 22px' }}>
              <Wallet size={34} color="var(--accent2)" style={{ margin: '0 auto 14px' }} />
              <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>کیف‌پول یکپارچه حساب کاربری</h3>
              <p style={{ color: 'var(--text-dim)', fontSize: '13.5px' }}>
                پرداخت آسان برای خرید یا امانت کتاب، آزادسازی خودکار ودیعه پس از تحویل و دسترسی کامل به تاریخچه و کد پیگیری تراکنش‌ها.
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
              همین حالا آن را با تصویر جلد و مشخصات کامل ثبت کنید؛ پس از بررسی و تأیید مدیریت در کاتالوگ منتشر می‌شود و درآمد حاصل از امانت یا فروش آن نیز به کیف‌پول شما تعلق می‌گیرد.
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
