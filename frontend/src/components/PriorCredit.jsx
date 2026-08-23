import React, { useMemo, useState } from 'react';
import './PriorCredit.css';

/**
 * PriorCredit
 *
 * Manages the two per-student overrides the catalog cannot express:
 *
 *   prior credit    a course already completed (AP or exam credit, transfer work,
 *                   community college, or taken before this plan starts)
 *   waived prereqs  a course whose prerequisites should not be enforced
 *
 * @param {Array}    courses        every course, for the picker
 * @param {Set}      priorCredit    codes already completed
 * @param {Set}      prereqWaivers  codes whose prerequisites are waived
 * @param {Function} onToggleCredit
 * @param {Function} onToggleWaiver
 */
function PriorCredit({ courses, priorCredit, prereqWaivers, onToggleCredit, onToggleWaiver }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('credit');
  const [query, setQuery] = useState('');

  const active = mode === 'credit' ? priorCredit : prereqWaivers;
  const toggle = mode === 'credit' ? onToggleCredit : onToggleWaiver;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const compact = q.replace(/\s+/g, '');
    return courses
      .filter(
        (c) =>
          !active.has(c.code) &&
          (c.code.toLowerCase().replace(/\s+/g, '').includes(compact) ||
            c.title.toLowerCase().includes(q))
      )
      .slice(0, 8);
  }, [courses, query, active]);

  // Only courses that actually have prerequisites can meaningfully be waived.
  const waivable = (code) => {
    const c = courses.find((x) => x.code === code);
    return !c || !!c.prereq_tree;
  };

  const total = priorCredit.size + prereqWaivers.size;

  return (
    <section className="credit-panel">
      <div className="credit-head">
        <button className="credit-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="credit-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
          Prior credit &amp; waivers
        </button>

        <div className="credit-summary">
          {priorCredit.size > 0 && (
            <span className="credit-pill credit">
              <strong>{priorCredit.size}</strong> with credit
            </span>
          )}
          {prereqWaivers.size > 0 && (
            <span className="credit-pill waiver">
              <strong>{prereqWaivers.size}</strong> waived
            </span>
          )}
          {total === 0 && (
            <span className="credit-hint">
              Already taken something, or have an exception? Add it here.
            </span>
          )}
        </div>
      </div>

      {open && (
        <div className="credit-body">
          <div className="credit-tabs">
            <button
              className={`subject-chip ${mode === 'credit' ? 'active' : ''}`}
              onClick={() => { setMode('credit'); setQuery(''); }}
            >
              Already have credit
            </button>
            <button
              className={`subject-chip ${mode === 'waiver' ? 'active' : ''}`}
              onClick={() => { setMode('waiver'); setQuery(''); }}
            >
              Waive prerequisites
            </button>
          </div>

          <p className="credit-explain">
            {mode === 'credit' ? (
              <>
                Courses you have already completed — AP or exam credit, transfer work, or
                taken before this plan. They satisfy prerequisites anywhere and count
                towards the degree, without using a slot in the grid.
              </>
            ) : (
              <>
                Courses whose prerequisites should not be enforced, for a placement test
                or a departmental exception. The quarter check still applies. Waived
                courses stay flagged in amber so the exception remains visible.
              </>
            )}
          </p>

          <div className="credit-search-wrap">
            <input
              type="search"
              className="credit-search"
              placeholder={mode === 'credit' ? 'Add a course you have credit for…' : 'Add a course to waive…'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {matches.length > 0 && (
              <ul className="credit-matches">
                {matches.map((c) => {
                  const allowed = mode === 'credit' || waivable(c.code);
                  return (
                    <li key={c.code}>
                      <button
                        className="credit-match"
                        disabled={!allowed}
                        title={allowed ? undefined : `${c.code} has no prerequisites to waive`}
                        onClick={() => { toggle(c.code); setQuery(''); }}
                      >
                        <span className="credit-match-code">{c.code}</span>
                        <span className="credit-match-title">{c.title}</span>
                        {!allowed && <span className="credit-match-note">no prerequisites</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {active.size === 0 ? (
            <p className="credit-empty">
              {mode === 'credit' ? 'No prior credit recorded.' : 'No waivers recorded.'}
            </p>
          ) : (
            <ul className="credit-chips">
              {[...active].sort().map((code) => (
                <li key={code}>
                  <span className={`credit-chip ${mode}`}>
                    {code}
                    <button
                      className="credit-chip-remove"
                      onClick={() => toggle(code)}
                      title={`Remove ${code}`}
                      aria-label={`Remove ${code}`}
                    >
                      ×
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

export default PriorCredit;
