import React from 'react';
import ReactDOM from 'react-dom/client';
import { BlinkProvider, BlinkAuthProvider } from '@blinkdotnew/react';
import { ErrorBoundary } from './components/ErrorBoundary';
import App from './App';
import './index.css';

// Global error listener for unhandled promise rejections (API calls, etc.)
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  // We can't easily trigger the ErrorBoundary state from here if it's outside the React tree,
  // but since we wrap the whole App, we could potentially use a custom event or a global state.
  // For now, let's at least log it. Most critical rendering errors will be caught by ErrorBoundary.
});

/**
 * Utility to get project ID from environment or hostname.
 */
function getProjectId(): string {
  const envId = import.meta.env.VITE_BLINK_PROJECT_ID;
  if (envId) return envId;
  const hostname = window.location.hostname;
  const match = hostname.match(/^([^.]+)\.sites\.blink\.new$/);
  if (match) return match[1];
  return 'gelateria-amelie-pwa-dqkgydbb';
}

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <ErrorBoundary>
        <BlinkProvider 
          projectId={getProjectId()}
          publishableKey={import.meta.env.VITE_BLINK_PUBLISHABLE_KEY || 'blnk_pk_ab23174c'}
        >
          <BlinkAuthProvider>
            <App />
          </BlinkAuthProvider>
        </BlinkProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
}

// Service Worker Registration for PWA
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('Service Worker registration failed:', error);
    });
  });
}
