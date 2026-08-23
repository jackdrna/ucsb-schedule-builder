# UCSB data pipeline

Everything in `backend/data/ucsb-courses.json` is derived from UCSB's own published
sources. Nothing is hand-entered except the prerequisite trees listed in
`overrides.py`, and each of those records the catalog sentence it came from.

## Sources

| What | Source | Why this one |
|---|---|---|
| Course titles, units, descriptions, **official prerequisite text**, registration restrictions | **UCSB General Catalog 2025-26** — `catalog.ucsb.edu` (Coursedog API) | The catalog is the authority on prerequisites. |
| **ECE quarter offerings** | **ECE Undergraduate Courses 2026-27 grid** — [www.ece.ucsb.edu/undergrad/courses](https://www.ece.ucsb.edu/undergrad/courses) | The department's own forward-looking plan for the coming year, including `*NO` / `TBA` markings. |
| Quarter offerings for every other department | **UCSB Schedule of Classes**, Fall 2024 – Fall 2026 — [my.sa.ucsb.edu/public/curriculum](https://my.sa.ucsb.edu/public/curriculum/coursesearch.aspx) | Neither CS nor Math publishes a forward grid, so three years of what actually ran is the best available signal. |
| **EE / CE major requirements** | **GEAR 2026-27** — [engineering.ucsb.edu GEAR publications](https://engineering.ucsb.edu/undergraduate/academic-advising/gear-publications), pp. 20-21 (CE) and 24-25 (EE) | The College of Engineering's official requirement sheets and four-year plans. |
| **EE tracks** | [ece.ucsb.edu/undergrad/curriculum](https://www.ece.ucsb.edu/undergrad/curriculum) | The nine depth tracks and their course lists; the GEAR defers to the department for these. |
| **CE senior elective sequences** | [ce.ucsb.edu/.../senior-elective-sequences](https://www.ce.ucsb.edu/undergrad/curriculum/senior-elective-sequences) | The twelve sequences and their coursework. |

The two offering sources were cross-checked against each other: for the 72 ECE
courses present in both, they agree on every course except ECE 179P, a new course
the department grid schedules for Winter 2027 but that has no matching history.

## Running it

```bash
cd backend/scripts/ucsb

python fetch_catalog.py          # -> catalog_all.json    (General Catalog)
python fetch_ece_grid.py         # -> ece_offerings.json  (ECE department grid)
python harvest_soc.py            # -> soc_offerings.json  (Schedule of Classes, ~8 min)
python build_dataset.py          # -> backend/data/ucsb-courses.json
python requirements.py           # -> backend/data/ucsb-requirements.json

node ../generate-seed.js         # -> backend/db/seed.sql
psql schedule_builder < ../../db/seed.sql
```

The two build steps write straight into `backend/data/`, so there is nothing to copy.

`requirements.py` prints how many courses each program references and names any that
are missing from the dataset. That check is what caught `ENGR 101`, `CMPSC 41` and the
MATRL / TMP electives being absent from an earlier build.

`catalog_all.json` is a multi-megabyte raw scrape and is git-ignored, so the first step
is required on a fresh checkout. `ece_offerings.json` and `soc_offerings.json` are
kept — the latter because it costs eight minutes to rebuild.

Two things worth knowing before re-running: the catalog id in `fetch_catalog.py`
pins the 2025-26 General Catalog and will need updating when UCSB publishes a new
one, and `harvest_soc.py`'s `QUARTERS` map lists the terms the public Schedule of
Classes exposes, which rolls forward over time.

Re-run `python review.py ECE CMPSC` after any parser change: it prints each
course's official prerequisite sentence next to the tree the parser produced, which
is how the trees were verified in the first place.

Then confirm nothing regressed:

```bash
node frontend/src/utils/validation.test.mjs
```

## How prerequisites are turned into rules

`prereq_parser.py` converts the catalog's English into an AND/OR tree:

```
"ECE 130A-B with a minimum grade of C-; ECE 139 or PSTAT 120A; open to CE & EE majors only."

  {"t":"and","kids":[
     {"t":"course","code":"ECE 130A","concurrent":false},
     {"t":"course","code":"ECE 130B","concurrent":false},
     {"t":"or","kids":[{"code":"ECE 139"},{"code":"PSTAT 120A"}]}]}
```

Binding order, tightest first:

1. **series and lecture/lab atoms** — `ECE 10A-B-C` expands to three courses;
   `PHYS 5/PHYS 5L` is a lecture with its lab, so it becomes an AND, while
   `Mathematics 2A/3A` is two alternatives, so it becomes an OR
2. **`or`** — alternatives within one requirement
3. **`,` / `and` / `&`** — separate requirements
4. **`;` and sentence breaks** — separate requirements; a leading `; or` turns
   everything before it into an alternative

Handled along the way: `(may be taken concurrently)` sets a per-course flag and
propagates across the alternation it terminates; `Co-requisite:` implies
concurrency; `Mathematics 4A (or 4AI)` un-parenthesises to an OR; AP exam scores
and placement-test clauses are stripped so their numbers are not read as course
numbers.

Clauses that are requirements but not course prerequisites — `open to EE majors
only`, `upper-division standing`, `consent of instructor`, `with a minimum grade of
C-` — are pulled out into `prereq_notes` and never block scheduling.

### Retired courses

The catalog still lists alternatives UCSB no longer offers (ECE 2A-B-C, ECE 124A/B,
MATH 3C, MATH 5A-B-C, CMPSC 20/30/48/56/60). They stay in the trees, because
dropping them would silently change the requirement, but they can never be
satisfied. Every one sits inside an OR alongside a live alternative — a test
asserts no course ends up with an impossible requirement.

## Offering confidence

`build_dataset.py` records how much to trust each course's quarters, and the
validator uses it to decide between blocking and warning:

| `offering_confidence` | Means | Wrong quarter |
|---|---|---|
| `scheduled` | ECE grid marks an `X` for 2026-27 | hard block |
| `historical` | Ran at least once in the Schedule of Classes, 2024-2026 | hard block |
| `uncertain` | ECE grid says `*NO` or `TBA` for 2026-27 | warn only |
| `unknown` | No published quarter data found | warn only |

`X`, `XD` (taught by another department's instructor) and `X (PS)` / `X (DS)` all
count as offered.

## Degree requirements

`requirements.py` holds the EE and CE requirement specs, transcribed by hand from the
GEAR PDF and the department track pages, with the page number or URL for each. They
are hand-written because UCSB publishes them as a PDF and a set of prose pages, not as
anything queryable — `pypdf` reads the PDF well enough to check the transcription
against, which is how `ECE 51` was caught as a footnote artifact (it is `ECE 5` with
superscript `1`, not a course).

Required courses reuse the same AND/OR tree shape as prerequisites, so the frontend
evaluates both with one walker. Tracks and sequences use a small rule form:

```python
rule_all("ECE 154A", "ECE 154B")                    # both needed
rule_at_least(4, "ECE 133", "ECE 157A", "ECE 180")  # any 4 of these
rule_all(["ECE 122A", "ECE 123"], "ECE 122B")       # 122A or 123, plus 122B
```

An option is satisfied if *any* of its codes is in the plan, which is how
cross-listings (`ECE 181` / `CMPSC 181`) and either-or requirements work.

### Courses the catalog does not have yet

`NEW_COURSES` in `build_dataset.py` carries courses the 2026-27 GEAR requires that the
2025-26 catalog does not list — currently just `CMPSC 41`, new for CE in place of
`CMPSC 40`. They cite the department page as their source, get no invented
prerequisites, and land at `unknown` offering confidence so they warn rather than
block. Delete the entry once UCSB publishes a 2026-27 catalog and the scrape picks the
course up on its own.
