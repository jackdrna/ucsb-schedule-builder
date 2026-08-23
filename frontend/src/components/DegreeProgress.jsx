import React, { useState } from 'react';
import './DegreeProgress.css';

/**
 * DegreeProgress
 *
 * Shows how a plan stands against a UCSB major's published requirements: the
 * required-course groups, the approved-elective unit count, and the depth
 * tracks (EE) or senior elective sequences (CE).
 *
 * @param {Object} audit    result of auditDegree()
 * @param {Array}  programs available programs, for the selector
 * @param {string} selected currently selected program code
 * @param {Function} onSelect
 */
function DegreeProgress({ audit, programs, selected, onSelect }) {
  const [open, setOpen] = useState(false);

  const header = (
    <div className="degree-head">
      <button
        className="degree-toggle"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="degree-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
        Degree progress
      </button>

      <div className="degree-selector">
        {programs.map((p) => (
          <button
            key={p.code}
            className={`subject-chip ${selected === p.code ? 'active' : ''}`}
            onClick={() => onSelect(p.code)}
            title={p.name}
          >
            {p.code}
          </button>
        ))}
      </div>

      {audit && (
        <div className="degree-summary">
          <Pill
            met={audit.summary.requiredMet === audit.summary.requiredTotal}
            label="required"
            value={`${audit.summary.requiredMet}/${audit.summary.requiredTotal}`}
          />
          <Pill
            met={audit.electives.met}
            label="elective units"
            value={`${audit.electives.units}/${audit.electives.minUnits}`}
          />
          <Pill
            met={audit.depth.met}
            label={audit.depth.label === 'track' ? 'tracks' : 'sequences'}
            value={`${audit.depth.completed.length}/${audit.depth.minComplete}`}
          />
          <Pill
            met={audit.units.met}
            label="total units"
            value={`${audit.units.planned}/${audit.units.required}`}
          />
        </div>
      )}
    </div>
  );

  if (!audit) return <section className="degree-panel">{header}</section>;

  return (
    <section className="degree-panel">
      {header}

      {open && (
        <div className="degree-body">
          <p className="degree-provenance">
            {audit.program.name}, {audit.program.catalogYear}. Total units and the
            general-education, writing and free-elective requirements are not modelled
            here — check with your adviser.
          </p>

          {audit.groups.map((group) => (
            <div key={group.id} className="degree-group">
              <h4>
                {group.name}
                <span className="degree-count">
                  {group.requirements.filter((r) => r.met).length}/{group.requirements.length}
                </span>
              </h4>
              <ul className="degree-list">
                {group.requirements.map((r) => (
                  <li key={r.label} className={r.met ? 'met' : 'unmet'}>
                    <span className="degree-mark" aria-hidden="true">{r.met ? '✓' : '○'}</span>
                    <span className="degree-label">{r.label}</span>
                    <span className="degree-detail">
                      {r.met
                        ? r.units != null && `${r.units} units`
                        : `needs ${r.missing.join(', ')}`}
                      {r.note && <em className="degree-note"> {r.note}</em>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="degree-group">
            <h4>
              {audit.electives.name}
              <span className="degree-count">
                {audit.electives.units}/{audit.electives.minUnits} units
              </span>
            </h4>
            <p className={`degree-inline ${audit.electives.met ? 'met' : 'unmet'}`}>
              <span className="degree-mark" aria-hidden="true">
                {audit.electives.met ? '✓' : '○'}
              </span>
              {audit.electives.courses.length > 0
                ? audit.electives.courses.join(', ')
                : 'No approved electives in your plan yet.'}
            </p>
            {audit.electives.note && <p className="degree-note">{audit.electives.note}</p>}
          </div>

          <div className="degree-group">
            <h4>
              {audit.depth.name}
              <span className="degree-count">
                {audit.depth.completed.length}/{audit.depth.minComplete} complete
              </span>
            </h4>
            <ul className="degree-list degree-tracks">
              {audit.depth.items
                .slice()
                .sort((a, b) => (b.met ? 1 : 0) - (a.met ? 1 : 0) || b.satisfied - a.satisfied)
                .map((item) => (
                  <li
                    key={item.name}
                    className={item.met ? 'met' : item.satisfied > 0 ? 'partial' : 'untouched'}
                  >
                    <span className="degree-mark" aria-hidden="true">
                      {item.met ? '✓' : item.satisfied > 0 ? '◐' : '○'}
                    </span>
                    <span className="degree-label">{item.name}</span>
                    <span className="degree-detail">
                      {item.met
                        ? 'complete'
                        : `${item.satisfied}/${item.needed}` +
                          (item.satisfied > 0 ? ` — add ${item.remaining.join(' / ')}` : '')}
                    </span>
                  </li>
                ))}
            </ul>
            {audit.depth.note && <p className="degree-note">{audit.depth.note}</p>}
          </div>
        </div>
      )}
    </section>
  );
}

function Pill({ met, label, value }) {
  return (
    <span className={`degree-pill ${met ? 'met' : 'unmet'}`}>
      <strong>{value}</strong> {label}
    </span>
  );
}

export default DegreeProgress;
