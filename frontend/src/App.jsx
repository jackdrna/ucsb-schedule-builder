import React from 'react';
/*
 * HashRouter, not BrowserRouter. Static hosting (GitHub Pages) has no server to
 * rewrite unknown paths back to index.html, so a visitor opening
 * /schedule-builder directly -- or refreshing on it -- would get a 404. Routing in
 * the fragment keeps deep links and refreshes working from any subdirectory, with
 * no per-host redirect shim. The cost is a `#` in the URL.
 *
 * To move to clean URLs later: swap this for BrowserRouter, set `base` and a
 * matching `basename`, and serve a 404.html copy of index.html.
 */
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import MasterPage from './pages/MasterPage';
import ScheduleBuilder from './pages/ScheduleBuilder';
import './styles/globals.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<MasterPage />} />
        <Route path="/schedule-builder" element={<ScheduleBuilder />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;