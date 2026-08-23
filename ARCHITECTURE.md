# Architecture

## Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│  UCSB SOURCES                                                            │
│                                                                          │
│  catalog.ucsb.edu       www.ece.ucsb.edu    my.sa.ucsb.edu   engineering │
│  General Catalog        ECE 2026-27 grid    Schedule of      .ucsb.edu   │
│  2025-26                ECE quarters,       Classes          GEAR 2026-27│
│  titles, units,         *NO / TBA           all other        EE / CE     │
│  prerequisite text      markings            quarters         major reqs  │
│                         + track pages       F24 - F26        + 4yr plans │
└──────────────────────────────────────────────────────────────────────────┘
                                    ↓  backend/scripts/ucsb/  (Python, offline)
                     fetch_catalog.py · fetch_ece_grid.py · harvest_soc.py
                                    ↓
                          prereq_parser.py + overrides.py
                          English prerequisites -> AND/OR trees
                                    ↓
                    build_dataset.py            requirements.py
              merge, resolve offerings,    EE / CE requirement specs,
                assign confidence           tracks and sequences
                                    ↓
        backend/data/ucsb-courses.json  +  ucsb-requirements.json
                     (192 courses)            (2 programs)
                                    ↓  backend/scripts/generate-seed.js
                          backend/db/seed.sql
                                    ↓  psql
┌──────────────────────────────────────────────────────────────────────────┐
│  POSTGRESQL                                                              │
│    courses              one row per course, prereq_tree as JSONB          │
│    prerequisite_edges   flattened edges, derived from prereq_tree         │
│    programs             EE / CE requirement spec as JSONB                │
└──────────────────────────────────────────────────────────────────────────┘
                                    ↓  SQL
┌──────────────────────────────────────────────────────────────────────────┐
│  EXPRESS API                    http://localhost:5000/api                │
│    models/Course.js             queries, prerequisite aggregation        │
│    models/Program.js            degree requirement specs                 │
│    routes/courses.js            GET /courses, /:id, /code/:code,         │
│                                     /:id/all-prerequisites, /sources     │
│    routes/programs.js           GET /programs, /programs/:code           │
└──────────────────────────────────────────────────────────────────────────┘
                                    ↓  HTTP / JSON
┌──────────────────────────────────────────────────────────────────────────┐
│  REACT APP                      http://localhost:5173                    │
│                                                                          │
│    pages/MasterPage.jsx         course directory, search + filters       │
│    pages/ScheduleBuilder.jsx    4 yr x F/W/Sp(+Summer), drag-drop      │
│    components/CourseCard.jsx    one course, in three densities           │
│    components/DegreeProgress    major requirements vs the plan           │
│    utils/validation.js          ALL scheduling + degree rules live here  │
│    utils/api.js                 Axios client                            │
└──────────────────────────────────────────────────────────────────────────┘
```

The pipeline is deliberately offline. Scraping happens when a human runs it, the
result is committed as JSON, and the app never depends on a UCSB page being up.

## Data model

### `courses`

Key columns beyond the obvious ones:

| Column | Purpose |
|---|---|
| `code` | `'ECE 130A'` — the natural key, with a space, matching UCSB's own formatting |
| `prereq_raw` | the catalog's own sentence, verbatim, so the tree can always be audited |
| `prereq_tree` | `JSONB` AND/OR tree — the authority for validation |
| `prereq_notes` | requirements that are not course prerequisites (major, standing, grades) |
| `offered_quarters` | `TEXT[]` subset of `{Fall, Winter, Spring}` |
| `offering_confidence` | `scheduled` / `historical` / `uncertain` / `unknown` — decides block vs warn |
| `offering_source`, `catalog_url` | provenance, surfaced in the UI |

### `prerequisite_edges`

A flattened `(course, prereq_code, concurrent)` view of each tree, derived at seed
time. It exists for prerequisite badges and for drawing the dependency graph; it
deliberately **does not** drive validation, because flattening throws away the
AND/OR structure. `prereq_id` is `NULL` for the retired courses the catalog still
names as alternatives.

### Prerequisite tree

```jsonc
{ "t": "course", "code": "ECE 130A", "concurrent": false }
{ "t": "and", "kids": [ … ] }   // every child required
{ "t": "or",  "kids": [ … ] }   // any one child suffices
```

`concurrent: true` means the catalog allows the prerequisite in the *same* quarter.

### `programs`

One row per major, with the nested requirement spec in a `definition` JSONB column —
it is a document, not relational data. Each program has:

- **`groups`** — required courses, split into "preparation for the major" and "upper
  division". Each requirement carries a `label` (the GEAR's own wording), a `tree` in
  the same AND/OR shape as prerequisites, its `units`, and any footnote as a `note`.
- **`electives`** — `min_units` plus the `codes` on that major's approved list.
- **`depth`** — the EE tracks or CE sequences, and how many must be complete. Each
  item is a list of rules:

  ```jsonc
  { "kind": "all",     "options": [["ECE 122A", "ECE 123"], ["ECE 122B"]] }
  { "kind": "atLeast", "n": 4, "options": [["ECE 133"], ["ECE 157A"], …] }
  ```

  An option is satisfied if **any** of its codes is in the plan, which is how
  cross-listings (`ECE 181` / `CMPSC 181`) and either-or requirements work. A track is
  complete when every one of its rules passes.

Reusing the prerequisite tree shape for required courses means one evaluator walks
both, and "MATH 2A-B or 3A-B" resolves the same way in both contexts.

## Validation

Everything lives in `frontend/src/utils/validation.js`. It is pure — no React, no
network — which is why it can be tested directly against the dataset.

### Terms

A plan is 12 terms keyed `Y1-Fall` … `Y4-Spring`. `termIndex` maps a key to an
absolute position (`Y1-Fall` = 0, `Y4-Spring` = 11), so ordering comparisons work
across year boundaries — the thing a single-year grid cannot express.

### Two severities

| | Meaning | Effect |
|---|---|---|
| `error` | breaks a published requirement | drop refused |
| `warning` | cannot be confirmed legal | drop allowed, flagged |

A wrong quarter is only an error when UCSB actually publishes the course's quarters
(`scheduled` or `historical`). `uncertain` and `unknown` warn instead, because a
`*NO` in the department grid does not mean the course cannot appear in GOLD.

### Evaluating a tree

`evaluate()` walks the tree against a `Map` of course code to term index:

- `course` — satisfied if placed at `target - 1` or earlier, or at `target` when
  `concurrent`
- `and` — every child satisfied
- `or` — any child satisfied

Failures carry enough structure for `describe()` to write a usable sentence:
brackets for an AND nested in an OR, `(must be in an earlier quarter)` when the
course is present but too late, and retired alternatives dropped entirely since a
student cannot act on them.

```
ECE 137A needs ECE 10B and ECE 10C and (ECE 10BL and ECE 10CL)
  and ECE 130A and ECE 132 before Year 3 Winter.
