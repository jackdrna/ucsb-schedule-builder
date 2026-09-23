import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { fetchAllCourses, fetchPrograms, loadErrorMessage } from '../utils/api';
import TraceCard from '../components/TraceCard';
import PrereqArrows from '../components/PrereqArrows';
import Help from '../components/HelpDialog';
// The directory filters on published offerings, and UCSB publishes none for Summer,
// so a Summer option here would always come back empty.
import { CORE_QUARTERS } from '../utils/validation';
import './MasterPage.css';

const SUBJECT_ORDER = ['ECE', 'CMPSC', 'MATH', 'PHYS', 'CHEM', 'ENGR', 'PSTAT', 'ME', 'WRIT'];

/**
 * How many card columns fit in `width`. The breakpoints and gaps match
 * MasterPage.css: one column on phones, narrower columns and tighter gaps below
 * 1024px. The gaps between columns are wide because arrows run down them.
 */
function columnsFor(width, viewport) {
  if (viewport <= 768) return 1;
  const min = viewport <= 1024 ? 240 : 280;
  const gap = viewport <= 1024 ? 40 : 48;
  return Math.max(1, Math.floor((width + gap) / (min + gap)));
}

const ALL_COURSES = { id: 'all', label: 'All courses', match: null, note: null };

/**
 * General education, straight off the catalog's own tags. Areas B and C are here
 * even though the College of Engineering does not require them, because the tag
 * exists and a course carrying it is a fact about the course, not about a major.
 */
const GE_MODES = [
  { id: 'ge-A1', label: 'A-1', field: 'ge_areas', tags: ['A1'], name: 'Area A-1: English Reading & Composition' },
  { id: 'ge-A2', label: 'A-2', field: 'ge_areas', tags: ['A2'], name: 'Area A-2: English Reading & Composition' },
  { id: 'ge-B', label: 'B', field: 'ge_areas', tags: ['B'], name: 'Area B: Foreign Language' },
  { id: 'ge-C', label: 'C', field: 'ge_areas', tags: ['C'], name: 'Area C: Science, Mathematics & Technology' },
  { id: 'ge-D', label: 'D', field: 'ge_areas', tags: ['D'], name: 'Area D: Social Sciences' },
  { id: 'ge-E', label: 'E', field: 'ge_areas', tags: ['E'], name: 'Area E: Culture and Thought' },
  { id: 'ge-F', label: 'F', field: 'ge_areas', tags: ['F'], name: 'Area F: The Arts' },
  { id: 'ge-G', label: 'G', field: 'ge_areas', tags: ['G'], name: 'Area G: Literature' },
  { id: 'ge-WRT', label: 'Writing', field: 'special_areas', tags: ['WRT'], name: 'Writing requirement' },
  { id: 'ge-ETH', label: 'Ethnicity', field: 'special_areas', tags: ['ETH'], name: 'Ethnicity requirement' },
  { id: 'ge-EUR', label: 'European', field: 'special_areas', tags: ['EUR'], name: 'European Traditions' },
  { id: 'ge-NWC', label: 'World Cultures', field: 'special_areas', tags: ['NWC'], name: 'World Cultures' },
  { id: 'ge-QNT', label: 'Quantitative', field: 'special_areas', tags: ['QNT'], name: 'Quantitative Relationships' },
];

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
 * Every course a prerequisite tree names, and how: `oneOf` when it is only one
 * alternative inside an "or", `concurrent` when it may be taken the same
 * quarter. A course named more than once takes its strictest reading, so a
 * course required outright is never drawn as merely one option.
 */
function treeCodes(tree) {
  const out = new Map();
  const walk = (node, oneOf) => {
    if (!node) return;
    if (node.t === 'course') {
      const was = out.get(node.code);
      out.set(node.code, {
        oneOf: oneOf && (!was || was.oneOf),
        concurrent: node.concurrent && (!was || was.concurrent),
      });
    } else {
      (node.kids || []).forEach((kid) => walk(kid, oneOf || node.t === 'or'));
    }
  };
  walk(tree, false);
  return out;
}

/** The arrow style for a prerequisite, from how its course's tree names it. */
function prereqRelation({ oneOf, concurrent }) {
  if (oneOf && concurrent) return 'concurrent-one-of';
  if (oneOf) return 'one-of';
  if (concurrent) return 'concurrent';
  return 'prereq';
}

/** The key shown while a course is traced, one entry per arrow style. */
const ARROW_KEY = [
  ['prereq', 'Required'],
  ['one-of', 'One of'],
  ['concurrent', 'Required, may be concurrent'],
  ['concurrent-one-of', 'One of, may be concurrent'],
  ['dependent', 'Unlocks'],
];

