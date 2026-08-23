# Frontend

React + Vite app for planning a UCSB EE / CE degree. All scheduling rules live here,
in `src/utils/validation.js` — the backend only serves data.

## Setup

```bash
npm install
npm run dev        # http://localhost:5173 (Vite picks the next free port if taken)
```

No backend needed: `predev` copies the dataset from `backend/data/` into
`public/data/`, and `api.js` reads it from there. Set `VITE_API_BASE_URL` in `.env`
only if you want to run against the Express API instead:

```
VITE_API_BASE_URL=http://localhost:5000/api
```

Other scripts:

```bash
npm test           # 59 validation checks against the real dataset
npm run build
npm run preview
npm run lint
```

## Layout

```
frontend/src/
├── components/
│   ├── CourseCard.jsx          # one course; compact / default / detail densities
│   ├── CourseCard.css
│   ├── BottomDock.jsx          # one collapse for the three panels below
│   ├── BottomDock.css
│   ├── PlanCheck.jsx           # errors and warnings, with inline waive
│   ├── PlanCheck.css
│   ├── DegreeProgress.jsx      # major requirements vs the plan
│   ├── DegreeProgress.css
│   ├── PriorCredit.jsx         # prior credit + prerequisite waivers
│   └── PriorCredit.css
├── pages/
│   ├── MasterPage.jsx          # course directory, search + subject/quarter filters
│   ├── MasterPage.css
│   ├── ScheduleBuilder.jsx     # 4 years x Fall/Winter/Spring(+Summer), drag-drop
│   └── ScheduleBuilder.css
├── styles/globals.css          # theme variables
├── utils/
│   ├── api.js                  # static JSON by default, Express if opted in
│   ├── validation.js           # ALL scheduling + degree rules -- pure, no React
│   └── validation.test.mjs     # runs against backend/data/*.json
├── App.jsx                     # routing
└── main.jsx
```

## Validation

`src/utils/validation.js` is pure — no React, no network — so it is tested directly
against the committed dataset. Three entry points:

- **`validatePlacement(course, term, schedule, catalog)`** — one drop. Checks
  duplicates, the five-course cap, prerequisites, then quarter availability.
  Returns `{ allowed, status, message }`.
- **`validatePlan(schedule, catalog)`** — every placement in the plan, on every
  change. This is what makes a *removal* surface a problem: take `ECE 152A` out and
  the `ECE 154A` that depended on it is flagged immediately. Returns issues keyed by
  course code, which cards read directly.
- **`auditDegree(schedule, program)`** - progress towards a major, given a program
  from `/api/programs`. A completion check, not a sequencing one, so a required course
  counts wherever it sits; `validatePlan` already polices ordering. Reports required
  courses (with the cheapest branch to finish an unmet `or`), approved-elective units
  that a required slot has not already consumed, and per-track progress.

All three take an `options` object carrying the per-student overrides:

```javascript
{ priorCredit: Set|Array,    // courses already completed
  prereqWaivers: Set|Array,  // courses whose prerequisites are not enforced
  catalog: Map }             // auditDegree only, to look up credited units
```

Prior credit is modelled as a placement at term index `-1`, before the plan starts, so
it satisfies every deadline including a concurrent one, with no special case in the
tree walker. A waiver short-circuits `checkPrerequisites` for that one course and
downgrades it to a `warning`, so the exception stays visible rather than vanishing.
Omitting `options` changes nothing — a test asserts that.

### Terms

16 term keys, `Y1-Fall` … `Y4-Summer`. `termIndex()` maps a key to an absolute
position (0–15) so ordering comparisons work across year boundaries. Summer sits
after Spring, so a course taken in Year 1 Summer satisfies a prerequisite in Year 2
Fall.

The Summer column is collapsed by default and toggled from the header. Collapsing it
empties those four terms, because a hidden course would still count towards the unit
totals and still satisfy prerequisites.

No source this app reads publishes summer offerings — the General Catalog, the ECE
grid and the Schedule of Classes harvest are all Fall/Winter/Spring — so no course
in the dataset lists a summer quarter, and `checkOffering()` always *warns* for
Summer rather than blocking. Blocking on that absence would refuse every confirmed
course from Summer Sessions, which do run. A test asserts the dataset still has no
summer data, so this decision fails loudly if UCSB starts publishing it.

### Errors vs warnings

| | Meaning | Effect |
|---|---|---|
| `error` | breaks a published requirement | drop refused |
| `warning` | cannot be confirmed legal | drop allowed, flagged |

A wrong quarter is only an error when UCSB publishes the course's quarters. When the
ECE department grid says `*NO`/`TBA`, or nothing is published, it warns — the course
may still appear in GOLD.

### Prerequisites

