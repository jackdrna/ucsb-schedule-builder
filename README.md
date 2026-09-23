# UCSB EE / CE Schedule Builder

Plan a four-year UCSB Electrical Engineering or Computer Engineering degree and get
told, as you build it, when you have missed a prerequisite, put a course in a quarter
it is not offered, or still fall short of the major's requirements.

All course data comes from UCSB's own published sources. See
[backend/scripts/ucsb/README.md](./backend/scripts/ucsb/README.md) for the full
provenance and the refresh pipeline.

## What it checks

Drop a course into a quarter and it is refused, with the reason, if:

- **It is not offered that quarter.** ECE offerings come from the department's
  [2026-27 course grid](https://www.ece.ucsb.edu/undergrad/courses); everything else
  from three years of the
  [UCSB Schedule of Classes](https://my.sa.ucsb.edu/public/curriculum/coursesearch.aspx).
  Courses the department marks `*NO` or `TBA`, and courses with no published
  quarters, produce a **warning** rather than a block — they may still appear in GOLD.
- **A prerequisite is missing or too late.** Requirements are real AND/OR trees, so
  `ECE 146A` accepts *either* `ECE 139` or `PSTAT 120A`, and `ECE 152A` accepts
  *either* the `ECE 15A` + `ECE 10A`/`10AL` path or `CMPSC 64`. Trees are published
  only for ECE, CMPSC and the courses the majors name — the parser was verified
  against those and misreads other departments' prose, so a general education course
  shows the catalog's own prerequisite sentence and is never blocked on it.
- **The prerequisite is in the same quarter** — unless the catalog says
  "may be taken concurrently", as it does for `ECE 10AL` with `ECE 10A`.
- **The course is already in your plan**, or the quarter already holds five courses.

The whole plan is re-checked on every change, so removing `ECE 152A` immediately
flags the `ECE 154A` that depended on it. Problems appear on the card itself and in
the **Plan check** panel.

Plan check, degree progress and prior credit share one collapsible dock at the
bottom. Collapse it and the whole thing becomes a single bar carrying the summary —
problems, requirements met, overrides in force — giving the schedule the screen back.
Each panel also opens and closes on its own, and both choices are remembered.

Registration restrictions (`open to EE majors only`), class standing, consent of
instructor and minimum grades are recorded and shown on the course card, but do not
block scheduling.

## General education

The dataset carries all 1,234 GE-approved courses, across 79 subjects. The areas are
not a transcribed list — the UCSB General Catalog tags every course itself, and the
pipeline sweeps by tag, so a course newly approved for an area arrives on the next
refresh.

**Degree progress** audits the whole College of Engineering GE block: Areas A-1, A-2,
D, E, F and G, plus the Writing, Ethnicity and European Traditions / World Cultures
requirements. Two counting rules, both the GEAR's:

- A course fills **one** general area, even when it is tagged for two. 67 courses are,
  so the audit matches courses to area slots rather than counting each area alone —
  one Area E+G course cannot quietly satisfy both.
- Special areas stack. The same course counts for its general area *and* every special
  area it carries, which is why a plan can read `1/2 Area E` while that course is also
  counted for Writing and World Cultures.

`ENGR 101` counts towards the Writing requirement, as the GEAR allows, even though it
is also a major requirement and carries no catalog tag.

Two things are **not** checked, and the panel says so instead of showing a tick: the
Entry Level Writing Requirement, and American History and Institutions, which the
GEAR publishes as its own course list with no catalog tag behind it.

## Course directory modes

The directory opens on the whole catalog. A **Show** row switches it to one degree
list at a time — `EE required`, `EE electives`, `CE required`, `CE electives` — and a
**G.E.** row to one area at a time, from `A-1` through `Quantitative`. Clicking the
active chip clears it.

The required lists include the alternatives inside an "or" — `CHEM 1A or 2A or ECE 6`
puts all three on screen — because the mode is there to show what the degree can be
built from, not to pick a branch for you. Each list carries its unit minimum or area
name and a link to the source it came from.

Both families are generated from the datasets, so a third major, or a new GE area,
appears here as soon as it appears in the data. Search, subject and quarter still
apply inside the chosen list; picking a mode clears the subject filter, so the whole
list is visible rather than just its ECE half.

In the builder's sidebar the same courses sit behind a **G.E.** filter chip, and the
list renders at most 120 cards at a time — every card there is a drag source, and
1,400 of them costs a visible pause on each keystroke. The count says when it has
been capped.

## Prior credit and waivers

Two things the catalog cannot know about you, both editable from the **Prior credit
& waivers** panel and remembered in the browser:

- **Already have credit** — a course you finished *outside this plan*: AP or exam
  credit, transfer work, community college. It satisfies prerequisites anywhere,
  counts towards the degree audit, and drops out of the sidebar because it no longer
  needs a slot.
- **Waive prerequisites** — you are *taking* the course, you just do not have what
  normally comes before it: a placement test, a departmental exception, or an escape
  hatch the catalog itself offers (`CMPSC 16` ends "...or significant prior
  programming experience", which no course code can express). The course still sits
  in a term and still counts for units.

The difference matters. A waived course is in your plan, so anything depending on it
still needs it in an **earlier** quarter. Prior credit sits before the plan starts, so
it satisfies a dependant in any quarter, including the first.

| | Takes a slot | Counts units | Satisfies dependants |
|---|---|---|---|
| Already have credit | no | as prior credit | from any term |
| Waive prerequisites | yes | as planned | from the term after it |

Either way the waiver applies only to that one course, the quarter check still
applies, and a waived course stays flagged amber so the exception remains visible.

Any prerequisite error in the plan check carries a one-click **waive prerequisites**
button, which is usually where you notice you need one. A drop refused for a missing
prerequisite offers the same thing on the spot — **Waive these prereqs?** at the end
of the message records the waiver and completes the drop. It only appears when
waiving would actually let the course in: a course refused for its *quarter* is not
a prerequisite problem, and a waiver would not move it.

## Summer

The grid shows Fall, Winter and Spring by default, with an optional **Summer**
column toggled from the header. Summer sits after Spring, so a course taken in Year 1
Summer satisfies a prerequisite in Year 2 Fall.

Summer offerings are not modelled. UCSB Summer Sessions publish a separate, much
smaller catalog that none of the sources behind this app cover, so no course in the
dataset lists a summer quarter and a summer placement always **warns** rather than
being confirmed or refused. Prerequisite ordering is still enforced, since that only
depends on where the term sits. Collapsing the column empties it — a hidden course
would still count towards the totals and still satisfy prerequisites.

## Saving a plan

**Save plan** downloads the plan, your major, your prior credit and your waivers as
`ucsb-plan-YYYY-MM-DD.json`; **Load plan** reads one back. The file holds course
codes, so it survives a data refresh the same way the browser-stored plan does: a
course UCSB has retired since you saved drops out and is named in the notice rather
than loading as a broken card.

## Degree progress

Pick **EE** or **CE** and the builder audits the plan against the major's published
requirements, from the College of Engineering's
[2026-27 GEAR](https://engineering.ucsb.edu/undergraduate/academic-advising/gear-publications)
sheet and the department track pages:

- **Required courses** — preparation for the major and upper division, with
  alternatives resolved properly (`CHEM 1A or 2A or ECE 6`, `MATH 2A-B or 3A-B`, the
  `CMPSC 189A-B` / `ECE 189A-B-C` capstone routes). Unmet rows say what to add.
- **Approved electives** — 36 units for both majors, counted only from each major's
  approved list, and never double-counting a course already used for a requirement.
- **Depth** — EE needs 1 of 9 [tracks](https://www.ece.ucsb.edu/undergrad/curriculum);
  CE needs 2 of 12
  [senior elective sequences](https://www.ce.ucsb.edu/undergrad/curriculum/senior-elective-sequences).
  Partly finished ones show progress and the courses that would complete them.

- **General education** — the nine-area College of Engineering block, described
  above.

Free electives are not modelled, so a plan that meets every requirement above can
still sit under the 189 (EE) / 191 (CE) units needed to graduate.

## Coverage

1,434 courses:

- All planable undergraduate **ECE** (75), **CMPSC** (53) and **TMP** (32).
- The **MATH**, **PHYS**, **CHEM**, **ENGR**, **PSTAT**, **MATRL**, **ME** and
  **WRIT** courses the majors require or accept as electives, or that appear in an
  ECE/CMPSC prerequisite.
- All **1,234 general education** courses, across 79 subjects.

Seminars, internships, independent study and ad-hoc special topics are left out —
they cannot be planned on a grid.

Quarter offerings are only harvested for the eight original subjects, so most GE
courses carry no confirmed quarter and warn rather than block when placed. Extending
`harvest_soc.py`'s `SUBJECTS` fixes that, at roughly an hour of scraping.

## Quick start

The app is static and reads its dataset from files, so this is all you need:

```bash
cd frontend && npm install && npm run dev     # http://localhost:5173
```

No database, no API, no configuration. The Postgres backend exists only to
regenerate the dataset and to serve it during API work — see
[SETUP.md](./SETUP.md) if you need it.

## Deploying

`npm run build` in `frontend/` produces a fully static `dist/` — there is no server
to run and nothing to pay for. All the scheduling logic already lives in the browser
(`src/utils/validation.js`), and the dataset ships as two JSON files, so the app is
identical with or without the backend.

Pushing to `main` runs [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml),
which runs the validation suite, builds, and publishes to GitHub Pages. A failing
test stops the deploy. Enable it once under **Settings → Pages → Source →
GitHub Actions**.

The whole site is about **160 kB gzipped**, including the course data. Against
GitHub Pages' 100 GB/month soft bandwidth limit that is roughly 660,000 fresh visits
a month, before caching.

Two deliberate choices make the build portable:

- `base: './'` in `vite.config.js` — relative asset paths, so it runs from any
  subdirectory without the build knowing the repository name.
- `HashRouter` — static hosts cannot rewrite unknown paths to `index.html`, so
  routing lives in the URL fragment and deep links survive a refresh. The cost is a
  `#` in the URL; `App.jsx` documents how to move to clean URLs.

## Tests

```bash
node frontend/src/utils/validation.test.mjs   # or: cd frontend && npm test
```

70 checks run the validator against the real dataset — quarter blocking, the Summer
rules, AND/OR resolution, concurrency, retired alternatives, the cascade when a
prerequisite is removed, degree auditing for both majors, prior credit and waivers,
the general education block including the one-course-one-area rule, and the
assertions that no course has an impossible requirement, that no course outside the
verified subjects carries a prerequisite tree, and that no program references a
course that is missing. One test builds a complete four-year EE plan and asserts it
is both legal and sufficient for the major.

## Tech stack

**Backend** — Express 5, PostgreSQL (`pg`), CORS, dotenv.
**Frontend** — React 18, Vite, React Router, react-beautiful-dnd, Axios, plain CSS.
**Data pipeline** — Python 3 (standard library, plus `pypdf` to read the GEAR).

## API

| Endpoint | Returns |
|---|---|
| `GET /api/courses` | every course with its prerequisite tree, quarters and sources |
| `GET /api/courses/:id` | one course |
| `GET /api/courses/code/:code` | one course by code — `ECE 130A` or `ECE130A` |
| `GET /api/courses/:id/all-prerequisites` | the full transitive prerequisite chain |
| `GET /api/courses/sources` | the UCSB sources behind the data |
| `GET /api/programs` | EE and CE degree requirements |
| `GET /api/programs/:code` | one program — `EE` or `CE` |
| `GET /api/health` | `{"status":"OK"}` |

```json
{
  "code": "ECE 146A",
  "title": "Digital Communication Fundamentals",
  "units": 5,
  "prereq_raw": "ECE 130A-B with a minimum grade of C-; ECE 139 or PSTAT 120A; open to CE & EE majors only.",
  "prereq_tree": {
    "t": "and",
    "kids": [
      { "t": "course", "code": "ECE 130A", "concurrent": false },
      { "t": "course", "code": "ECE 130B", "concurrent": false },
      { "t": "or", "kids": [
        { "t": "course", "code": "ECE 139", "concurrent": false },
        { "t": "course", "code": "PSTAT 120A", "concurrent": false }
      ]}
    ]
  },
  "prereq_notes": ["open to CE & EE majors only", "with a minimum grade of C-"],
  "offered_quarters": ["Fall"],
  "offering_confidence": "scheduled",
  "offering_source": "ECE Undergraduate Courses 2026-27 grid",
  "catalog_url": "https://catalog.ucsb.edu/courses/ECE%20146A"
}
```

## Project layout

```
schedule-builder/
├── backend/
│   ├── server.js
│   ├── routes/            courses.js, programs.js
│   ├── models/            Course.js, Program.js
│   ├── data/
│   │   ├── ucsb-courses.json        # the merged UCSB course dataset
│   │   └── ucsb-requirements.json   # EE / CE degree requirements
│   ├── db/
│   │   ├── schema.sql
│   │   └── seed.sql                 # generated from the two data files
│   └── scripts/
│       ├── generate-seed.js
│       └── ucsb/                    # the UCSB scraping + parsing pipeline
└── frontend/src/
    ├── pages/MasterPage.jsx         # course directory, degree-list and G.E. modes
    ├── pages/ScheduleBuilder.jsx    # 4 years x Fall/Winter/Spring(+Summer)
    ├── components/CourseCard.jsx
    ├── components/BottomDock.jsx     # one collapse for all three panels
    ├── components/PlanCheck.jsx
    ├── components/DegreeProgress.jsx
    ├── components/PriorCredit.jsx
    └── utils/
        ├── validation.js            # all scheduling and degree rules
        └── validation.test.mjs
```