/**
 * The mode chips.
 *
 * Two families, and they select differently. A degree list is a set of course
 * codes transcribed from the GEAR; a general education area is a tag the catalog
 * puts on the course itself. Both reduce to a predicate, so the page does not care
 * which is which.
 *
 * Built from the datasets rather than hardcoded, so a third major appears here the
 * moment it appears in the data.
 */
function buildModes(programs) {
  const degree = programs.flatMap((p) => {
    const electives = p.electives || {};
    const required = requiredCodes(p);
    const electiveCodes = new Set(electives.codes || []);
    return [
      {
        id: `${p.code}-required`,
        label: `${p.code} required`,
        family: 'degree',
        match: (c) => required.has(c.code),
        note:
          `Every course named in a ${p.name} requirement, including the ` +
          `alternatives inside an "or". ${p.total_units} units are required for the degree.`,
        source: p.source,
        sourceUrl: p.source_url,
      },
      {
        id: `${p.code}-electives`,
        label: `${p.code} electives`,
        family: 'degree',
        match: (c) => electiveCodes.has(c.code),
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
  });

  // Every program carries the same College of Engineering GE block; cite the first.
  const geSpec = programs.find((p) => p.general_education)?.general_education;
  const ge = GE_MODES.map((m) => ({
    id: m.id,
    label: m.label,
    family: 'ge',
    match: (c) => (c[m.field] || []).some((t) => m.tags.includes(t)),
    note:
      `${m.name}. Courses are tagged by the UCSB General Catalog itself, which is ` +
      `the same tagging the registrar's GE search reads.`,
    source: geSpec?.source,
    sourceUrl: geSpec?.source_url,
  }));

  return [ALL_COURSES, ...degree, ...ge];
}

/**
 * MasterPage -- the course directory, with prerequisite tracing across its cards.
 * Everything shown here comes from UCSB's own published sources; the detail
 * panel links each course back to its catalog entry.
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
  // Clicking a course traces it until it is clicked again or released.
  const [pinnedCode, setPinnedCode] = useState(null);
  const canvasRef = useRef(null);
  const mainRef = useRef(null);
  const [columnCount, setColumnCount] = useState(1);

  // Track how many card columns fit; the directory lays
  // cards out in columns rather than rows, so it has to know the count itself.
  useLayoutEffect(() => {
    const main = mainRef.current;
    if (!main) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      setColumnCount(columnsFor(entry.contentRect.width, window.innerWidth));
    });
    observer.observe(main);
    return () => observer.disconnect();
  }, []);

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
    () => (activeMode.match ? courses.filter(activeMode.match) : courses),
    [courses, activeMode]
  );

  /**
   * Picking a mode clears the subject filter. A requirement list is meant to be
   * read whole, and leaving the default ECE chip on would silently hide the
   * CMPSC half of the CE lists.
   */
  const selectMode = (id) => {
    setMode(mode === id ? ALL_COURSES.id : id);   // clicking the active chip clears it
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

  const visibleCodes = useMemo(() => new Set(visible.map((c) => c.code)), [visible]);

  // Deal the cards out left to right, so the list still reads across the page
  // while each column stacks without waiting on its neighbours' heights.
  const columns = useMemo(() => {
    const out = Array.from({ length: columnCount }, () => []);
    visible.forEach((course, i) => out[i % columnCount].push(course));
    return out;
  }, [visible, columnCount]);

  /**
   * Prerequisite tracing: one step each way from the traced course, back to the
   * courses it names directly and forward to the courses that name it.
   */
  const directPrereqs = useMemo(() => {
    const map = new Map();
    for (const c of courses) map.set(c.code, treeCodes(c.prereq_tree));
    return map;
  }, [courses]);

  const requiredBy = useMemo(() => {
    const map = new Map();
    for (const [code, prereqs] of directPrereqs) {
      for (const p of prereqs.keys()) {
        if (!map.has(p)) map.set(p, new Set());
        map.get(p).add(code);
      }
    }
    return map;
  }, [directPrereqs]);

  // A traced course the filters have since hidden is let go.
  const activeCode = pinnedCode && visibleCodes.has(pinnedCode) ? pinnedCode : null;

  const trace = useMemo(() => {
    if (!activeCode) return null;
    const known = (code) => code !== activeCode && directPrereqs.has(code) && visibleCodes.has(code);
    const named = directPrereqs.get(activeCode) || new Map();
    const prereqs = new Map([...named].filter(([code]) => known(code)));
    // A course that is both (a corequisite pair) is drawn once, as a prerequisite.
    const dependents = [...(requiredBy.get(activeCode) || [])]
      .filter((code) => known(code) && !prereqs.has(code))
      .sort();
    return { code: activeCode, prereqs, dependents };
  }, [activeCode, directPrereqs, requiredBy, visibleCodes]);

  const arrowEdges = useMemo(() => {
    if (!trace) return [];
    return [
      ...[...trace.prereqs].map(([code, how]) => ({
        id: `p:${code}`,
        from: code,
        to: trace.code,
        relation: prereqRelation(how),
      })),
      ...trace.dependents.map((code) => ({ id: `d:${code}`, from: trace.code, to: code, relation: 'dependent' })),
    ];
  }, [trace]);

  const relationOf = (code) => {
    if (!trace) return null;
    if (code === trace.code) return 'self';
    if (trace.prereqs.has(code)) return 'pre';
    if (trace.dependents.includes(code)) return 'dep';
    return null;
  };

  const togglePin = (code) => setPinnedCode((cur) => (cur === code ? null : code));

  useEffect(() => {
    if (!activeCode) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setPinnedCode(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeCode]);

  // One set of listeners on the canvas rather than one per card.
  const codeAt = (e) => e.target.closest?.('.trace-card')?.dataset.code;
  const canvasHandlers = {
    onClick: (e) => {
      // The catalog link inside a card should still just be a link.
      if (e.target.closest('a')) return;
      const code = codeAt(e);
      if (code) togglePin(code);
      else setPinnedCode(null);
    },
    onKeyDown: (e) => {
      // Only the card itself, not the catalog link inside it.
      const code = e.target.classList?.contains('trace-card') && e.target.dataset.code;
      if (code && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        togglePin(code);
      }
    },
  };

  return (
    <div className="master-page">
      <nav className="master-nav-notch">
        <Link to="/" className="active">
          Course Directory
        </Link>
        <Link to="/schedule-builder">Build Schedule</Link>
      </nav>

      <div ref={mainRef}>
        <header className="directory-header">
          <h1>UCSB Electrical &amp; Computer Engineering courses</h1>
          <p className="directory-subtitle">
            Click any course to see its prerequisites and what it unlocks; click it again, click
            empty space or press Esc to clear. Prerequisites from the{' '}
            <a href="https://catalog.ucsb.edu/departments/ECE/courses" target="_blank" rel="noreferrer">
              UCSB General Catalog
            </a>
            , ECE offerings from the{' '}
            <a href="https://www.ece.ucsb.edu/undergrad/courses" target="_blank" rel="noreferrer">
              department&rsquo;s 2026&ndash;27 grid
            </a>
            , others from the{' '}
            <a
              href="https://my.sa.ucsb.edu/public/curriculum/coursesearch.aspx"
              target="_blank"
              rel="noreferrer"
            >
              Schedule of Classes
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
            <>
              <div className="mode-chips" role="group" aria-label="Course list">
                <span className="control-label">Show</span>
                {modes
                  .filter((m) => m.family !== 'ge')
                  .map((m) => (
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

              <div className="mode-chips" role="group" aria-label="General education area">
                <span className="control-label">G.E.</span>
                {modes
                  .filter((m) => m.family === 'ge')
                  .map((m) => (
                    <button
                      key={m.id}
                      className={`subject-chip mode-chip ${mode === m.id ? 'active' : ''}`}
                      aria-pressed={mode === m.id}
                      title={m.note}
                      onClick={() => selectMode(m.id)}
                    >
                      {m.label}
                    </button>
                  ))}
              </div>
            </>
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
            {activeMode.match ? ` in ${activeMode.label}` : ' courses'}
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
              {activeMode.match ? ` within ${activeMode.label}` : ''}.
            </p>
          </div>
        ) : (
          <>
            {/* Clicks pass through, so a faded course can still be picked next. */}
            {trace && <div className="trace-tint" aria-hidden="true" />}
            {trace && arrowEdges.length > 0 && (
              <ul className="arrow-key" aria-label="Arrow key">
                {ARROW_KEY.filter(([kind]) => arrowEdges.some((e) => e.relation === kind)).map(
                  ([kind, label]) => (
                    <li key={kind}>
                      <svg className={`prereq-arrow ${kind}`} viewBox="0 0 36 12" aria-hidden="true">
                        <line className="arrow-line" x1="2" y1="6" x2="26" y2="6" />
                        <polygon className="arrow-head" points="35,6 25,0.5 25,11.5" />
                      </svg>
                      {label}
                    </li>
                  )
                )}
              </ul>
            )}
            <div className="courses-container" ref={canvasRef} {...canvasHandlers}>
              {columns.map((column, i) => (
                <div className="course-column" key={i}>
                  {column.map((course) => (
                    <TraceCard
                      key={course.code}
                      course={course}
                      relation={relationOf(course.code)}
                    />
                  ))}
                </div>
              ))}
              <PrereqArrows containerRef={canvasRef} edges={arrowEdges} layoutKey={columns} />
            </div>
          </>
        )}
      </div>

      <Help />
    </div>
  );
}

export default MasterPage;
