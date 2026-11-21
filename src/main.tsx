import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './ui/App';
import './ui/styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Only the hosted site registers a service worker; extension pages use their
// own bundled assets. First install and model downloads still require network.
if (import.meta.env.PROD && /^https?:$/.test(window.location.protocol) && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
    // The app remains usable online when the browser blocks service workers.
  });
}
