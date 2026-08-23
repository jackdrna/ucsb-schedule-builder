import React, { useState } from 'react';
import { termLabel } from '../utils/validation';
import './PlanCheck.css';

/**
 * PlanCheck
 *
 * Every problem in the plan: hard errors first, then things worth verifying.
 * Prerequisite errors carry a one-click waiver, since that is the only kind a
 * waiver can fix.
 *
 * @param {Object}   report        result of validatePlan()
 * @param {Function} onWaive       called with a course code
 */
function PlanCheck({ report, onWaive }) {
  const [open, setOpen] = useState(true);

  const issues = [...report.errors, ...report.warnings];
  const clean = issues.length === 0;

  return (
    <section className="issue-panel">
      <div className="issue-head">
        <button
          className="issue-toggle"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          disabled={clean}
        >
          <span className="issue-caret" aria-hidden="true">
            {clean ? '' : open ? '▾' : '▸'}
          </span>
          Plan check
        </button>

        <div className="issue-summary">
          {clean ? (
            <span className="issue-pill clean">Nothing to fix</span>
          ) : (
            <>
              {report.errors.length > 0 && (
                <span className="issue-pill error">
                  <strong>{report.errors.length}</strong>{' '}
                  problem{report.errors.length === 1 ? '' : 's'}
                </span>
              )}
              {report.warnings.length > 0 && (
                <span className="issue-pill warning">
                  <strong>{report.warnings.length}</strong> to verify
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {open && !clean && (
        <ul className="issue-list">
          {issues.map((issue) => (
            <li key={`${issue.code}-${issue.term}`} className={issue.status}>
              <span className="issue-term">{termLabel(issue.term)}</span>
              <span className="issue-code">{issue.code}</span>
              <span className="issue-message">
                {issue.message}
                {/* A prerequisite problem is the one thing a waiver can fix. */}
                {issue.status === 'error' && issue.message.includes(' needs ') && (
                  <button
                    className="issue-waive"
                    onClick={() => onWaive(issue.code)}
                    title={`Do not enforce prerequisites for ${issue.code}`}
                  >
                    waive prerequisites
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default PlanCheck;
