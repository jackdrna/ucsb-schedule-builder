import React from 'react';
import './BottomDock.css';

/**
 * BottomDock
 *
 * Wraps the three panels that live under the grid — plan check, degree progress,
 * prior credit — behind one master collapse, so the whole bottom half can be put
 * away and the schedule gets the screen back.
 *
 * Collapsed, it is a single bar carrying the summary that matters: how many
 * problems, how far through the major, how many overrides are in force. Expanded,
 * each panel still opens and closes on its own.
 *
 * @param {boolean}  collapsed
 * @param {Function} onToggle
 * @param {Object}   report    result of validatePlan()
 * @param {Object}   audit     result of auditDegree(), or null
 * @param {number}   overrides count of prior credit + waivers
 */
function BottomDock({ collapsed, onToggle, report, audit, overrides, children }) {
  const problems = report.errors.length;
  const toVerify = report.warnings.length;

  return (
    <div className={`bottom-dock ${collapsed ? 'collapsed' : 'expanded'}`}>
      <button
        className="dock-handle"
        onClick={onToggle}
        aria-expanded={!collapsed}
        title={collapsed ? 'Show plan check and requirements' : 'Hide the bottom panels'}
      >
        <span className="dock-caret" aria-hidden="true">{collapsed ? '▴' : '▾'}</span>
        <span className="dock-title">Plan check &amp; requirements</span>

        {collapsed && (
          <span className="dock-summary">
            <span className={`dock-pill ${problems ? 'error' : 'clean'}`}>
              <strong>{problems}</strong> problem{problems === 1 ? '' : 's'}
            </span>
            {toVerify > 0 && (
              <span className="dock-pill warning">
                <strong>{toVerify}</strong> to verify
              </span>
            )}
            {audit && (
              <span className={`dock-pill ${audit.met ? 'clean' : 'neutral'}`}>
                {audit.program.code}{' '}
                <strong>
                  {audit.summary.requiredMet}/{audit.summary.requiredTotal}
                </strong>{' '}
                required
              </span>
            )}
            {overrides > 0 && (
              <span className="dock-pill neutral">
                <strong>{overrides}</strong> override{overrides === 1 ? '' : 's'}
              </span>
            )}
          </span>
        )}
      </button>

      {!collapsed && <div className="dock-panels">{children}</div>}
    </div>
  );
}

export default BottomDock;
