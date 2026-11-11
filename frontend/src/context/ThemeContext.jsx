import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

const ThemeContext = createContext(null);

const getSystemTheme = () => {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const getStoredScheme = () => {
  try {
    const val = localStorage.getItem('color-scheme');
    return val === 'light' || val === 'dark' ? val : null;
  } catch {
    return null;
  }
};

const syncMetaColorScheme = (storedValue) => {
  if (typeof document === 'undefined') return;
  let meta = document.querySelector('meta[name="color-scheme"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'color-scheme';
    document.head.appendChild(meta);
  }
  meta.content = storedValue ?? 'light dark';
};

export const ThemeProvider = ({ children }) => {
  const [storedScheme, setStoredScheme] = useState(() => getStoredScheme());
  const [systemTheme, setSystemTheme] = useState(() => getSystemTheme());

  const resolvedTheme = storedScheme ?? systemTheme;

  useEffect(() => {
    syncMetaColorScheme(storedScheme);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', resolvedTheme);
    }
  }, [storedScheme, resolvedTheme]);

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handleMediaChange = (e) => {
      // Update systemTheme state ONLY; never clear localStorage on OS change
      setSystemTheme(e.matches ? 'dark' : 'light');
    };
    mql.addEventListener('change', handleMediaChange);

    const handleStorageChange = (e) => {
      if (e.key === 'color-scheme' || e.key === null) {
        const nextStored = getStoredScheme();
        setStoredScheme(nextStored);
        syncMetaColorScheme(nextStored);
      }
    };
    window.addEventListener('storage', handleStorageChange);

    return () => {
      mql.removeEventListener('change', handleMediaChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const toggleTheme = useCallback(() => {
    const currentSys = getSystemTheme();
    const currentRendered = storedScheme ?? currentSys;
    const target = currentRendered === 'dark' ? 'light' : 'dark';

    try {
      if (target !== currentSys) {
        localStorage.setItem('color-scheme', target);
        setStoredScheme(target);
        syncMetaColorScheme(target);
      } else {
        localStorage.removeItem('color-scheme');
        setStoredScheme(null);
        syncMetaColorScheme(null);
      }
    } catch {
      setStoredScheme(target);
      syncMetaColorScheme(target);
    }
  }, [storedScheme]);

  const resetToSystem = useCallback(() => {
    try {
      localStorage.removeItem('color-scheme');
    } catch {
      // ignore storage errors
    }
    setStoredScheme(null);
    syncMetaColorScheme(null);
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        theme: resolvedTheme,
        storedScheme,
        systemTheme,
        toggleTheme,
        resetToSystem,
        isDark: resolvedTheme === 'dark',
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
};