Requirements are AND/OR trees, not flat lists, so `ECE 146A` accepts *either*
`ECE 139` or `PSTAT 120A`. A prerequisite must sit in an earlier term unless the
catalog marked it `concurrent`, as with `ECE 10AL` and `ECE 10A`. Failure messages
name only what a student can act on:

```
ECE 137A needs ECE 10B and ECE 10C and (ECE 10BL and ECE 10CL)
  and ECE 130A and ECE 132 before Year 3 Winter.
```

Major restrictions, class standing, consent of instructor and minimum grades arrive
in `prereq_notes`. They are displayed but never block a drop — the app does not know
your grades or your declared major.

## State

```javascript
schedule = { 'Y1-Fall': [courseRow, …], …, 'Y4-Summer': [ … ] }   // max 5 per term
```

The selected major, prior credit, waivers, whether the bottom dock is collapsed,
whether Summer is showing and whether the help popup has been seen are kept
separately in `ucsb-schedule-major-v1`, `ucsb-schedule-credit-v1`,
`ucsb-schedule-waivers-v1`, `ucsb-schedule-dock-v1`, `ucsb-schedule-summer-v1` and
`ucsb-schedule-help-v1`.
Marking a scheduled course as prior credit also removes it from the plan, since it
cannot be both.

Persisted to `localStorage` (`ucsb-schedule-plan-v1`) as course *codes* only, then
re-hydrated against the freshly fetched course list — so refreshing the UCSB data
updates a saved plan rather than freezing stale rows into it.

### Save and load

**Save plan** downloads the whole of that state — plan, major, prior credit and
waivers — as `ucsb-plan-YYYY-MM-DD.json`, and **Load plan** reads one back. The file
stores course codes and goes through the same hydration as the `localStorage` plan,
so a course UCSB has retired since the file was written drops out and is named in
the notice rather than becoming a broken card. A file claiming both credit and a
scheduled slot for one course keeps the credit and gives up the slot, preserving the
invariant the UI enforces. Waivers travel with the plan deliberately: a plan can
depend on one to be valid, so loading without them would show phantom errors.

`validatePlan` runs in a `useMemo` keyed on `[schedule, catalog]`, so the plan-check
list, the per-card badges and the status counts can never disagree.

## Bottom dock

`BottomDock` wraps `PlanCheck`, `DegreeProgress` and `PriorCredit` behind one master
collapse. Collapsed it renders a single ~35px bar carrying the counts that matter and
unmounts the panels, so the grid reclaims the height; expanded, each panel keeps its
own toggle. The dock owns the scrolling — the panels' individual `max-height` rules
are neutralised inside it, so there is one scroll region rather than three.

## Drag and drop

`react-beautiful-dnd`. Draggable ids are `course:<CODE>`; droppable ids are the term
keys, plus `sidebar-courses`. Dropping a card back on the sidebar removes it from the
plan. A move *within* the plan is validated against the plan with that course already
lifted out, so a course cannot block its own move.

## API

`src/utils/api.js`:

```javascript
fetchAllCourses()               // every course with prereq trees and offerings
fetchCourseById(id)
fetchCourseByCode(code)         // 'ECE 130A' or 'ECE130A'
getAllPrerequisites(courseId)   // full transitive chain
fetchSources()                  // the UCSB sources behind the data
fetchPrograms()                 // EE and CE degree requirements
fetchProgram(code)              // one program -- 'EE' or 'CE'
```

## Styling

Plain CSS with variables in `styles/globals.css`. Note that `index.css` sets
`text-align: center` on the body; the card, filter and plan-check styles override it
locally rather than changing that global.

Card colour is hashed from the course code, so a course looks the same everywhere.
Validation state overrides the border and background: red for an error, amber for a
warning.

## Help

`components/HelpDialog.jsx` exports one self-contained `<Help />` that both pages
render: it opens itself on a visitor's first arrival and leaves a **?** button in the
bottom right afterwards. It owns its own state and its own `localStorage` flag, so a
page adds help by rendering it and nothing else, and a new visitor is greeted once
rather than once per page. In the builder it is rendered inside `.schedule-layout`
and re-anchored there, so it stays clear of the bottom dock at any dock height.

## Troubleshooting

**"Could not load courses from … Is the backend running?"** — you have set
`VITE_API_BASE_URL`; start the backend or comment it out to use the static files.

**"Could not load the course data."** — static mode could not fetch
`public/data/*.json`. Run `npm run sync-data`.

**Wrong port** — Vite falls through to 5174, 5175… when 5173 is busy. Read the
terminal output.

**A saved plan lost a course** — plans re-hydrate by code, so a course removed from
the dataset drops out. Use **Clear plan**.

**A course vanished from the sidebar** — it is probably marked as prior credit, which
hides it. Check the **Prior credit & waivers** panel.

**`npm run lint` reports `'React' is defined but never used`** — pre-existing across
the whole app; the ESLint config predates the automatic JSX runtime.
