import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
import { initTheme } from '@/lib/theme';
import '@/index.css';

// Before first paint, so the page never flashes the wrong theme.
initTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
