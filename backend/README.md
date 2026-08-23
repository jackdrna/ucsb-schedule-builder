# Backend

Express API serving UCSB EE / CE course data. It is a read-only data layer — all
scheduling rules live in `frontend/src/utils/validation.js`.

## Setup

Requires Node.js 18+ and PostgreSQL 12+.

```bash
npm install
createdb schedule_builder
cp .env.example .env          # then set DATABASE_URL
psql schedule_builder < db/schema.sql
psql schedule_builder < db/seed.sql
npm start                     # or: npm run dev  (nodemon)
```

`.env`:

```
PORT=5000
DATABASE_URL=postgresql://username:password@localhost:5432/schedule_builder
NODE_ENV=development
```

## Endpoints

| Method | Path | Returns |
|---|---|---|
| GET | `/api/courses` | every course, with prerequisite tree, quarters and sources |
| GET | `/api/courses/sources` | the UCSB sources behind the data |
| GET | `/api/courses/code/:code` | one course — `ECE 130A` or `ECE130A` |
| GET | `/api/courses/:id` | one course |
| GET | `/api/courses/:id/all-prerequisites` | the full transitive prerequisite chain |
| GET | `/api/programs` | EE and CE degree requirements |
| GET | `/api/programs/:code` | one program -- `EE` or `CE`, case-insensitive |
| GET | `/api/health` | `{"status":"OK"}` |

Route order matters: `/sources` and `/code/:code` are registered before `/:id` so
they are not shadowed by it.

The API is read-only. The old `POST /api/courses` and
`POST /api/courses/:id/prerequisites` endpoints were removed — course data now comes
from UCSB via the pipeline in `scripts/ucsb/`, and hand-inserting rows would put the
database out of step with its sources.

## Layout

```
backend/
├── server.js                   # Express app
├── db/
│   ├── schema.sql              # tables (drops and recreates)
│   ├── seed.sql                # GENERATED -- do not edit
│   └── pool.js                 # connection pool
├── routes/                     # courses.js, programs.js
├── models/                     # Course.js, Program.js -- all SQL
├── data/
│   ├── ucsb-courses.json       # the merged UCSB dataset (192 courses)
│   └── ucsb-requirements.json  # EE / CE degree requirements
└── scripts/
    ├── generate-seed.js        # backend/data/*.json -> db/seed.sql
    └── ucsb/                   # the scraping + prerequisite-parsing pipeline
```

## Schema

### `courses`

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `code` | VARCHAR(20) UNIQUE | `'ECE 130A'`, with the space |
| `subject`, `number` | VARCHAR | `'ECE'`, `'130A'` |
| `title`, `short_title` | VARCHAR | full catalog title, and the registrar's abbreviation |
| `units` | NUMERIC(4,1) | |
| `description`, `college` | TEXT / VARCHAR | |
| `restricted_majors` | TEXT[] | majors allowed to register |
| `prereq_raw` | TEXT | the catalog's own sentence, verbatim |
| `prereq_tree` | JSONB | AND/OR tree — the authority for validation |
| `prereq_notes` | TEXT[] | major limits, standing, consent, minimum grades |
| `offered_quarters` | TEXT[] | subset of `{Fall, Winter, Spring}` |
| `offering_confidence` | VARCHAR(20) | `scheduled` / `historical` / `uncertain` / `unknown` |
| `offering_notes` | TEXT[] | e.g. the department grid marking a quarter `*NO` |
| `offering_source`, `offering_source_url`, `catalog_source`, `catalog_url` | TEXT | provenance |

### `prerequisite_edges`

`(course_id, prereq_code, prereq_id, concurrent)` — a flattened view of each
`prereq_tree`, generated at seed time for prerequisite badges and for drawing the
dependency graph. It does **not** drive validation, because flattening discards the
AND/OR structure. `prereq_id` is `NULL` for courses the catalog still names as
alternatives but UCSB no longer offers (ECE 2A, MATH 5A, CMPSC 30, …).

### `programs`

One row per major (`EE`, `CE`) with the nested requirement spec in a `definition`
JSONB column: required-course `groups`, an `electives` list with a unit minimum, and
`depth` -- the EE tracks or CE senior elective sequences. Transcribed from the College
of Engineering's GEAR publication and the department track pages; see
[scripts/ucsb/README.md](./scripts/ucsb/README.md).

`Program.js` flattens `definition` into the row before returning it, so the client
sees one object per program.

### Prerequisite tree

```jsonc
{ "t": "course", "code": "ECE 130A", "concurrent": false }  // concurrent: same quarter OK
{ "t": "and", "kids": [ … ] }                               // all required
{ "t": "or",  "kids": [ … ] }                               // any one suffices
```

## Data

`db/seed.sql` is generated. To change course data, change the dataset and regenerate:

```bash
node scripts/generate-seed.js
psql schedule_builder < db/seed.sql
```

To re-scrape from UCSB, see [scripts/ucsb/README.md](./scripts/ucsb/README.md).

## Notes

- Every query uses parameterised statements.
- `getCourseByCode` normalises whitespace, so `ECE130A` and `ECE 130A` both resolve.
- `getAllPrerequisites` is a recursive CTE capped at depth 12.
- CORS is open, for the Vite dev server on a different port.
