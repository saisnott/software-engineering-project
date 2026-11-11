import React from 'react';
import { Link } from 'react-router-dom';
import { Library, PhoneCall, Compass } from 'lucide-react';
import { toPersianDigits } from '../utils/formatters';

const CURRENT_YEAR = toPersianDigits(new Date().getFullYear());

export const Footer = () => {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          {/* Column 1: About Brand */}
          <div>
            <Link to="/" className="brand" style={{ marginBottom: '12px' }}>
              <span className="brand-logo-box" style={{ width: '34px', height: '34px' }}>
                <Library size={18} />
              </span>
              <span>کتاب‌سرا</span>
            </Link>
            <p style={{ color: 'var(--text-dim)', fontSize: '13.5px', lineHeight: '1.8', marginTop: '10px' }}>
              پلتفرم مدرن مدیریت کتابخانه، امانت هوشمند کتاب و تبادل نظر میان علاقه‌مندان به مطالعه و کتاب‌خوانی.
            </p>
          </div>

          {/* Column 2: Quick Links */}
          <div>
            <h4 className="footer-col-title">
              <Compass size={16} color="var(--accent2)" />
              دسترسی سریع
            </h4>
            <ul className="footer-links">
              <li><Link to="/">صفحه اصلی</Link></li>
              <li><Link to="/books">کاتالوگ کتاب‌ها</Link></li>
              <li><Link to="/books?status=available">کتاب‌های موجود برای امانت</Link></li>
              <li><Link to="/dashboard">داشبورد کاربری من</Link></li>
            </ul>
          </div>

          {/* Column 3: Support */}
          <div>
            <h4 className="footer-col-title">
              <PhoneCall size={16} color="var(--accent2)" />
              پشتیبانی و راهنما
            </h4>
            <p style={{ color: 'var(--text-dim)', fontSize: '13.5px', lineHeight: '1.9' }}>
              تلفن تماس: <span dir="ltr">{toPersianDigits('021-1234-5678')}</span><br />
              ایمیل: support@mybookstore.ir
            </p>
          </div>
        </div>

        <div className="footer-bottom">
          <span>
            © {CURRENT_YEAR} کتاب‌سرا
          </span>
        </div>
      </div>
    </footer>
  );
};
