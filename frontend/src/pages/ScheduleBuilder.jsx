import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { fetchAllCourses, fetchPrograms, loadErrorMessage } from '../utils/api';
import {
  QUARTERS,
  CORE_QUARTERS,
  SUMMER_QUARTER,
  YEARS,
  SLOTS_PER_QUARTER,
  termKey,
  termLabel,
  emptySchedule,
  validatePlacement,
  validatePlan,
  auditDegree,
  totalUnits,
} from '../utils/validation';
import CourseCard from '../components/CourseCard';
import BottomDock from '../components/BottomDock';
import DegreeProgress from '../components/DegreeProgress';
import PlanCheck from '../components/PlanCheck';
import PriorCredit from '../components/PriorCredit';
import Help from '../components/HelpDialog';
import './ScheduleBuilder.css';

const SIDEBAR_ID = 'sidebar-courses';
const STORAGE_KEY = 'ucsb-schedule-plan-v1';
const MAJOR_KEY = 'ucsb-schedule-major-v1';
const CREDIT_KEY = 'ucsb-schedule-credit-v1';
const WAIVER_KEY = 'ucsb-schedule-waivers-v1';
const DOCK_KEY = 'ucsb-schedule-dock-v1';
const SUMMER_KEY = 'ucsb-schedule-summer-v1';
const SUBJECT_FILTERS = ['All', 'ECE', 'CMPSC', 'MATH', 'PHYS', 'CHEM', 'Other'];

/** Version stamped into saved plan files, so a future format change can migrate. */
const PLAN_FILE_VERSION = 1;

/** Read a saved array of course codes. */
function loadCodes(key) {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

/**
 * Turn `{ 'Y1-Fall': ['ECE 10A', ...] }` into a schedule of course rows.
 *
 * Codes are matched against the live course list, so a course UCSB has retired
 * since the plan was written drops out rather than becoming a broken card. Terms
 * are capped at SLOTS_PER_QUARTER, since a hand-edited file could overfill one.
 *
 * -> { schedule, dropped: [codes the catalog no longer has] }
 */
function hydratePlan(saved, courses) {
  const byCode = new Map(courses.map((c) => [c.code, c]));
  const schedule = emptySchedule();
  const dropped = [];
  for (const [key, codes] of Object.entries(saved || {})) {
    if (!(key in schedule) || !Array.isArray(codes)) continue;
    for (const code of codes) {
      const course = byCode.get(code);
      if (!course) dropped.push(code);
      else if (schedule[key].length < SLOTS_PER_QUARTER) schedule[key].push(course);
    }
  }
  return { schedule, dropped };
}

/** Restore the plan held in localStorage. */
function loadSavedPlan(courses) {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptySchedule();
    return hydratePlan(JSON.parse(raw), courses).schedule;
  } catch {
    return emptySchedule();
  }
}

/** Every course sitting in a Summer term. */
function summerCourses(schedule) {
  return YEARS.flatMap((y) => schedule[termKey(y, SUMMER_QUARTER)] || []);
}

