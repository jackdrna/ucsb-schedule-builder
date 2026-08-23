# Setup guide

## Just want to run the app?

```bash
cd frontend && npm install && npm run dev     # http://localhost:5173
```

That is the whole thing. The app reads the dataset from `backend/data/` (copied into
`public/data/` automatically by the `predev` hook) and needs no database and no API.
Node 18+ is the only prerequisite.

Everything below is for working on the **backend** or **regenerating the dataset**.

## Prerequisites

- Node.js 18+
- PostgreSQL 12+ — backend only
- Python 3.9+ — only if you want to refresh the UCSB data; the committed dataset
  needs nothing but Node and Postgres

## Quick start

### 1. Database

```bash
createdb schedule_builder
psql schedule_builder < backend/db/schema.sql
psql schedule_builder < backend/db/seed.sql
```

`seed.sql` loads 192 UCSB courses, 414 prerequisite edges and the EE / CE degree
requirements. It is generated — see
[Refreshing the UCSB data](#refreshing-the-ucsb-data).

Check it landed:

```bash
psql schedule_builder -c "SELECT subject, count(*) FROM courses GROUP BY 1 ORDER BY 1;"
```

```
 subject | count
---------+-------
 CHEM    |    12
 CMPSC   |    53
 ECE     |    75
 ENGR    |     2
 MATH    |    11
 MATRL   |     6
 ME      |    10
 PHYS    |    18
 PSTAT   |     1
 TMP     |     2
 WRIT    |     2
```

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env          # then set DATABASE_URL
npm start
```

`.env`:

```
PORT=5000
DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/schedule_builder
NODE_ENV=development
```

Verify:

```bash
curl http://localhost:5000/api/health
curl "http://localhost:5000/api/courses/code/ECE130A"
curl http://localhost:5000/api/programs
```

### 3. Frontend against the API

The frontend defaults to the static files, so point it at Express explicitly by
uncommenting the line in `frontend/.env`:

```
VITE_API_BASE_URL=http://localhost:5000/api
```

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. If 5173 is taken, Vite prints the port it picked —
check the terminal output. Comment the line back out to return to static mode.

## Tests

```bash
cd frontend && npm test
```

59 checks exercise `src/utils/validation.js` against the committed data files
directly — no database or server needed. They cover quarter blocking, the Summer
rules, AND/OR prerequisite resolution, concurrency, retired alternatives,
the whole-plan cascade,
the EE and CE degree audits, prior credit and prerequisite waivers, and the invariants
that no course has an unsatisfiable requirement and no program references a course
that is missing.

Run them after touching `validation.js` or regenerating the dataset. A failure in
the data-integrity tests usually means a UCSB page changed shape.

## Refreshing the UCSB data

The dataset is a snapshot: the **2025-26 General Catalog**, the **2026-27 ECE course
grid** and the **2026-27 GEAR**. When UCSB publishes new ones:

```bash
cd backend/scripts/ucsb
python fetch_catalog.py          # General Catalog
python fetch_ece_grid.py         # ECE department quarter grid
python harvest_soc.py            # Schedule of Classes (~8 minutes, be patient)
python build_dataset.py          # merge -> backend/data/ucsb-courses.json
python requirements.py           # EE / CE requirements -> ucsb-requirements.json

python review.py ECE CMPSC       # eyeball every parsed prerequisite vs the catalog

node ../generate-seed.js
psql schedule_builder < ../../db/seed.sql
cd ../../../frontend && npm test
```

Requires `pip install pypdf` if you need to re-read the GEAR PDF to check
`requirements.py` against it.

`review.py` prints each course's official prerequisite sentence next to the tree the
parser produced. Read it — that comparison is how the trees were verified, and a
parser change can silently alter a requirement.

Full details, including the source-by-source provenance and how English
prerequisites become AND/OR trees:
[backend/scripts/ucsb/README.md](./backend/scripts/ucsb/README.md).

## Development workflow

**Backend** — `npm run dev` in `backend/` for nodemon reload. Scheduling rules are
*not* here; the API only serves data.

**Frontend** — Vite HMR. All rules live in `frontend/src/utils/validation.js`, which
is pure and has no React or network dependency, so change it and run `npm test`
before touching the UI.

**Database** — after editing `schema.sql`, re-run both SQL files. `schema.sql` drops
and recreates the tables. Never edit `seed.sql` by hand; it is generated from
`backend/data/ucsb-courses.json` and `backend/data/ucsb-requirements.json`.

## Troubleshooting

**`connect ECONNREFUSED 127.0.0.1:5432`** — PostgreSQL is not running.
Windows: start the `postgresql-x64-*` service. macOS: `brew services start postgresql`.
Linux: `sudo systemctl start postgresql`.

**"Could not load courses from … Is the backend running?"** — you have
`VITE_API_BASE_URL` set but Express is down or on another port. Check
`curl http://localhost:5000/api/health`, or comment the variable out to fall back to
the static files.

**"Could not load the course data."** — static mode could not fetch
`public/data/*.json`. Run `npm run sync-data` in `frontend/`; it fails loudly if
`backend/data/` is missing the files.

**Port already in use.**

```bash
# Windows
netstat -ano | findstr :5000
taskkill /PID <PID> /F

# macOS / Linux
lsof -ti:5000 | xargs kill -9
```

Vite falls through to the next free port on its own; the backend does not — change
`PORT` in `backend/.env`.

**Empty course list, API healthy** — the seed did not load. Re-run `schema.sql` then
`seed.sql` and re-check the count query above.

**A plan looks wrong after a data refresh** — plans are stored in `localStorage` as
course codes and re-hydrated against the current course list, so a course UCSB
retires silently drops out of a saved plan. Use **Clear plan** to start over.

**A course you expected is missing from the sidebar** — you may have marked it as
prior credit, which removes it from the list. Open **Prior credit & waivers** to check.

**Resetting everything** — the app keeps seven `localStorage` keys:
`ucsb-schedule-plan-v1`, `ucsb-schedule-major-v1`, `ucsb-schedule-credit-v1`,
`ucsb-schedule-waivers-v1`, `ucsb-schedule-dock-v1`, `ucsb-schedule-summer-v1` and
`ucsb-schedule-help-v1`.
Clearing the site's storage resets all of them. **Save plan** exports the first four
to a file first, if you want them back afterwards.

**Everything in Summer says "cannot be checked"** — that is correct. No source this
app reads publishes Summer Sessions offerings, so a summer placement always warns
instead of being confirmed or refused. Prerequisite ordering is still enforced.

**A loaded plan is missing courses** — the notice names them. A plan file stores
course codes, so a course UCSB has retired since you saved drops out on load.

**Scraping a UCSB page returns 403** — some `ece.ucsb.edu` pages reject requests
without a browser `User-Agent`, and a few (the ECE Course GRID table view) require a
UCSB login. `fetch_ece_grid.py` uses the public page, which does not.

## Reference

- [README.md](./README.md) — what the app checks, coverage, API, caveats
- [ARCHITECTURE.md](./ARCHITECTURE.md) — data model, validation design, decisions
- [backend/scripts/ucsb/README.md](./backend/scripts/ucsb/README.md) — data pipeline
- [UCSB General Catalog](https://catalog.ucsb.edu/departments/ECE/courses)
- [ECE undergraduate course offerings](https://www.ece.ucsb.edu/undergrad/courses)
- [UCSB Schedule of Classes](https://my.sa.ucsb.edu/public/curriculum/coursesearch.aspx)
- [GEAR publications](https://engineering.ucsb.edu/undergraduate/academic-advising/gear-publications) - official major requirements
- [GOLD](https://my.sa.ucsb.edu/gold/login.aspx) — always the final word on offerings
