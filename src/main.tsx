import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { cleanupLikeSessions } from './lib/constants';

if (new URLSearchParams(window.location.search).get('reset') === 'true') {
  localStorage.clear();
  window.location.replace(window.location.pathname);
}

cleanupLikeSessions();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