function ScheduleBuilder() {
  const [courses, setCourses] = useState([]);
  const [schedule, setSchedule] = useState(emptySchedule);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('All');
  const [restored, setRestored] = useState(false);
  const [programs, setPrograms] = useState([]);
  const [major, setMajor] = useState(
    () => window.localStorage.getItem(MAJOR_KEY) || 'EE'
  );
  const [priorCredit, setPriorCredit] = useState(() => loadCodes(CREDIT_KEY));
  const [prereqWaivers, setPrereqWaivers] = useState(() => loadCodes(WAIVER_KEY));
  const [dockCollapsed, setDockCollapsed] = useState(
    () => window.localStorage.getItem(DOCK_KEY) === 'collapsed'
  );
  const [summerOpen, setSummerOpen] = useState(
    () => window.localStorage.getItem(SUMMER_KEY) === 'expanded'
  );
  const fileInputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [data, programList] = await Promise.all([fetchAllCourses(), fetchPrograms()]);
        if (cancelled) return;
        setCourses(data);
        setPrograms(programList);
        // A restored plan may already use Summer; show the column rather than
        // hiding courses that still count towards the totals.
        const restoredPlan = loadSavedPlan(data);
        setSchedule(restoredPlan);
        if (summerCourses(restoredPlan).length > 0) setSummerOpen(true);
        setRestored(true);
        setError(null);
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

  useEffect(() => {
    window.localStorage.setItem(MAJOR_KEY, major);
  }, [major]);

  useEffect(() => {
    window.localStorage.setItem(CREDIT_KEY, JSON.stringify([...priorCredit]));
  }, [priorCredit]);

  useEffect(() => {
    window.localStorage.setItem(WAIVER_KEY, JSON.stringify([...prereqWaivers]));
  }, [prereqWaivers]);

  useEffect(() => {
    window.localStorage.setItem(DOCK_KEY, dockCollapsed ? 'collapsed' : 'expanded');
  }, [dockCollapsed]);

  useEffect(() => {
    window.localStorage.setItem(SUMMER_KEY, summerOpen ? 'expanded' : 'collapsed');
  }, [summerOpen]);

  /** Add or remove a code from a Set held in state. */
  const toggleIn = (setter) => (code) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  const toggleCredit = useCallback((code) => {
    // A course cannot be both credited and scheduled, so drop it from the plan.
    setSchedule((prev) => {
      if (!Object.values(prev).some((list) => list.some((c) => c.code === code))) return prev;
      return Object.fromEntries(
        Object.entries(prev).map(([k, list]) => [k, list.filter((c) => c.code !== code)])
      );
    });
    toggleIn(setPriorCredit)(code);
  }, []);

  const toggleWaiver = useCallback(toggleIn(setPrereqWaivers), []);

  // Persist the plan by course code, so it survives a data refresh.
  useEffect(() => {
    if (!restored) return;
    const codes = Object.fromEntries(
      Object.entries(schedule).map(([key, list]) => [key, list.map((c) => c.code)])
    );
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(codes));
  }, [schedule, restored]);

  const catalog = useMemo(() => new Map(courses.map((c) => [c.code, c])), [courses]);

  // Every placement is re-checked whenever the plan changes, so moving or
  // removing a course surfaces problems in the courses that depend on it.
  const overrides = useMemo(
    () => ({ priorCredit, prereqWaivers }),
    [priorCredit, prereqWaivers]
  );

  const report = useMemo(
    () => validatePlan(schedule, catalog, overrides),
    [schedule, catalog, overrides]
  );

  const audit = useMemo(() => {
    const program = programs.find((p) => p.code === major);
    return program ? auditDegree(schedule, program, { catalog, priorCredit }) : null;
  }, [schedule, programs, major, catalog, priorCredit]);

  const scheduledCodes = useMemo(
    () => new Set(Object.values(schedule).flatMap((list) => list.map((c) => c.code))),
    [schedule]
  );

  const availableCourses = useMemo(() => {
    const query = search.trim().toLowerCase();
    const compact = query.replace(/\s+/g, '');
    return courses.filter((c) => {
      if (scheduledCodes.has(c.code)) return false;
      if (priorCredit.has(c.code)) return false;   // already done, needs no slot
      if (subject === 'ECE' || subject === 'CMPSC') {
        if (c.subject !== subject) return false;
      } else if (subject === 'MATH' || subject === 'PHYS' || subject === 'CHEM') {
        if (c.subject !== subject) return false;
      } else if (subject === 'Other') {
        if (['ECE', 'CMPSC', 'MATH', 'PHYS', 'CHEM'].includes(c.subject)) return false;
      }
      if (!query) return true;
      return (
        c.code.toLowerCase().replace(/\s+/g, '').includes(compact) ||
        c.title.toLowerCase().includes(query)
      );
    });
  }, [courses, scheduledCodes, priorCredit, search, subject]);

  const handleDragEnd = useCallback(
    (result) => {
      const { source, destination, draggableId } = result;
      if (!destination) return;

      const code = draggableId.replace(/^course:/, '');
      const course = catalog.get(code);
      if (!course) return;

      // Dropping back into the sidebar removes the course from the plan.
      if (destination.droppableId === SIDEBAR_ID) {
        if (source.droppableId === SIDEBAR_ID) return;
        setSchedule((prev) => ({
          ...prev,
          [source.droppableId]: prev[source.droppableId].filter((c) => c.code !== code),
        }));
        setNotice(null);
        return;
      }

      if (destination.droppableId === source.droppableId) return;

      // Validate against the plan the course is leaving, so a move within the
      // plan is not blocked by the course's own current placement.
      const base =
        source.droppableId === SIDEBAR_ID
          ? schedule
          : {
              ...schedule,
              [source.droppableId]: schedule[source.droppableId].filter((c) => c.code !== code),
            };

      const check = validatePlacement(
        course, destination.droppableId, base, catalog, overrides
      );
      if (!check.allowed) {
        // Offer a one-click waiver, but only when waiving would actually let the
        // drop through -- a course refused for its quarter is not a prerequisite
        // problem, and a waiver would not move it.
        const waived = validatePlacement(course, destination.droppableId, base, catalog, {
          ...overrides,
          prereqWaivers: new Set(prereqWaivers).add(code),
        });
        setNotice({
          status: 'error',
          message: check.message,
          waive: waived.allowed
            ? { code, term: destination.droppableId, from: source.droppableId }
            : null,
        });
        return;
      }
      setNotice(check.status === 'warning' ? { status: 'warning', message: check.message } : null);

      setSchedule({
        ...base,
        [destination.droppableId]: [...base[destination.droppableId], course],
      });
    },
    [catalog, schedule, overrides, prereqWaivers]
  );

  /**
   * Take the waiver the refused drop offered: record it, then complete the drop.
   * The plan is re-read here rather than captured at refusal time, so a waiver
   * accepted after other edits still lands against the current plan.
   */
  const acceptWaiver = useCallback(() => {
    if (!notice?.waive) return;
    const { code, term, from } = notice.waive;
    const course = catalog.get(code);
    if (!course) return;

    const base =
      from === SIDEBAR_ID
        ? schedule
        : { ...schedule, [from]: (schedule[from] || []).filter((c) => c.code !== code) };

    const nextWaivers = new Set(prereqWaivers).add(code);
    const check = validatePlacement(course, term, base, catalog, {
      priorCredit,
      prereqWaivers: nextWaivers,
    });
    if (!check.allowed) {
      setNotice({ status: 'error', message: check.message });
      return;
    }

    setPrereqWaivers(nextWaivers);
    setSchedule({ ...base, [term]: [...base[term], course] });
    setNotice({
      status: 'info',
      message:
        `Prerequisites for ${code} are now waived, and it is placed in ` +
        `${termLabel(term)}. Undo this under Prior credit & waivers.`,
    });
  }, [notice, catalog, schedule, prereqWaivers, priorCredit]);

  const removeCourse = (key, code) => {
    setSchedule((prev) => ({ ...prev, [key]: prev[key].filter((c) => c.code !== code) }));
    setNotice(null);
  };

  const clearPlan = () => {
    if (!window.confirm('Remove every course from your plan?')) return;
    setSchedule(emptySchedule());
    setNotice(null);
  };

  /**
   * Collapsing Summer would hide courses that still count towards the totals and
   * still satisfy prerequisites, so the courses come out with the column.
   */
  const toggleSummer = () => {
    if (summerOpen) {
      const inSummer = summerCourses(schedule);
      if (inSummer.length > 0) {
        const list = inSummer.map((c) => c.code).join(', ');
        if (
          !window.confirm(
            `Hiding Summer removes ${inSummer.length} course${inSummer.length === 1 ? '' : 's'} ` +
              `from your plan (${list}). Continue?`
          )
        ) {
          return;
        }
        setSchedule((prev) => ({
          ...prev,
          ...Object.fromEntries(YEARS.map((y) => [termKey(y, SUMMER_QUARTER), []])),
        }));
      }
      setNotice(null);
    }
    setSummerOpen((v) => !v);
  };

  /* ------------------------------------------------------------ save and load */

  const savePlan = () => {
    const payload = {
      version: PLAN_FILE_VERSION,
      savedAt: new Date().toISOString(),
      major,
      plan: Object.fromEntries(
        Object.entries(schedule).map(([key, list]) => [key, list.map((c) => c.code)])
      ),
      priorCredit: [...priorCredit],
      prereqWaivers: [...prereqWaivers],
    };

    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `ucsb-plan-${payload.savedAt.slice(0, 10)}.json`;
    // The link has to be in the document for the click to count, and the URL has
    // to outlive the click -- revoking it inline can cancel the download.
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const loadPlanFile = async (file) => {
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      setNotice({ status: 'error', message: `${file.name} is not valid JSON.` });
      return;
    }
    if (!data || typeof data.plan !== 'object' || data.plan === null) {
      setNotice({
        status: 'error',
        message: `${file.name} does not look like a saved plan — no "plan" section.`,
      });
      return;
    }

    const credit = new Set(Array.isArray(data.priorCredit) ? data.priorCredit : []);
    const { schedule: loaded, dropped } = hydratePlan(data.plan, courses);

    // Credit and a scheduled slot are mutually exclusive, so a file claiming both
    // keeps the credit and gives up the slot.
    const conflicts = [];
    for (const [key, list] of Object.entries(loaded)) {
      const kept = list.filter((c) => !credit.has(c.code));
      if (kept.length !== list.length) {
        list.filter((c) => credit.has(c.code)).forEach((c) => conflicts.push(c.code));
        loaded[key] = kept;
      }
    }

    setSchedule(loaded);
    setPriorCredit(credit);
    setPrereqWaivers(new Set(Array.isArray(data.prereqWaivers) ? data.prereqWaivers : []));
    if (data.major === 'EE' || data.major === 'CE') setMajor(data.major);
    if (summerCourses(loaded).length > 0) setSummerOpen(true);

    const notes = [];
    if (dropped.length) {
      notes.push(`${dropped.join(', ')} ${dropped.length === 1 ? 'is' : 'are'} no longer in the catalog`);
    }
    if (conflicts.length) {
      notes.push(`${conflicts.join(', ')} already had credit, so ${conflicts.length === 1 ? 'it was' : 'they were'} not scheduled`);
    }
    setNotice({
      status: notes.length ? 'warning' : 'info',
      message: `Loaded ${file.name}.${notes.length ? ` ${notes.join('; ')}.` : ''}`,
    });
  };

  if (loading) {
    return (
      <div className="schedule-builder">
        <div className="loading">Loading UCSB course data…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="schedule-builder">
        <div className="warning-banner error">{error}</div>
      </div>
    );
  }

  const planUnits = totalUnits(Object.values(schedule).flat());
  const visibleQuarters = summerOpen ? QUARTERS : CORE_QUARTERS;

  return (
    <div className="schedule-builder">
      <nav className="schedule-nav-notch">
        <Link to="/">Course Directory</Link>
        <Link to="/schedule-builder" className="active">
          Build Schedule
        </Link>
      </nav>

      <div className="plan-status">
        <div className="plan-stats">
          <span className="plan-stat">
            <strong>{scheduledCodes.size}</strong> courses
          </span>
          <span className="plan-stat">
            <strong>{planUnits}</strong> units
          </span>
          <span className={`plan-stat ${report.errors.length ? 'bad' : 'good'}`}>
            <strong>{report.errors.length}</strong> problems
          </span>
          {report.warnings.length > 0 && (
            <span className="plan-stat warn">
              <strong>{report.warnings.length}</strong> to verify
            </span>
          )}
        </div>

        {/* The floating nav notch hovers over the middle of this bar; this holds
            that space open so no control ends up underneath it. */}
        <span className="notch-spacer" aria-hidden="true" />

        <div className="plan-actions">
          <button
            className={`plan-summer-toggle ${summerOpen ? 'open' : ''}`}
            onClick={toggleSummer}
            aria-expanded={summerOpen}
            title={
              summerOpen
                ? 'Hide the Summer column'
                : 'Show a Summer column in every year'
            }
          >
            <span className="summer-caret" aria-hidden="true">{summerOpen ? '▾' : '▸'}</span>
            Summer
          </button>

          <button className="plan-btn" onClick={savePlan} title="Download this plan as a file">
            Save plan
          </button>
          <button
            className="plan-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Load a plan file saved earlier"
          >
            Load plan
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              loadPlanFile(e.target.files?.[0]);
              e.target.value = '';   // so the same file can be picked twice
            }}
          />
          <button className="plan-clear" onClick={clearPlan} disabled={scheduledCodes.size === 0}>
            Clear plan
          </button>
        </div>
      </div>

      {notice && (
        <div className={`drop-notice ${notice.status}`}>
          <span>
            {notice.message}
            {notice.waive && (
              <button className="notice-waive" onClick={acceptWaiver}>
                Waive these prereqs?
              </button>
            )}
          </span>
          <button className="close-btn" onClick={() => setNotice(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      <div className="schedule-layout">
        <DragDropContext onDragEnd={handleDragEnd}>
          <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
            <div className="sidebar-header">
              <h2>{sidebarOpen ? 'Available Courses' : ''}</h2>
              <button
                className="toggle-btn"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                title={sidebarOpen ? 'Collapse' : 'Expand'}
              >
                {sidebarOpen ? '◀' : '▶'}
              </button>
            </div>

            {sidebarOpen && (
              <>
                <div className="sidebar-filters">
                  <input
                    type="search"
                    className="course-search"
                    placeholder="Search code or title…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <div className="subject-chips">
                    {SUBJECT_FILTERS.map((s) => (
                      <button
                        key={s}
                        className={`subject-chip ${subject === s ? 'active' : ''}`}
                        onClick={() => setSubject(s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <span className="result-count">{availableCourses.length} courses</span>
                </div>

                <Droppable droppableId={SIDEBAR_ID} type="COURSE">
                  {(provided, snapshot) => (
                    <div
                      className={`sidebar-content ${snapshot.isDraggingOver ? 'dragging-over' : ''}`}
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                    >
                      {availableCourses.length === 0 ? (
                        <p className="empty-message">No courses match.</p>
                      ) : (
                        availableCourses.map((course, index) => (
                          <Draggable
                            key={course.code}
                            draggableId={`course:${course.code}`}
                            index={index}
                          >
                            {(dragProvided, dragSnapshot) => (
                              <div
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                {...dragProvided.dragHandleProps}
                                style={{
                                  ...dragProvided.draggableProps.style,
                                  opacity: dragSnapshot.isDragging ? 0.85 : 1,
                                  ...(dragSnapshot.isDropAnimating
                                    ? { transitionDuration: '0.001s' }
                                    : {}),
                                }}
                              >
                                <CourseCard course={course} isDraggable />
                              </div>
                            )}
                          </Draggable>
                        ))
                      )}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </>
            )}
          </aside>

          <main className={`schedule-grid ${summerOpen ? 'summer-open' : ''}`}>
            {YEARS.map((year) => {
              const yearCourses = QUARTERS.flatMap((q) => schedule[termKey(year, q)]);
              return (
                <section key={year} className="year-section">
                  <header className="year-header">
                    <h2>Year {year}</h2>
                    <span className="year-units">{totalUnits(yearCourses)} units</span>
                  </header>

                  <div className="year-quarters">
                    {visibleQuarters.map((quarter) => {
                      const key = termKey(year, quarter);
                      const placed = schedule[key];
                      return (
                        <Droppable key={key} droppableId={key} type="COURSE">
                          {(provided, snapshot) => (
                            <div
                              className={`quarter-column ${
                                quarter === SUMMER_QUARTER ? 'summer' : ''
                              } ${snapshot.isDraggingOver ? 'dragging-over' : ''}`}
                              ref={provided.innerRef}
                              {...provided.droppableProps}
                            >
                              <div className="quarter-head">
                                <span className="quarter-title">{quarter}</span>
                                <span className="quarter-units">{totalUnits(placed)}u</span>
                              </div>

                              {placed.map((course, index) => (
                                <Draggable
                                  key={course.code}
                                  draggableId={`course:${course.code}`}
                                  index={index}
                                >
                                  {(dragProvided, dragSnapshot) => (
                                    <div
                                      ref={dragProvided.innerRef}
                                      {...dragProvided.draggableProps}
                                      {...dragProvided.dragHandleProps}
                                      className="quarter-slot filled"
                                      style={{
                                        ...dragProvided.draggableProps.style,
                                        ...(dragSnapshot.isDropAnimating
                                          ? { transitionDuration: '0.001s' }
                                          : {}),
                                      }}
                                    >
                                      <button
                                        className="remove-btn"
                                        onClick={() => removeCourse(key, course.code)}
                                        title={`Remove ${course.code}`}
                                      >
                                        <svg
                                          width="12"
                                          height="12"
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="3"
                                          strokeLinecap="round"
                                        >
                                          <line x1="18" y1="6" x2="6" y2="18" />
                                          <line x1="6" y1="6" x2="18" y2="18" />
                                        </svg>
                                      </button>
                                      <CourseCard
                                        course={course}
                                        isDraggable
                                        compact
                                        issue={report.byCode[course.code] || null}
                                      />
                                    </div>
                                  )}
                                </Draggable>
                              ))}

                              {placed.length < SLOTS_PER_QUARTER && (
                                <div className="quarter-slot empty-slot">
                                  <p>{placed.length === 0 ? termLabel(key) : 'Drop course'}</p>
                                </div>
                              )}

                              {provided.placeholder}
                            </div>
                          )}
                        </Droppable>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </main>
        </DragDropContext>

        {/* Inside the layout box, so the button clears the bottom dock. */}
        <Help />
      </div>

      <BottomDock
        collapsed={dockCollapsed}
        onToggle={() => setDockCollapsed((v) => !v)}
        report={report}
        audit={audit}
        overrides={priorCredit.size + prereqWaivers.size}
      >
        <PlanCheck report={report} onWaive={toggleWaiver} />

        {programs.length > 0 && (
          <DegreeProgress
            audit={audit}
            programs={programs}
            selected={major}
            onSelect={setMajor}
          />
        )}

        <PriorCredit
          courses={courses}
          priorCredit={priorCredit}
          prereqWaivers={prereqWaivers}
          onToggleCredit={toggleCredit}
          onToggleWaiver={toggleWaiver}
        />
      </BottomDock>

    </div>
  );
}

export default ScheduleBuilder;
