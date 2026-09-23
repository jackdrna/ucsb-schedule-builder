import React, { memo } from 'react';
import CourseCard from './CourseCard';

/**
 * TraceCard -- a directory course card, wrapped so the prerequisite trace can
 * find it (`data-code`), lift it above the page tint and ring the traced
 * course, without the card itself knowing about tracing. Clicks and keys are
 * handled by the directory canvas.
 *
 * @param {Object} course    course row from the API
 * @param {string} relation  'self' | 'pre' | 'dep' while a course is traced
 */
function TraceCard({ course, relation = null }) {
  return (
    <div
      className={`trace-card${relation ? ` is-${relation}` : ''}`}
      data-code={course.code}
      role="button"
      tabIndex={0}
      aria-pressed={relation === 'self'}
    >
      <CourseCard course={course} showDetail />
    </div>
  );
}

// A trace touches a handful of cards out of hundreds; skip re-rendering the rest.
export default memo(TraceCard);
