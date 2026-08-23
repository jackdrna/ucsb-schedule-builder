const pool = require('../db/pool');

// Everything the client needs to render a card and validate a placement.
const COURSE_COLUMNS = `
  c.id,
  c.code,
  c.subject,
  c.number,
  c.title,
  c.short_title,
  c.units::float AS units,
  c.description,
  c.college,
  c.restricted_majors,
  c.prereq_raw,
  c.prereq_tree,
  c.prereq_notes,
  c.offered_quarters,
  c.offering_confidence,
  c.offering_notes,
  c.offering_source,
  c.offering_source_url,
  c.catalog_source,
  c.catalog_url
`;

// Flattened prerequisite list, for badges and for the dependency graph. The
// AND/OR structure lives in prereq_tree; this is the set of codes it mentions.
const PREREQ_AGG = `
  COALESCE(
    (SELECT json_agg(json_build_object(
              'code', e.prereq_code,
              'id', e.prereq_id,
              'concurrent', e.concurrent
            ) ORDER BY e.prereq_code)
     FROM prerequisite_edges e
     WHERE e.course_id = c.id),
    '[]'::json
  ) AS prerequisites
`;

class Course {
  static async getAllCourses() {
    const result = await pool.query(`
      SELECT ${COURSE_COLUMNS}, ${PREREQ_AGG}
      FROM courses c
      ORDER BY c.subject, (regexp_replace(c.number, '\\D.*$', ''))::int, c.number
    `);
    return result.rows;
  }

  static async getCourseById(id) {
    const result = await pool.query(
      `SELECT ${COURSE_COLUMNS}, ${PREREQ_AGG} FROM courses c WHERE c.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  static async getCourseByCode(code) {
    // Accept 'ECE130A' as well as 'ECE 130A'.
    const normalized = String(code).toUpperCase().replace(/\s+/g, '');
    const result = await pool.query(
      `SELECT ${COURSE_COLUMNS}, ${PREREQ_AGG}
       FROM courses c
       WHERE replace(upper(c.code), ' ', '') = $1`,
      [normalized]
    );
    return result.rows[0] || null;
  }

  /**
   * Every course that transitively appears in a course's prerequisite tree.
   * Includes retired courses the catalog still names as alternatives, which have
   * no row of their own (id is null).
   */
  static async getAllPrerequisites(courseId) {
    const result = await pool.query(
      `
      WITH RECURSIVE chain AS (
        SELECT e.prereq_code, e.prereq_id, e.concurrent, 1 AS depth
        FROM prerequisite_edges e
        WHERE e.course_id = $1
        UNION
        SELECT e.prereq_code, e.prereq_id, e.concurrent, chain.depth + 1
        FROM prerequisite_edges e
        JOIN chain ON e.course_id = chain.prereq_id
        WHERE chain.depth < 12
      )
      SELECT chain.prereq_code AS code, chain.prereq_id AS id,
             MIN(chain.depth) AS depth, c.title, c.offered_quarters
      FROM chain
      LEFT JOIN courses c ON c.id = chain.prereq_id
      GROUP BY chain.prereq_code, chain.prereq_id, c.title, c.offered_quarters
      ORDER BY MIN(chain.depth), chain.prereq_code
      `,
      [courseId]
    );
    return result.rows;
  }

  /** Where the data came from, so the UI can cite its sources. */
  static async getSources() {
    const result = await pool.query(`
      SELECT DISTINCT offering_source, offering_source_url, catalog_source
      FROM courses
      WHERE offering_source IS NOT NULL
      ORDER BY offering_source
    `);
    return result.rows;
  }
}

module.exports = Course;
