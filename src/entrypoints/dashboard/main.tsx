import React from 'react';
import ReactDOM from 'react-dom/client';
import { DashboardApp } from './DashboardApp';
import '@/styles/app.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Darb dashboard root was not found.');
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <DashboardApp />
  </React.StrictMode>,
);
