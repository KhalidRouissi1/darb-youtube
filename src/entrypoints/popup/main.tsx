import React from 'react';
import ReactDOM from 'react-dom/client';
import { PopupApp } from './PopupApp';
import '@/styles/app.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Darb popup root was not found.');
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <PopupApp />
  </React.StrictMode>,
);
