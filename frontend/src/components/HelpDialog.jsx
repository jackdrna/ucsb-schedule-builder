import React, { useState, useEffect, useRef, useCallback } from 'react';
import './HelpDialog.css';

const SEEN_KEY = 'ucsb-schedule-help-v1';

/**
 * Help
 *
 * The "how do I use this" panel, in two entry points that share one body: it opens
 * itself on a visitor's first arrival, and a **?** button in the bottom right opens
 * it again afterwards. Both pages render this, and the first-visit flag is shared,
 * so a new visitor is greeted once rather than once per page.
 *
 * Self-contained on purpose — it owns its own open state and its own persistence, so
 * a page adds help by rendering <Help /> and nothing else.
 */
function Help() {
  // Decided once, before the first paint, so a returning visitor never sees the
  // dialog flash up. Storage can throw when a browser blocks it, in which case we
  // simply skip the greeting rather than showing it on every load.
  const [open, setOpen] = useState(() => {
    try {
      return window.localStorage.getItem(SEEN_KEY) !== 'seen';
    } catch {
      return false;
    }
  });
  const closeRef = useRef(null);
  const openerRef = useRef(null);

  const close = useCallback(() => {
    setOpen(false);
    try {
      window.localStorage.setItem(SEEN_KEY, 'seen');
    } catch {
      /* nothing to do */
    }
    openerRef.current?.focus();
  }, []);

  // Escape closes, and focus moves to the dialog so the keyboard lands somewhere
  // useful rather than staying behind on the page.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    closeRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  return (
    <>
      <button
        ref={openerRef}
        className="help-fab"
        onClick={() => setOpen(true)}
        aria-label="How to use this planner"
        title="How to use this planner"
      >
        ?
      </button>

      {open && (
        <div
          className="help-backdrop"
          onClick={close}
          role="presentation"
        >
          <div
            className="help-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            /* The backdrop closes on click; clicks inside must not bubble up to it. */
            onClick={(e) => e.stopPropagation()}
          >
            <header className="help-head">
              <h2 id="help-title">How to use this planner</h2>
              <button
                ref={closeRef}
                className="help-close"
                onClick={close}
                aria-label="Close"
              >
                ×
              </button>
            </header>

            <div className="help-body">
              <section>
                <h3>Build a plan</h3>
                <ul>
                  <li>
                    <strong>Drag a course</strong> from the left onto any quarter. Five
                    courses per quarter, four years.
                  </li>
                  <li>
                    <strong>To remove one</strong>, drag it back to the left column or
                    hover it and click the red ×.
                  </li>
                  <li>
                    Your plan <strong>saves in this browser automatically</strong> — you
                    can close the tab and come back.
                  </li>
                </ul>
              </section>

              <section>
                <h3>What the colours mean</h3>
                <ul>
                  <li>
                    <span className="help-swatch error" aria-hidden="true" />
                    <strong>Red — the drop was refused.</strong> It breaks something UCSB
                    publishes: a missing prerequisite, or a quarter the course does not
                    run in.
                  </li>
                  <li>
                    <span className="help-swatch warning" aria-hidden="true" />
                    <strong>Amber — allowed, but unconfirmed.</strong> UCSB has not
                    published enough to be sure. Check it in GOLD.
                  </li>
                </ul>
                <p>
                  The whole plan is re-checked on every change, so removing a course
                  immediately flags anything that depended on it.
                </p>
              </section>

              <section>
                <h3>When a prerequisite is in the way</h3>
                <p>
                  If you have really met it — a placement test, transfer credit, a
                  departmental exception — you have two options in{' '}
                  <strong>Plan check &amp; requirements</strong> at the bottom:
                </p>
                <ul>
                  <li>
                    <strong>Already have credit</strong> — you finished it outside this
                    plan. It satisfies prerequisites anywhere and needs no slot.
                  </li>
                  <li>
                    <strong>Waive prerequisites</strong> — you are taking the course
                    without what normally comes first. It still takes a slot.
                  </li>
                </ul>
                <p>
                  A refused drop also offers <strong>“Waive these prereqs?”</strong> right
                  in the message, which is usually where you notice you need one.
                </p>
              </section>

              <section>
                <h3>Summer, saving and majors</h3>
                <ul>
                  <li>
                    <strong>Summer</strong> adds an optional fourth column. UCSB does not
                    publish Summer Sessions offerings, so summer courses always show as
                    unconfirmed — but prerequisite order is still enforced.
                  </li>
                  <li>
                    <strong>Save plan</strong> downloads your plan as a file;{' '}
                    <strong>Load plan</strong> reads it back. Use it to back up, move
                    between computers, or share.
                  </li>
                  <li>
                    Pick <strong>EE</strong> or <strong>CE</strong> at the bottom to audit
                    your plan against that major’s requirements.
                  </li>
                </ul>
              </section>

              <p className="help-caveat">
                This is an unofficial planning tool. Offerings and requirements change —{' '}
                <a
                  href="https://my.sa.ucsb.edu/gold/login.aspx"
                  target="_blank"
                  rel="noreferrer"
                >
                  GOLD
                </a>{' '}
                and your academic adviser are always the final word.
              </p>
            </div>

            <footer className="help-foot">
              <button className="help-got-it" onClick={close}>
                Got it
              </button>
              <span className="help-reopen-hint">
                Reopen any time with <strong>?</strong> in the bottom right.
              </span>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}

export default Help;
