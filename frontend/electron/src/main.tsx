import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

try {
  const preference = window.localStorage.getItem('sage-theme-preference');
  if (preference === 'dark' || preference === 'light') {
    document.documentElement.setAttribute('data-theme', preference);
  }
} catch {
  // Follow system preference when no explicit override is available.
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
