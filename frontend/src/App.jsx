import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { NotificationProvider } from './context/NotificationContext';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { ProtectedRoute } from './components/ProtectedRoute';

import { HomePage } from './pages/HomePage';
import { BookListPage } from './pages/BookListPage';
import { BookDetailPage } from './pages/BookDetailPage';
import { BookCreatePage } from './pages/BookCreatePage';
import { BookEditPage } from './pages/BookEditPage';
import { UserDashboardPage } from './pages/UserDashboardPage';
import { ManagerDashboardPage } from './pages/ManagerDashboardPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { toPersianDigits } from './utils/formatters';

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);

  return null;
}

function NotFoundPage() {
  return (
    <div className="container" style={{ textAlign: 'center', padding: '100px 0' }}>
      <h1 style={{ fontSize: '56px', fontWeight: 900, color: 'var(--accent2)', marginBottom: '12px' }}>
        {toPersianDigits(404)}
      </h1>
      <h2 style={{ fontSize: '22px', marginBottom: '14px' }}>صفحه مورد نظر یافت نشد</h2>
      <p style={{ color: 'var(--text-dim)', marginBottom: '26px' }}>
        صفحه‌ای که به دنبال آن هستید وجود ندارد یا به نشانی دیگری منتقل شده است.
      </p>
      <Link to="/" className="btn-primary">
        بازگشت به صفحه اصلی
      </Link>
    </div>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <NotificationProvider>
          <BrowserRouter>
            <ScrollToTop />
            <Navbar />
            <main className="site-main">
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/books" element={<BookListPage />} />
                <Route path="/books/:id" element={<BookDetailPage />} />

                {/* Protected Routes */}
                <Route
                  path="/books/create"
                  element={
                    <ProtectedRoute>
                      <BookCreatePage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/books/:id/edit"
                  element={
                    <ProtectedRoute>
                      <BookEditPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <UserDashboardPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/manager/dashboard"
                  element={
                    <ProtectedRoute requireStaff>
                      <ManagerDashboardPage />
                    </ProtectedRoute>
                  }
                />

                {/* Auth Routes */}
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />

                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </main>
            <Footer />
          </BrowserRouter>
        </NotificationProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
