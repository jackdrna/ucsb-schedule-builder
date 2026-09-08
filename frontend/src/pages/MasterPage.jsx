import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { fetchAllCourses, fetchPrograms, loadErrorMessage } from '../utils/api';
import CourseCard from '../components/CourseCard';
import Help from '../components/HelpDialog';
// The directory filters on published offerings, and UCSB publishes none for Summer,
// so a Summer option here would always come back empty.
import { CORE_QUARTERS } from '../utils/validation';
import './MasterPage.css';

const SUBJECT_ORDER = ['ECE', 'CMPSC', 'MATH', 'PHYS', 'CHEM', 'ENGR', 'PSTAT', 'ME', 'WRIT'];

const ALL_COURSES = { id: 'all', label: 'All courses', codes: null, note: null };

/**
 * Every course code named anywhere in a program's requirement trees.
 *
 * Alternatives are included, so 'CHEM 1A or 2A or ECE 6' contributes all three:
 * the point of the mode is to show what the degree can be built from, not to pick
 * a branch on the student's behalf.
 */
function requiredCodes(program) {
  const out = new Set();
  const walk = (node) => {
    if (!node) return;
    if (node.t === 'course') out.add(node.code);
    else (node.kids || []).forEach(walk);
  };
  for (const group of program.groups || []) {
    for (const req of group.requirements || []) walk(req.tree);
  }
  return out;
}

/**
 * The mode chips: 'All courses', then a required and an elective list per program.
 * Built from the requirements dataset rather than hardcoded, so a third major
 * appears here the moment it appears in the data.
 */
function buildModes(programs) {
  return [
    ALL_COURSES,
    ...programs.flatMap((p) => {
      const electives = p.electives || {};
      return [
        {
          id: `${p.code}-required`,
          label: `${p.code} required`,
          codes: requiredCodes(p),
          note:
            `Every course named in a ${p.name} requirement, including the ` +
            `alternatives inside an "or". ${p.total_units} units are required for the degree.`,
          source: p.source,
          sourceUrl: p.source_url,
        },
        {
          id: `${p.code}-electives`,
          label: `${p.code} electives`,
          codes: new Set(electives.codes || []),
          note: [
            `${electives.name || 'Electives'}: ${electives.min_units || 0} units minimum.`,
            electives.note,
          ]
            .filter(Boolean)
            .join(' '),
          source: p.source,
          sourceUrl: p.source_url,
        },
      ];
    }),
  ];
}

/**
 * MasterPage -- the course directory. Everything shown here comes from UCSB's
 * own published sources; each card links back to its catalog entry.
 */
function MasterPage() {
  const [courses, setCourses] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState(ALL_COURSES.id);
  const [subject, setSubject] = useState('ECE');
  const [quarter, setQuarter] = useState('Any');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [data, programList] = await Promise.all([fetchAllCourses(), fetchPrograms()]);
        if (!cancelled) {
          setCourses(data);
          setPrograms(programList);
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

  const modes = useMemo(() => buildModes(programs), [programs]);
  const activeMode = useMemo(
    () => modes.find((m) => m.id === mode) || ALL_COURSES,
    [modes, mode]
  );

  // The mode chooses the corpus; subject and quarter are facets within it.
  const inMode = useMemo(
    () => (activeMode.codes ? courses.filter((c) => activeMode.codes.has(c.code)) : courses),
    [courses, activeMode]
  );

  /**
   * Picking a mode clears the subject filter. A requirement list is meant to be
   * read whole, and leaving the default ECE chip on would silently hide the
   * CMPSC half of the CE lists.
   */
  const selectMode = (id) => {
    setMode(id);
    setSubject('All');
  };

  const subjects = useMemo(() => {
    const present = new Set(inMode.map((c) => c.subject));
    const ordered = SUBJECT_ORDER.filter((s) => present.has(s));
    const rest = [...present].filter((s) => !SUBJECT_ORDER.includes(s)).sort();
    return ['All', ...ordered, ...rest];
  }, [inMode]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    const compact = query.replace(/\s+/g, '');
    return inMode.filter((c) => {
      if (subject !== 'All' && c.subject !== subject) return false;
      if (quarter !== 'Any' && !(c.offered_quarters || []).includes(quarter)) return false;
      if (!query) return true;
      return (
        c.code.toLowerCase().replace(/\s+/g, '').includes(compact) ||
        c.title.toLowerCase().includes(query) ||
        (c.description || '').toLowerCase().includes(query)
      );
    });
  }, [inMode, search, subject, quarter]);

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

        {modes.length > 1 && (
          <div className="mode-chips" role="group" aria-label="Course list">
            <span className="control-label">Show</span>
            {modes.map((m) => (
              <button
                key={m.id}
                className={`subject-chip mode-chip ${mode === m.id ? 'active' : ''}`}
                aria-pressed={mode === m.id}
                onClick={() => selectMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}

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
          {visible.length} of {inMode.length}
          {activeMode.codes ? ` in ${activeMode.label}` : ' courses'}
        </span>

        {activeMode.note && (
          <p className="mode-note">
            {activeMode.note}
            {activeMode.source && (
              <>
                {' '}
                <a href={activeMode.sourceUrl} target="_blank" rel="noreferrer">
                  {activeMode.source}
                </a>
              </>
            )}
          </p>
        )}
      </div>

      {loading ? (
        <div className="loading">Loading UCSB course data…</div>
      ) : error ? (
        <div className="warning-banner error">{error}</div>
      ) : visible.length === 0 ? (
        <div className="empty-state">
          <p>
            No courses match those filters
            {activeMode.codes ? ` within ${activeMode.label}` : ''}.
          </p>
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