```

### Two entry points

- `validatePlacement(course, term, schedule, catalog)` — one drop. Checks
  duplicates, the five-course cap, prerequisites, then offerings.
- `validatePlan(schedule, catalog)` — every placement, on every change. This is what
  makes a *removal* surface a problem: taking `ECE 152A` out of the plan
  immediately flags the `ECE 154A` that depended on it. Returns issues keyed by
  course code, which the cards read directly.

When a course is dragged *within* the plan, validation runs against the plan with
that course already lifted out — otherwise a course would block its own move.

## Degree audit

`auditDegree(schedule, program)` is separate from `validatePlan` on purpose. It asks a
different question — *have I taken enough?* rather than *is this legal?* — and it
deliberately ignores ordering: a required course counts wherever it sits, because
`validatePlan` already polices sequencing and flagging it twice would only add noise.

Three things it gets right that a naive count would not:

**Cheapest branch to finish.** When an `or` requirement is unmet, it reports the
branch closest to completion rather than every alternative. With `MATH 3A` planned,
"MATH 2A-B or 3A-B" says *needs MATH 3B* — not *needs MATH 2A, MATH 2B*.

**No double counting.** A course consumed by a required slot cannot also count towards
elective units. The audit records what each satisfied requirement used, then excludes
those codes when totalling electives. This matters for courses on both lists, such as
`ECE 153A` for EE.

**Partial track progress.** A track reports `satisfied / needed` and names the courses
that would finish it, so a plan three-quarters into a depth sequence is visibly
different from one that has not started.

It returns a plain object, so the panel renders it without any further logic.

## Frontend state

```javascript
schedule = {
  'Y1-Fall':   [courseRow, …],   // max 5
  'Y1-Winter': [ … ],
  …
  'Y4-Spring': [ … ],
}
```

Persisted to `localStorage` as course *codes* only, then re-hydrated against the
freshly fetched course list — so a data refresh updates a saved plan instead of
freezing stale course rows into it.

`validatePlan` runs in a `useMemo` keyed on `[schedule, catalog]`, so the plan
check, the per-card badges and the status counts always agree with each other.

## Design decisions

**Why keep `prereq_raw`.** Any machine reading of English prerequisites can be
wrong. Storing the catalog's sentence next to the tree means a student can check
the app's reasoning, and it made hand-verification of all 149 trees possible.

**Why degree requirements are hand-transcribed.** Everything else is scraped, but
UCSB publishes major requirements as a PDF (the GEAR) and the tracks as prose. There
is no queryable source, so `requirements.py` records them by hand with the page number
or URL beside each. `requirements.py` then asserts every referenced course exists in
the dataset — that check is what surfaced `ENGR 101` and `CMPSC 41` missing entirely,
and reading the PDF back is what exposed `ECE 51` as a footnote artifact rather than a
real course.

**Why AND/OR trees rather than a flat prerequisite list.** A flat list turns
"ECE 139 *or* PSTAT 120A" into "ECE 139 *and* PSTAT 120A" and generates confident,
wrong errors. Nearly half of ECE's upper-division prerequisites contain an
alternation.

**Why keep retired courses in the trees.** `ECE 152A` lists `ECE 2A` as an
alternative to `ECE 10A` + `10AL`. Deleting the dead branch would silently change
the requirement; keeping it, and marking it unsatisfiable, preserves the catalog's
meaning while still guiding students to the live path.

**Why two offering sources.** The ECE department publishes a forward-looking grid;
no other department does. Using the Schedule of Classes for the rest is the best
available signal, and labelling it `historical` keeps the difference honest. The two
were cross-checked where they overlap: 71 of 72 ECE courses agree.

**Why validation is client-side.** It is pure, fast, needs the whole plan in hand,
and must run on every drag. Moving it to the server would add a round trip per drop
for no gain. The `courses` payload it needs is ~250 KB, fetched once.
