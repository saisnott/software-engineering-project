import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Flip } from 'gsap/Flip';
import { useGSAP } from '@gsap/react';
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
  Wallet,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import api from '../api/client';
import { BookCard, BookCardSkeleton } from '../components/BookCard';
import { useAuth } from '../context/AuthContext';
import { toPersianDigits, formatPrice } from '../utils/formatters';

gsap.registerPlugin(ScrollTrigger, Flip, useGSAP);

const DECK_SLOTS = [
  { x: 0, y: -8, rotation: -1.5, scale: 1, opacity: 1, zIndex: 3 },
  { x: 88, y: 18, rotation: 9, scale: 0.89, opacity: 0.92, zIndex: 2 },
  { x: -88, y: 24, rotation: -10, scale: 0.87, opacity: 0.86, zIndex: 1 }
];

const supportsNativeScrollTimeline = () =>
  typeof CSS !== 'undefined' &&
  typeof CSS.supports === 'function' &&
  CSS.supports('animation-timeline: scroll()');

const handleSpotlightMove = (event) => {
  const card = event.currentTarget;
  const rect = card.getBoundingClientRect();
  card.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
  card.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
};

export const HomePage = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const pageRef = useRef(null);
  const tabIndicatorRef = useRef(null);
  const newestTabRef = useRef(null);
  const availableTabRef = useRef(null);
  const flipStateRef = useRef(null);
  const deckHasEnteredRef = useRef(false);
  const approvedCountRef = useRef(null);
  const availableCountRef = useRef(null);
  const borrowDaysRef = useRef(null);

  const [allBooks, setAllBooks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('newest');
  const [quickSearch, setQuickSearch] = useState('');
  const [deckIndex, setDeckIndex] = useState(0);

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
  const safeDeckIndex = heroStackBooks.length > 0 ? deckIndex % heroStackBooks.length : 0;

  const handleTabChange = (nextTab) => {
    if (nextTab === activeTab) return;
    if (pageRef.current) {
      const items = pageRef.current.querySelectorAll('.showcase-book-item');
      if (items.length > 0) {
        flipStateRef.current = Flip.getState(items);
      }
    }
    setActiveTab(nextTab);
  };

  const cycleDeck = (delta) => {
    if (heroStackBooks.length < 2) return;
    setDeckIndex((prev) => (prev + delta + heroStackBooks.length) % heroStackBooks.length);
  };

  // 1. Hero Entrance Choreography, Multi-Layer Parallax, Magnetic CTAs & Scroll Progress Fallback
  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        // Master Hero Entrance Timeline (Masked Clip-Path Line Reveal + Stagger)
        const heroTl = gsap.timeline({ defaults: { ease: 'power4.out' } });

        heroTl
          .from('.hero-badge', { y: 12, opacity: 0, duration: 0.42 })
          .from(
            '.hero-reveal-line',
            {
              clipPath: 'inset(-10% -4% 115% -4%)',
              y: 22,
              opacity: 0,
              duration: 0.62,
              stagger: 0.08,
              clearProps: 'clipPath'
            },
            '-=0.28'
          )
          .from(
            '.hero-subtitle',
            {
              clipPath: 'inset(-10% -4% 115% -4%)',
              y: 14,
              opacity: 0,
              duration: 0.54,
              clearProps: 'clipPath'
            },
            '-=0.4'
          )
          .from(
            ['.hero-search-form', '.hero-cta-row', '.hero-stats-row'],
            {
              y: 16,
              opacity: 0,
              duration: 0.48,
              stagger: 0.07,
              ease: 'power3.out',
              clearProps: 'transform'
            },
            '-=0.35'
          )
          .from(
            '.hero-floating-chip',
            {
              y: 14,
              opacity: 0,
              scale: 0.94,
              duration: 0.48,
              stagger: 0.1,
              ease: 'power3.out'
            },
            '-=0.48'
          );

        // Start gentle GPU-composited floating loop only AFTER entrance finishes (~1.22s / 1.32s)
        gsap.to('.hero-floating-chip.chip-top', {
          y: -7,
          duration: 2.5,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
          delay: 1.35,
          overwrite: 'auto'
        });
        gsap.to('.hero-floating-chip.chip-bottom', {
          y: 7,
          duration: 2.9,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
          delay: 1.5,
          overwrite: 'auto'
        });

        // Multi-Layer Hero Parallax on Scroll
        gsap.to('.hero-glow', {
          y: 75,
          x: -24,
          ease: 'none',
          scrollTrigger: {
            trigger: '.hero-section',
            start: 'top top',
            end: 'bottom top',
            scrub: 0.6
          }
        });

        gsap.to('.hero-glow-left', {
          y: -60,
          x: 24,
          ease: 'none',
          scrollTrigger: {
            trigger: '.hero-section',
            start: 'top top',
            end: 'bottom top',
            scrub: 0.6
          }
        });

        gsap.to('.hero-visual-parallax', {
          y: -28,
          ease: 'none',
          scrollTrigger: {
            trigger: '.hero-section',
            start: 'top top',
            end: 'bottom top',
            scrub: 0.6
          }
        });

        // Scroll Progress Bar Fallback when native CSS animation-timeline: scroll() is unsupported
        if (!supportsNativeScrollTimeline()) {
          gsap.fromTo(
            '.scroll-progress-bar',
            { scaleX: 0 },
            {
              scaleX: 1,
              ease: 'none',
              scrollTrigger: {
                trigger: document.documentElement,
                start: 'top top',
                end: 'bottom bottom',
                scrub: true
              }
            }
          );
        }
      });

      // Subtle Magnetic Pull on Primary CTA Buttons (pointer devices + reduced-motion safe)
      mm.add('(prefers-reduced-motion: no-preference) and (hover: hover)', () => {
        const cleanups = [];
        const buttons = pageRef.current?.querySelectorAll('.magnetic-btn') || [];

        buttons.forEach((btn) => {
          const xTo = gsap.quickTo(btn, 'x', { duration: 0.35, ease: 'power3.out' });
          const yTo = gsap.quickTo(btn, 'y', { duration: 0.35, ease: 'power3.out' });

          const onMove = (e) => {
            const rect = btn.getBoundingClientRect();
            const relX = (e.clientX - rect.left) / rect.width - 0.5;
            const relY = (e.clientY - rect.top) / rect.height - 0.5;
            xTo(relX * 8);
            yTo(relY * 6);
          };

          const onLeave = () => {
            gsap.to(btn, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1, 0.55)', overwrite: 'auto' });
          };

          btn.addEventListener('pointermove', onMove);
          btn.addEventListener('pointerleave', onLeave);
          cleanups.push(() => {
            btn.removeEventListener('pointermove', onMove);
            btn.removeEventListener('pointerleave', onLeave);
          });
        });

        return () => cleanups.forEach((fn) => fn());
      });
    },
    { scope: pageRef }
  );

  // 2. Interactive 3-Book Hero Deck Fan-Out & Smooth Cycling (Pure 2D, Zero Z-Fighting)
  useGSAP(
    () => {
      const cards = pageRef.current?.querySelectorAll('.hero-book-stack-card-gsap') || [];
      if (cards.length === 0) return;

      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const len = cards.length;

      cards.forEach((card, idx) => {
        const slotIndex = (idx - safeDeckIndex + len) % len;
        const target = DECK_SLOTS[slotIndex] || DECK_SLOTS[0];

        if (reduced) {
          gsap.set(card, target);
          return;
        }

        if (!deckHasEnteredRef.current) {
          gsap.fromTo(
            card,
            { x: 0, y: 28, rotation: 0, scale: 0.88, opacity: 0, zIndex: target.zIndex },
            {
              ...target,
              duration: 0.72,
              delay: 0.14 + slotIndex * 0.08,
              ease: 'power3.out',
              overwrite: 'auto'
            }
          );
        } else {
          gsap.to(card, {
            ...target,
            duration: 0.54,
            ease: 'power3.out',
            overwrite: 'auto'
          });
        }
      });

      if (heroStackBooks.length > 0) {
        deckHasEnteredRef.current = true;
      }
    },
    { scope: pageRef, dependencies: [safeDeckIndex, heroStackBooks.length] }
  );

  // 3. Live Animated Persian Counters for Hero Metrics
  useGSAP(
    () => {
      if (loading) return;
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

      const targets = [
        { ref: approvedCountRef, value: approvedBooks.length || 12, prefix: '+', suffix: '' },
        { ref: availableCountRef, value: availableCount, prefix: '', suffix: '' },
        { ref: borrowDaysRef, value: 14, prefix: '', suffix: ' روز' }
      ];

      targets.forEach(({ ref, value, prefix, suffix }, index) => {
        const el = ref.current;
        if (!el) return;
        if (reduced || value === 0) {
          el.textContent = `${prefix}${toPersianDigits(value)}${suffix}`;
          return;
        }
        const proxy = { num: 0 };
        gsap.to(proxy, {
          num: value,
          duration: 0.95,
          delay: 0.15 + index * 0.08,
          ease: 'power3.out',
          onUpdate: () => {
            if (ref.current) {
              ref.current.textContent = `${prefix}${toPersianDigits(Math.round(proxy.num))}${suffix}`;
            }
          }
        });
      });
    },
    { scope: pageRef, dependencies: [loading, approvedBooks.length, availableCount] }
  );

  // 4. Below-the-Fold ScrollTrigger Reveals, Scroll-Linked Step Timeline & CTA Shimmer
  useGSAP(
    () => {
      if (loading) return;
      const mm = gsap.matchMedia();

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        // Section Headers
        gsap.utils.toArray('.gsap-section-header').forEach((header) => {
          gsap.from(header, {
            y: 22,
            opacity: 0,
            duration: 0.6,
            ease: 'power3.out',
            clearProps: 'transform',
            scrollTrigger: {
              trigger: header,
              start: 'top 88%',
              once: true
            }
          });
        });

        // Categories Stagger Reveal
        if (pageRef.current?.querySelector('.category-card')) {
          gsap.from('.category-card', {
            y: 22,
            opacity: 0,
            scale: 0.97,
            duration: 0.5,
            stagger: 0.045,
            ease: 'power3.out',
            clearProps: 'transform',
            scrollTrigger: {
              trigger: '.categories-grid',
              start: 'top 86%',
              once: true
            }
          });
        }

        // Showcase Books Initial Stagger Reveal
        if (pageRef.current?.querySelector('.showcase-book-item')) {
          gsap.from('.showcase-book-item', {
            y: 26,
            opacity: 0,
            scale: 0.96,
            duration: 0.55,
            stagger: 0.055,
            ease: 'power3.out',
            clearProps: 'transform',
            scrollTrigger: {
              trigger: '.showcase-books-grid',
              start: 'top 86%',
              once: true
            }
          });
        }

        // Scroll-Linked 3-Step Timeline Progress Line + Sequential Card & Badge Reveal
        if (pageRef.current?.querySelector('.steps-timeline-fill')) {
          gsap.fromTo(
            '.steps-timeline-fill',
            { scaleX: 0 },
            {
              scaleX: 1,
              ease: 'none',
              scrollTrigger: {
                trigger: '.steps-timeline-wrap',
                start: 'top 82%',
                end: 'center 52%',
                scrub: 0.45
              }
            }
          );
        }

        const stepTl = gsap.timeline({
          scrollTrigger: {
            trigger: '.steps-timeline-wrap',
            start: 'top 84%',
            once: true
          }
        });
        stepTl
          .from('.gsap-step-card', {
            y: 28,
            opacity: 0,
            scale: 0.97,
            duration: 0.58,
            stagger: 0.12,
            ease: 'power3.out',
            clearProps: 'transform'
          })
          .from(
            '.gsap-step-card .step-number',
            {
              scale: 0.72,
              duration: 0.45,
              stagger: 0.12,
              ease: 'back.out(1.8)',
              clearProps: 'transform'
            },
            '-=0.55'
          );

        // Why Choose Us Feature Cards
        gsap.from('.gsap-feature-card', {
          y: 26,
          opacity: 0,
          scale: 0.97,
          duration: 0.56,
          stagger: 0.1,
          ease: 'power3.out',
          clearProps: 'transform',
          scrollTrigger: {
            trigger: '.features-grid',
            start: 'top 86%',
            once: true
          }
        });

        // Bottom CTA Banner + Liquid Glass Shimmer Sweep
        const ctaTl = gsap.timeline({
          scrollTrigger: {
            trigger: '.cta-banner',
            start: 'top 88%',
            once: true
          }
        });
        ctaTl
          .from('.cta-banner', {
            y: 28,
            opacity: 0,
            scale: 0.985,
            duration: 0.65,
            ease: 'power3.out',
            clearProps: 'transform'
          })
          .fromTo(
            '.cta-banner-shimmer',
            { xPercent: 140, opacity: 0 },
            {
              keyframes: [
                { xPercent: 10, opacity: 0.9, duration: 0.55, ease: 'power1.in' },
                { xPercent: -220, opacity: 0, duration: 0.65, ease: 'power2.out' }
              ],
              clearProps: 'transform,opacity'
            },
            '-=0.3'
          );
      });

      ScrollTrigger.refresh();
    },
    { scope: pageRef, dependencies: [loading] }
  );

  // 5. Sliding Active Tab Indicator + GSAP Flip Book Filtering
  useGSAP(
    () => {
      const indicator = tabIndicatorRef.current;
      const activeBtn = activeTab === 'available' ? availableTabRef.current : newestTabRef.current;
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

      const syncIndicator = (immediate = false) => {
        if (!indicator || !activeBtn) return;
        const props = {
          x: activeBtn.offsetLeft,
          width: activeBtn.offsetWidth,
          opacity: 1
        };
        if (immediate || reduced) {
          gsap.set(indicator, props);
        } else {
          gsap.to(indicator, { ...props, duration: 0.36, ease: 'power3.out', overwrite: 'auto' });
        }
      };

      syncIndicator(!flipStateRef.current);

      const abortController = new AbortController();
      document.fonts?.ready?.then(() => {
        if (!abortController.signal.aborted) syncIndicator(true);
      });

      const handleResize = () => syncIndicator(true);
      window.addEventListener('resize', handleResize);

      if (flipStateRef.current) {
        const state = flipStateRef.current;
        flipStateRef.current = null;

        if (!reduced && pageRef.current?.querySelector('.showcase-book-item')) {
          Flip.from(state, {
            targets: '.showcase-book-item',
            duration: 0.48,
            ease: 'power3.out',
            stagger: 0.03,
            scale: false,
            absoluteOnLeave: true,
            onEnter: (elements) =>
              gsap.fromTo(
                elements,
                { opacity: 0, y: 14, scale: 0.96 },
                { opacity: 1, y: 0, scale: 1, duration: 0.38, ease: 'power3.out', stagger: 0.03 }
              ),
            onLeave: (elements) =>
              gsap.to(elements, { opacity: 0, scale: 0.94, duration: 0.2, ease: 'power2.in' })
          });
        }
      }

      return () => {
        abortController.abort();
        window.removeEventListener('resize', handleResize);
      };
    },
    { scope: pageRef, dependencies: [activeTab, loading, availableCount] }
  );

  return (
    <div ref={pageRef} className="landing-page-root">
      {/* Scroll Progress Bar */}
      <div className="scroll-progress-bar" aria-hidden="true" />

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
                <span className="hero-reveal-line">دنیایی از کتاب‌های ماندگار، آماده</span>{' '}
                <span className="hero-reveal-line hero-title-highlight">امانت و مطالعه شما</span>
              </h1>

              <p className="hero-subtitle">
                در کتاب‌سرا به مجموعه‌ای غنی از کتاب‌های منتخب دسترسی داشته باشید، کتاب دلخواهتان را
                برای ۱۴ روز امانت بگیرید، در صورت نیاز تمدید کنید و دیدگاه‌های خود را با جامعه کتاب‌خوان‌ها به اشتراک بگذارید.
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
                <Link
                  to="/books"
                  className="btn-primary magnetic-btn"
                  style={{ padding: '11px 24px', fontSize: '15px' }}
                >
                  <BookOpen size={18} />
                  کاوش در کاتالوگ
                </Link>

                {!isAuthenticated ? (
                  <Link
                    to="/register"
                    className="btn-outline magnetic-btn"
                    style={{ padding: '11px 24px', fontSize: '15px' }}
                  >
                    <LogIn size={18} />
                    ساخت حساب رایگان
                  </Link>
                ) : (
                  <Link
                    to="/dashboard"
                    className="btn-outline magnetic-btn"
                    style={{ padding: '11px 24px', fontSize: '15px' }}
                  >
                    <Library size={18} />
                    داشبورد کتابخانه من
                  </Link>
                )}
              </div>

              {/* Live Metrics */}
              <div className="hero-stats-row">
                <div className="hero-stat-item">
                  <span ref={approvedCountRef} className="hero-stat-value">
                    {loading ? '...' : `+${toPersianDigits(approvedBooks.length || 12)}`}
                  </span>
                  <span className="hero-stat-label">عنوان کتاب تأییدشده</span>
                </div>

                <div className="hero-stat-item">
                  <span ref={availableCountRef} className="hero-stat-value">
                    {loading ? '...' : toPersianDigits(availableCount)}
                  </span>
                  <span className="hero-stat-label">کتاب موجود در قفسه</span>
                </div>

                <div className="hero-stat-item">
                  <span ref={borrowDaysRef} className="hero-stat-value">
                    {toPersianDigits(14)} روز
                  </span>
                  <span className="hero-stat-label">امانت + قابلیت تمدید</span>
                </div>
              </div>
            </div>

            {/* Left Column (Interactive Flicker-Free Book Deck Showcase) */}
            <div className="hero-visual hero-visual-parallax">
              <div className="hero-showcase-column">
                <div className="hero-showcase-stage">
                  <div className="hero-floating-chip hero-floating-chip-gsap chip-top">
                    <CheckCircle2 size={18} color="var(--success)" />
                    <span>امانت ۱۴ روزه + تمدید آنلاین</span>
                  </div>

                  <div className="hero-floating-chip hero-floating-chip-gsap chip-bottom">
                    <MessageSquareHeart size={18} color="var(--accent2)" />
                    <span>نقد و بررسی جامعه کتاب‌خوان‌ها</span>
                  </div>

                  {heroStackBooks.length > 0 ? (
                    heroStackBooks.map((book, idx) => {
                      const slotIndex = (idx - safeDeckIndex + heroStackBooks.length) % heroStackBooks.length;
                      const isFront = slotIndex === 0;
                      return (
                        <Link
                          to={`/books/${book.id}`}
                          key={book.id}
                          onClick={(e) => {
                            if (!isFront) {
                              e.preventDefault();
                              setDeckIndex(idx);
                            }
                          }}
                          className={`hero-book-stack-card hero-book-stack-card-gsap ${isFront ? 'is-front' : 'is-side'}`}
                          title={isFront ? `مشاهده ${book.title}` : `نمایش ${book.title} در جلو`}
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
                    <div className="hero-book-stack-card hero-book-stack-card-gsap is-front" style={{ alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center' }}>
                      <BookOpen size={52} color="var(--accent2)" style={{ marginBottom: '12px' }} />
                      <div style={{ fontWeight: 700, fontSize: '16px' }}>ویترین کتاب‌سرا</div>
                      <div style={{ fontSize: '12.5px', color: 'var(--muted)', marginTop: '6px' }}>
                        مجموعه‌ای از بهترین آثار ادبی و علمی
                      </div>
                    </div>
                  )}
                </div>

                {heroStackBooks.length > 1 && (
                  <div className="hero-deck-controls" aria-label="تغییر کتاب ویترین">
                    <button
                      type="button"
                      className="hero-deck-nav-btn"
                      onClick={() => cycleDeck(-1)}
                      aria-label="کتاب قبلی ویترین"
                      title="کتاب قبلی"
                    >
                      <ChevronRight size={15} />
                    </button>

                    <div className="hero-deck-dots">
                      {heroStackBooks.map((book, idx) => (
                        <button
                          key={book.id}
                          type="button"
                          className={`hero-deck-dot ${idx === safeDeckIndex ? 'active' : ''}`}
                          onClick={() => setDeckIndex(idx)}
                          aria-label={`نمایش کتاب ${book.title}`}
                          aria-pressed={idx === safeDeckIndex}
                        />
                      ))}
                    </div>

                    <button
                      type="button"
                      className="hero-deck-nav-btn"
                      onClick={() => cycleDeck(1)}
                      aria-label="کتاب بعدی ویترین"
                      title="کتاب بعدی"
                    >
                      <ChevronLeft size={15} />
                    </button>
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
            <div className="section-header gsap-section-header">
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
                  className="category-card spotlight-card"
                  onPointerMove={handleSpotlightMove}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'relative', zIndex: 1 }}>
                    <span className="category-card-icon">
                      <BookMarked size={18} />
                    </span>
                    <span style={{ fontWeight: 700, fontSize: '14.5px' }}>{cat.name}</span>
                  </div>
                  <ArrowLeft size={15} color="var(--muted)" className="category-card-arrow" />
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── 3. Tabbed Books Showcase ── */}
        <section className="section-block">
          <div className="section-header gsap-section-header">
            <div>
              <h2 className="section-title">
                <BookOpen size={24} color="var(--accent2)" />
                ویترین کتاب‌های منتخب
              </h2>
              <p className="section-subtitle">تازه‌ترین کتاب‌های اضافه‌شده به قفسه‌های کتابخانه</p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div className="tabs-pill-group tabs-pill-group-gsap" role="tablist">
                <span ref={tabIndicatorRef} className="tab-pill-indicator" aria-hidden="true" />
                <button
                  ref={newestTabRef}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'newest'}
                  className={`tab-pill-btn tab-pill-btn-gsap ${activeTab === 'newest' ? 'active' : ''}`}
                  onClick={() => handleTabChange('newest')}
                >
                  جدیدترین کتاب‌ها
                </button>
                <button
                  ref={availableTabRef}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'available'}
                  className={`tab-pill-btn tab-pill-btn-gsap ${activeTab === 'available' ? 'active' : ''}`}
                  onClick={() => handleTabChange('available')}
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
            <div className="books-grid showcase-books-grid">
              {displayedBooks.map((book) => (
                <div key={book.id} className="showcase-book-item" data-flip-id={`book-${book.id}`}>
                  <BookCard book={book} />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── 4. How It Works (3 Steps with Scroll-Linked Timeline) ── */}
        <section className="section-block">
          <div className="section-header gsap-section-header">
            <div>
              <h2 className="section-title">چطور از کتاب‌سرا استفاده کنیم؟</h2>
              <p className="section-subtitle">فرآیند ساده و تمام‌دیجیتال در سه گام کوتاه</p>
            </div>
          </div>

          <div className="steps-timeline-wrap">
            <div className="steps-timeline-track" aria-hidden="true">
              <div className="steps-timeline-fill" />
            </div>

            <div className="steps-grid">
              <div className="step-card gsap-step-card spotlight-card" onPointerMove={handleSpotlightMove}>
                <div className="step-number">{toPersianDigits(1)}</div>
                <h3 style={{ fontSize: '18px', marginBottom: '8px', position: 'relative', zIndex: 1 }}>انتخاب و بررسی کتاب</h3>
                <p style={{ color: 'var(--text-dim)', fontSize: '13.5px', position: 'relative', zIndex: 1 }}>
                  در کاتالوگ جستجو کنید، وضعیت جلدهای موجود در قفسه را ببینید و خلاصه کتاب و دیدگاه‌های سایر خوانندگان را مطالعه کنید.
                </p>
              </div>

              <div className="step-card gsap-step-card spotlight-card" onPointerMove={handleSpotlightMove}>
                <div className="step-number">{toPersianDigits(2)}</div>
                <h3 style={{ fontSize: '18px', marginBottom: '8px', position: 'relative', zIndex: 1 }}>امانت ۱۴ روزه با ودیعه قابل برگشت</h3>
                <p style={{ color: 'var(--text-dim)', fontSize: '13.5px', position: 'relative', zIndex: 1 }}>
                  کتاب را برای ۱۴ روز (با ودیعه قابل برگشت) از طریق کیف‌پول حساب کاربری به امانت بگیرید؛ در صورت تکمیل ظرفیت نیز می‌توانید وارد صف رزرو شوید.
                </p>
              </div>

              <div className="step-card gsap-step-card spotlight-card" onPointerMove={handleSpotlightMove}>
                <div className="step-number">{toPersianDigits(3)}</div>
                <h3 style={{ fontSize: '18px', marginBottom: '8px', position: 'relative', zIndex: 1 }}>تمدید، تحویل و ثبت تجربه</h3>
                <p style={{ color: 'var(--text-dim)', fontSize: '13.5px', position: 'relative', zIndex: 1 }}>
                  مهلت مطالعه را تا ۷ روز تمدید کنید، پس از تحویل کتاب ودیعه خود را به‌صورت خودکار در کیف‌پول پس بگیرید و دیدگاه و تجربه‌تان را ثبت کنید.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── 5. Why Choose Us Features ── */}
        <section className="section-block">
          <div className="steps-grid features-grid">
            <div
              className="card gsap-feature-card spotlight-card"
              onPointerMove={handleSpotlightMove}
              style={{ textAlign: 'center', padding: '30px 22px' }}
            >
              <BookmarkCheck size={34} color="var(--accent2)" style={{ margin: '0 auto 14px', position: 'relative', zIndex: 1 }} />
              <h3 style={{ fontSize: '18px', marginBottom: '8px', position: 'relative', zIndex: 1 }}>کاتالوگ بررسی و تأییدشده</h3>
              <p style={{ color: 'var(--text-dim)', fontSize: '13.5px', position: 'relative', zIndex: 1 }}>
                تمامی کتاب‌های ثبت‌شده پیش از انتشار عمومی توسط تیم کتابخانه بررسی و تأیید می‌شوند تا کیفیت و دقت مشخصات تضمین شود.
              </p>
            </div>

            <div
              className="card gsap-feature-card spotlight-card"
              onPointerMove={handleSpotlightMove}
              style={{ textAlign: 'center', padding: '30px 22px' }}
            >
              <Library size={34} color="var(--accent2)" style={{ margin: '0 auto 14px', position: 'relative', zIndex: 1 }} />
              <h3 style={{ fontSize: '18px', marginBottom: '8px', position: 'relative', zIndex: 1 }}>مدیریت هوشمند امانت و رزرو</h3>
              <p style={{ color: 'var(--text-dim)', fontSize: '13.5px', position: 'relative', zIndex: 1 }}>
                پشتیبانی از چند جلد برای هر کتاب، امکان تمدید آنلاین مهلت مطالعه و اطلاع‌رسانی خودکار به‌محض موجود شدن کتاب‌های صف رزرو.
              </p>
            </div>

            <div
              className="card gsap-feature-card spotlight-card"
              onPointerMove={handleSpotlightMove}
              style={{ textAlign: 'center', padding: '30px 22px' }}
            >
              <Wallet size={34} color="var(--accent2)" style={{ margin: '0 auto 14px', position: 'relative', zIndex: 1 }} />
              <h3 style={{ fontSize: '18px', marginBottom: '8px', position: 'relative', zIndex: 1 }}>کیف‌پول یکپارچه حساب کاربری</h3>
              <p style={{ color: 'var(--text-dim)', fontSize: '13.5px', position: 'relative', zIndex: 1 }}>
                پرداخت آسان هزینه امانت و تمدید کتاب، آزادسازی خودکار ودیعه پس از تحویل و دسترسی کامل به تاریخچه و کد پیگیری تراکنش‌ها.
              </p>
            </div>
          </div>
        </section>

        {/* ── 6. Bottom Call-To-Action Banner (with Liquid Glass Shimmer) ── */}
        <section className="cta-banner">
          <div className="cta-banner-shimmer" aria-hidden="true" />

          <div style={{ maxWidth: '620px', position: 'relative', zIndex: 1 }}>
            <h2 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '8px' }}>
              کتاب ارزشمندی می‌شناسید که جای آن در کتابخانه خالی است؟
            </h2>
            <p style={{ color: 'var(--text-dim)', fontSize: '14.5px' }}>
              همین حالا آن را با تصویر جلد و مشخصات کامل ثبت کنید؛ پس از بررسی و تأیید مدیریت در کاتالوگ منتشر می‌شود و درآمد حاصل از امانت آن نیز به کیف‌پول شما تعلق می‌گیرد.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', position: 'relative', zIndex: 1 }}>
            <Link
              to={isAuthenticated ? '/books/create' : '/register'}
              className="btn-primary magnetic-btn"
              style={{ padding: '12px 24px', fontSize: '14.5px' }}
            >
              <PlusCircle size={18} />
              {isAuthenticated ? 'افزودن کتاب جدید' : 'عضویت و ثبت کتاب'}
            </Link>
            <Link to="/books" className="btn-outline magnetic-btn" style={{ padding: '12px 20px', fontSize: '14.5px' }}>
              مشاهده کاتالوگ
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
};
