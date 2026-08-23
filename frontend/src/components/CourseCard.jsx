import React from 'react';
import { describePrereqTree } from '../utils/validation';
import './CourseCard.css';

const PASTELS = [
  'pastel-1', 'pastel-2', 'pastel-3', 'pastel-4',
  'pastel-5', 'pastel-6', 'pastel-7', 'pastel-8',
];

/** Stable colour per course, so a card looks the same everywhere. */
function colorFor(code) {
  let hash = 0;
  for (let i = 0; i < code.length; i += 1) hash = (hash * 31 + code.charCodeAt(i)) % 1024;
  return PASTELS[hash % PASTELS.length];
}

const QUARTER_ABBR = { Fall: 'F', Winter: 'W', Spring: 'S' };

/**
 * CourseCard
 *
 * @param {Object}  course     course row from the API
 * @param {boolean} compact    slot-sized rendering inside the schedule grid
 * @param {Object}  issue      { status: 'error' | 'warning', message } from validatePlan
 * @param {boolean} showDetail render description and the full catalog wording
 */
function CourseCard({ course, isDraggable = false, compact = false, issue = null, showDetail = false }) {
  const prereqText = describePrereqTree(course.prereq_tree);
  const offered = course.offered_quarters || [];
  const unconfirmed =
    course.offering_confidence === 'uncertain' || course.offering_confidence === 'unknown';

  const classes = [
    'course-card',
    colorFor(course.code),
    compact ? 'compact' : '',
    issue ? `has-${issue.status}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} draggable={isDraggable} title={issue ? issue.message : undefined}>
      <div className="course-card-head">
        <span className="course-code">{course.code}</span>
        {course.units != null && <span className="course-units">{course.units}u</span>}
      </div>

      <div className="course-name">{course.title}</div>

      {issue && (
        <div className={`course-issue ${issue.status}`}>
          <span aria-hidden="true">{issue.status === 'error' ? '✕' : '!'}</span>
          <span>{issue.message}</span>
        </div>
      )}

      {prereqText && (
        <div className="course-prerequisites">
          <span className="prereq-label">Prerequisites</span>
          <span className="prereq-text">{prereqText}</span>
        </div>
      )}

      <div className="course-quarters">
        <span className="quarters-label">Offered</span>
        <div className="quarters-list">
          {offered.length > 0 ? (
            offered.map((q) => (
              <span key={q} className={`quarter-badge${unconfirmed ? ' tentative' : ''}`}>
                {compact ? QUARTER_ABBR[q] : q}
              </span>
            ))
          ) : (
            <span className="quarter-badge none">not scheduled</span>
          )}
          {unconfirmed && <span className="quarter-badge tentative-flag">unconfirmed</span>}
        </div>
      </div>

      {showDetail && (
        <div className="course-detail">
          {course.description && <p className="course-description">{course.description}</p>}

          {course.prereq_raw && (
            <p className="course-source-text">
              <strong>Catalog wording:</strong> {course.prereq_raw}
            </p>
          )}

          {course.restricted_majors?.length > 0 && (
            <p className="course-source-text">
              <strong>Open to:</strong> {course.restricted_majors.join(', ')}
            </p>
          )}

          {course.offering_notes?.length > 0 && (
            <p className="course-source-text">{course.offering_notes.join(' ')}</p>
          )}

          <p className="course-source-text course-provenance">
            Offerings: {course.offering_source}.{' '}
            {course.catalog_url && (
              <a href={course.catalog_url} target="_blank" rel="noreferrer">
                View in the UCSB catalog
              </a>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

export default CourseCard;
