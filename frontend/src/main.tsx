import React from 'react'
import ReactDOM from 'react-dom/client'
import './i18n'
import App from './App.tsx'
import './index.css'
import './styles/design-system.css'
import { startHealthMonitoring } from './services/health'

// Accept-Language is set per-request in axios from localStorage — do not
// import setAppLanguage/axios here (causes TDZ / blank screen in production).

// Disable automatic scroll restoration
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

// Handle initial path from session storage
const initialPath = sessionStorage.getItem('path');
if (initialPath && window.location.pathname !== initialPath) {
  window.history.replaceState(null, '', initialPath);
}

// Start API health monitoring
if (import.meta.env.PROD) {
  startHealthMonitoring(60000); // Check every 1 minute in production
} else {
  startHealthMonitoring(300000); // Check every 5 minutes in development
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />
)
