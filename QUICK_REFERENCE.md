# Quick reference

## Start everything

The app reads its dataset from `public/data` and needs **no backend**:

```bash
cd frontend && npm run dev                    # http://localhost:5173
```

Only needed to regenerate the dataset or work on the API:

```bash
cd backend && npm start                       # http://localhost:5000
# then uncomment VITE_API_BASE_URL in frontend/.env
```

## Deploy

```bash
cd frontend && npm run build                  # dist/ -- static, no server
```

Pushing to `main` runs `.github/workflows/deploy.yml`: test, build, publish to Pages.

## Test

```bash
cd frontend && npm test                       # 59 validation checks, no DB needed
```

## Reload the database

```bash
psql schedule_builder < backend/db/schema.sql  # drops and recreates tables
psql schedule_builder < backend/db/seed.sql    # 192 courses, 414 edges, 2 programs
```

## Refresh the UCSB data

```bash
cd backend/scripts/ucsb
python fetch_catalog.py && python fetch_ece_grid.py && python harvest_soc.py
python build_dataset.py && python requirements.py   # write into backend/data/
python review.py ECE CMPSC                    # verify parses against the catalog
node ../generate-seed.js && psql schedule_builder < ../../db/seed.sql
```

## API

```bash
curl http://localhost:5000/api/health
curl http://localhost:5000/api/courses
curl "http://localhost:5000/api/courses/code/ECE130A"   # space optional
curl http://localhost:5000/api/courses/83
curl http://localhost:5000/api/courses/83/all-prerequisites
curl http://localhost:5000/api/courses/sources
curl http://localhost:5000/api/programs
curl http://localhost:5000/api/programs/CE
```

## Useful SQL

```sql
-- what runs in Winter
SELECT code, title FROM courses
WHERE 'Winter' = ANY(offered_quarters) AND subject = 'ECE' ORDER BY code;

-- courses we cannot confirm a quarter for
SELECT code, offering_confidence, offering_notes FROM courses
WHERE offering_confidence IN ('uncertain', 'unknown');

-- everything gated behind ECE 152A
SELECT c.code, c.title FROM prerequisite_edges e
JOIN courses c ON c.id = e.course_id
WHERE e.prereq_code = 'ECE 152A' ORDER BY c.code;

-- the catalog's own wording next to the parsed tree
SELECT code, prereq_raw, prereq_tree FROM courses WHERE code = 'ECE 146A';

-- prerequisites naming a course UCSB no longer offers
SELECT DISTINCT prereq_code FROM prerequisite_edges WHERE prereq_id IS NULL;

-- the EE depth tracks and the CE sequences
SELECT code, jsonb_array_elements(definition->'depth'->'items')->>'name' AS depth
FROM programs ORDER BY code;

-- what a major requires, in the GEAR's own wording
SELECT r->>'label' AS requirement, r->>'units' AS units
FROM programs p,
     jsonb_array_elements(p.definition->'groups') g,
     jsonb_array_elements(g->'requirements') r
WHERE p.code = 'CE';
```

## Browser state

| `localStorage` key | Holds |
|---|---|
| `ucsb-schedule-plan-v1` | the plan, as course codes per term |
| `ucsb-schedule-major-v1` | `EE` or `CE` |
| `ucsb-schedule-credit-v1` | courses already completed |
| `ucsb-schedule-waivers-v1` | courses whose prerequisites are waived |
| `ucsb-schedule-dock-v1` | whether the bottom dock is collapsed |
| `ucsb-schedule-summer-v1` | whether the Summer column is showing |
| `ucsb-schedule-help-v1` | `seen` once the first-visit help popup is dismissed |

## Terms

Plan keys are `Y1-Fall` … `Y4-Summer` — 4 years × Fall/Winter/Spring/Summer, 5
courses per quarter. Summer comes after Spring (`Y1-Summer` precedes `Y2-Fall`), is
collapsed by default, and empties when collapsed.

## Save / load a plan

**Save plan** writes `ucsb-plan-YYYY-MM-DD.json`; **Load plan** reads one back.

```jsonc
{ "version": 1, "savedAt": "…", "major": "EE",
  "plan": { "Y1-Fall": ["MATH 3A"], … },   // all 16 terms, course codes
  "priorCredit": ["WRIT 2"], "prereqWaivers": ["CMPSC 16"] }
```

## Prerequisite tree shape

```jsonc
{ "t": "course", "code": "ECE 130A", "concurrent": false }  // concurrent = same quarter OK
{ "t": "and", "kids": [ … ] }                               // all required
{ "t": "or",  "kids": [ … ] }                               // any one
```

## Offering confidence → behaviour

| Value | Source | Wrong quarter |
|---|---|---|
| `scheduled` | ECE 2026-27 grid marks `X` | **blocked** |
| `historical` | ran in the Schedule of Classes 2024-26 | **blocked** |
| `uncertain` | grid says `*NO` or `TBA` | warning |
| `unknown` | no published data | warning |

## Where things live

| Need to change | File |
|---|---|
| A scheduling or degree rule | `frontend/src/utils/validation.js` |
| A degree requirement | `backend/scripts/ucsb/requirements.py` |
| A prerequisite the parser gets wrong | `backend/scripts/ucsb/overrides.py` |
| The prerequisite grammar | `backend/scripts/ucsb/prereq_parser.py` |
| Which courses are included | `backend/scripts/ucsb/build_dataset.py` |
| The plan grid | `frontend/src/pages/ScheduleBuilder.jsx` |
| A course card | `frontend/src/components/CourseCard.jsx` |
| The bottom dock | `frontend/src/components/BottomDock.jsx` |
| The plan check list | `frontend/src/components/PlanCheck.jsx` |
| The degree panel | `frontend/src/components/DegreeProgress.jsx` |
| Credit / waiver UI | `frontend/src/components/PriorCredit.jsx` |
| API shape | `backend/models/`, `backend/routes/` |

Never edit `backend/db/seed.sql` — it is generated.

## Docs

- [README.md](./README.md) — what it checks, coverage, caveats
- [SETUP.md](./SETUP.md) — install, refresh, troubleshooting
- [ARCHITECTURE.md](./ARCHITECTURE.md) — data model, validation design
- [backend/scripts/ucsb/README.md](./backend/scripts/ucsb/README.md) — data sources
