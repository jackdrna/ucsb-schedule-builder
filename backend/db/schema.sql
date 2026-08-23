-- Schedule Builder schema -- UCSB EE / CE course data.
--
-- Data provenance (see backend/scripts/ucsb/):
--   course info + prerequisites : UCSB General Catalog        catalog.ucsb.edu
--   ECE quarter offerings       : ECE Undergraduate Courses   www.ece.ucsb.edu/undergrad/courses
--   other quarter offerings     : UCSB Schedule of Classes    my.sa.ucsb.edu/public/curriculum

DROP TABLE IF EXISTS prerequisite_edges CASCADE;
DROP TABLE IF EXISTS prerequisites CASCADE;
DROP TABLE IF EXISTS programs CASCADE;
DROP TABLE IF EXISTS courses CASCADE;

CREATE TABLE courses (
  id                  SERIAL PRIMARY KEY,
  code                VARCHAR(20)  NOT NULL UNIQUE,   -- 'ECE 130A'
  subject             VARCHAR(10)  NOT NULL,          -- 'ECE'
  number              VARCHAR(10)  NOT NULL,          -- '130A'
  title               VARCHAR(255) NOT NULL,
  short_title         VARCHAR(120),
  units               NUMERIC(4,1),
  description         TEXT,
  college             VARCHAR(120),

  -- Majors allowed to register, per the catalog's registration restrictions.
  restricted_majors   TEXT[]       NOT NULL DEFAULT '{}',

  -- Prerequisites. `prereq_raw` is the catalog's own wording, kept verbatim so a
  -- human can always check the machine-readable tree against the source.
  prereq_raw          TEXT,
  prereq_tree         JSONB,                          -- AND/OR tree, see below
  prereq_notes        TEXT[]       NOT NULL DEFAULT '{}',

  -- When the course runs. `offering_confidence` drives whether a bad quarter is
  -- a hard error or only a warning:
  --   scheduled  -> ECE department grid marks an 'X' for 2026-27   (hard block)
  --   historical -> seen in the Schedule of Classes, 2024-2026     (hard block)
  --   uncertain  -> grid says *NO / TBA for 2026-27                (warn only)
  --   unknown    -> no published quarter data found                (warn only)
  offered_quarters    TEXT[]       NOT NULL DEFAULT '{}',
  offering_confidence VARCHAR(20)  NOT NULL DEFAULT 'unknown',
  offering_notes      TEXT[]       NOT NULL DEFAULT '{}',
  offering_source     TEXT,
  offering_source_url TEXT,

  catalog_source      TEXT,
  catalog_url         TEXT,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT courses_offering_confidence_check
    CHECK (offering_confidence IN ('scheduled', 'historical', 'uncertain', 'unknown'))
);

-- prereq_tree node shapes:
--   {"t":"course","code":"ECE 130A","concurrent":false}
--   {"t":"and","kids":[ ... ]}
--   {"t":"or", "kids":[ ... ]}
-- `concurrent` true means the prerequisite may be taken in the SAME quarter.

-- Flattened prerequisite edges, derived from prereq_tree. Useful for rendering
-- prerequisite badges and for drawing the dependency graph; the tree remains the
-- authority for validation because it carries the AND/OR structure.
CREATE TABLE prerequisite_edges (
  id           SERIAL PRIMARY KEY,
  course_id    INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  prereq_code  VARCHAR(20) NOT NULL,
  prereq_id    INTEGER REFERENCES courses(id) ON DELETE CASCADE,  -- NULL if retired
  concurrent   BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (course_id, prereq_code)
);

-- Degree requirements for the EE and CE majors, from the College of Engineering's
-- GEAR publication and the department track / sequence pages. Stored as a document
-- because it is a nested requirement spec, not relational data: required-course
-- groups, an approved elective list with a unit minimum, and the depth
-- tracks (EE) or senior elective sequences (CE).
CREATE TABLE programs (
  id            SERIAL PRIMARY KEY,
  code          VARCHAR(10)  NOT NULL UNIQUE,   -- 'EE', 'CE'
  name          VARCHAR(120) NOT NULL,
  catalog_year  VARCHAR(10)  NOT NULL,          -- '2026-27'
  total_units   INTEGER      NOT NULL,
  source        TEXT         NOT NULL,
  source_url    TEXT         NOT NULL,
  definition    JSONB        NOT NULL,          -- groups, electives, depth, notes
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_courses_subject          ON courses(subject);
CREATE INDEX idx_courses_offered_quarters ON courses USING GIN (offered_quarters);
CREATE INDEX idx_prereq_edges_course      ON prerequisite_edges(course_id);
CREATE INDEX idx_prereq_edges_prereq      ON prerequisite_edges(prereq_id);
