import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { fetchAllCourses, loadErrorMessage } from '../utils/api';
import CourseCard from '../components/CourseCard';
import Help from '../components/HelpDialog';
// The directory filters on published offerings, and UCSB publishes none for Summer,
// so a Summer option here would always come back empty.
import { CORE_QUARTERS } from '../utils/validation';
import './MasterPage.css';

const SUBJECT_ORDER = ['ECE', 'CMPSC', 'MATH', 'PHYS', 'CHEM', 'ENGR', 'PSTAT', 'ME', 'WRIT'];

/**
 * MasterPage -- the course directory. Everything shown here comes from UCSB's
 * own published sources; each card links back to its catalog entry.
 */
function MasterPage() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('ECE');
  const [quarter, setQuarter] = useState('Any');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await fetchAllCourses();
        if (!cancelled) {
          setCourses(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(loadErrorMessage());
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const subjects = useMemo(() => {
    const present = new Set(courses.map((c) => c.subject));
    const ordered = SUBJECT_ORDER.filter((s) => present.has(s));
    const rest = [...present].filter((s) => !SUBJECT_ORDER.includes(s)).sort();
    return ['All', ...ordered, ...rest];
  }, [courses]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    const compact = query.replace(/\s+/g, '');
    return courses.filter((c) => {
      if (subject !== 'All' && c.subject !== subject) return false;
      if (quarter !== 'Any' && !(c.offered_quarters || []).includes(quarter)) return false;
      if (!query) return true;
      return (
        c.code.toLowerCase().replace(/\s+/g, '').includes(compact) ||
        c.title.toLowerCase().includes(query) ||
        (c.description || '').toLowerCase().includes(query)
      );
    });
  }, [courses, search, subject, quarter]);

  return (
    <div className="master-page">
      <nav className="master-nav-notch">
        <Link to="/" className="active">
          Course Directory
        </Link>
        <Link to="/schedule-builder">Build Schedule</Link>
      </nav>

      <header className="directory-header">
        <h1>UCSB Electrical &amp; Computer Engineering courses</h1>
        <p className="directory-subtitle">
          Prerequisites and course details from the{' '}
          <a href="https://catalog.ucsb.edu/departments/ECE/courses" target="_blank" rel="noreferrer">
            UCSB General Catalog
          </a>
          . Quarter offerings for ECE from the{' '}
          <a href="https://www.ece.ucsb.edu/undergrad/courses" target="_blank" rel="noreferrer">
            ECE department&rsquo;s 2026&ndash;27 course grid
          </a>
          , and for other departments from the{' '}
          <a
            href="https://my.sa.ucsb.edu/public/curriculum/coursesearch.aspx"
            target="_blank"
            rel="noreferrer"
          >
            UCSB Schedule of Classes
          </a>
          . Always confirm in GOLD before registering.
        </p>
      </header>

      <div className="directory-controls">
        <input
          type="search"
          className="course-search"
          placeholder="Search code, title or description…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="subject-chips">
          {subjects.map((s) => (
            <button
              key={s}
              className={`subject-chip ${subject === s ? 'active' : ''}`}
              onClick={() => setSubject(s)}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="subject-chips">
          {['Any', ...CORE_QUARTERS].map((q) => (
            <button
              key={q}
              className={`subject-chip ${quarter === q ? 'active' : ''}`}
              onClick={() => setQuarter(q)}
            >
              {q === 'Any' ? 'Any quarter' : q}
            </button>
          ))}
        </div>

        <span className="result-count">
          {visible.length} of {courses.length} courses
        </span>
      </div>

      {loading ? (
        <div className="loading">Loading UCSB course data…</div>
      ) : error ? (
        <div className="warning-banner error">{error}</div>
      ) : visible.length === 0 ? (
        <div className="empty-state">
          <p>No courses match those filters.</p>
        </div>
      ) : (
        <div className="courses-container">
          {visible.map((course) => (
            <CourseCard key={course.code} course={course} showDetail />
          ))}
        </div>
      )}

      <Help />
    </div>
  );
}

export default MasterPage;
