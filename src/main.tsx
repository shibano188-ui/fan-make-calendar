import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

if (new URLSearchParams(window.location.search).get('reset') === 'true') {
  localStorage.clear();
  window.location.replace(window.location.pathname);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
