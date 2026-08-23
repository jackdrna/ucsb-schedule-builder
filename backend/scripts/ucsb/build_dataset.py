"""Merge every UCSB source into one dataset for the schedule builder.

Sources
  catalog_all.json    UCSB General Catalog 2025-2026  (catalog.ucsb.edu, Coursedog API)
                      -> titles, units, descriptions, official prerequisite text
  ece_offerings.json  ECE Undergraduate Courses 2026-27 grid (www.ece.ucsb.edu/undergrad/courses)
                      -> authoritative forward-looking ECE quarter offerings
  soc_offerings.json  UCSB Schedule of Classes, Fall 2024 - Fall 2026 (my.sa.ucsb.edu)
                      -> actual historical offerings for every other subject

Output: backend/data/ucsb-courses.json
"""
import json, os, re, urllib.parse

from prereq_parser import parse, render, codes_in
from overrides import PREREQ_OVERRIDES

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data")
OUT = os.path.join(DATA_DIR, "ucsb-courses.json")

CATALOG_URL = "https://catalog.ucsb.edu/courses/"
GRID_URL = "https://www.ece.ucsb.edu/undergrad/courses"
SOC_URL = "https://my.sa.ucsb.edu/public/curriculum/coursesearch.aspx"
CATALOG_NAME = "UCSB General Catalog 2025-26"

QUARTER_CODES = {"20244": "Fall", "20251": "Winter", "20252": "Spring",
                 "20254": "Fall", "20261": "Winter", "20262": "Spring",
                 "20264": "Fall"}
ORDER = ["Fall", "Winter", "Spring"]

# Course families that cannot be planned on a grid: independent study,
# internships, research credit, apprenticeships, ad-hoc special topics.
UNPLANNABLE = re.compile(r"^(92|94[A-Z]*|96[A-Z]*|99|100|190[A-Z]*|192|193|194[A-Z]*|196[A-Z]*|199|90[A-Z]*|95|11[A-Z]{2})$")

# Courses the EE / CE majors require or accept, per the 2026-27 GEAR major
# requirement sheets (engineering.ucsb.edu GEAR, pp. 20 and 24), plus the
# alternatives that ECE/CMPSC prerequisites name.
SUPPORT_SEEDS = [
    "MATH 2A", "MATH 2B", "MATH 3A", "MATH 3B", "MATH 3C", "MATH 4A", "MATH 4AI",
    "MATH 4B", "MATH 4BI", "MATH 5A", "MATH 5B", "MATH 5C", "MATH 6A", "MATH 6AI",
    "MATH 6B", "MATH 8", "MATH 3AH", "MATH 3BH",
    "PHYS 1", "PHYS 2", "PHYS 3", "PHYS 4", "PHYS 5", "PHYS 5L", "PHYS 6",
    "PHYS 7A", "PHYS 7B", "PHYS 7C", "PHYS 7D", "PHYS 7L",
    "PHYS 23", "PHYS 24", "PHYS 25", "PHYS 103", "PHYS 105A",
    "CHEM 1A", "CHEM 1AL", "CHEM 1B", "CHEM 1BL", "CHEM 1C", "CHEM 1CL",
    "CHEM 2A", "CHEM 2B", "CHEM 2C",
    # ENGR 101 (Ethics in Engineering) is required by both majors.
    "ENGR 3", "ENGR 101", "PSTAT 120A", "PSTAT 121A",
    "WRIT 2", "WRIT 50", "WRIT 105E", "WRIT 107E",
    # Approved EE departmental electives outside ECE (GEAR p. 24).
    "MATRL 100A", "MATRL 100B", "MATRL 100C", "MATRL 101",
    "MATRL 162A", "MATRL 162B", "TMP 120", "TMP 122",
]

# Courses the 2026-27 GEAR requires that the 2025-26 General Catalog does not yet
# list, and that have not appeared in the Schedule of Classes. UCSB has not
# published a 2026-27 catalog, so there is no catalog entry to scrape; these are
# transcribed from the department's own pages and carry that as their source.
# Prerequisites are deliberately left empty rather than guessed.
NEW_COURSES = {
    "CMPSC 41": {
        "title": "Discrete Mathematics for Computer Science",
        "units": 4.0,
        "description": (
            "Introduces the mathematical foundations of computer science, including "
            "logic, set theory, functions, counting, induction, recursion and proof "
            "techniques, with a focus on applying these concepts to computational "
            "problems."
        ),
        "college": "College of Engineering",
        "source": "UCSB GEAR 2026-27 (Computer Engineering, p. 20) and "
                  "ce.ucsb.edu/undergrad/curriculum",
        "source_url": "https://www.ce.ucsb.edu/undergrad/curriculum",
        "note": "New for 2026-27. Required for Computer Engineering, in place of "
                "CMPSC 40. Not yet in the General Catalog, so it has no published "
                "prerequisites or quarter offerings here -- check GOLD.",
    },
}


def cnum(course):
    return (course.get("courseNumber") or "").upper()


def sort_key(code):
    m = re.match(r"([A-Z ]+?)\s*(\d+)([A-Z]*)$", code)
    if not m:
        return (code, 0, "")
    return (m.group(1), int(m.group(2)), m.group(3))


# --------------------------------------------------------------- load sources
catalog = json.load(open("catalog_all.json", encoding="utf-8"))

by_code = {}
for subj, rows in catalog.items():
    for c in rows:
        if c.get("status") != "Active":
            continue
        n = cnum(c)
        m = re.match(r"(\d+)", n)
        if not m or int(m.group(1)) >= 200:      # undergraduate only
            continue
        code = f"{subj} {n}"
        prev = by_code.get(code)
        # keep the most recently effective version of a course
        if prev is None or (c.get("effectiveStartDate") or "") > (prev.get("effectiveStartDate") or ""):
            by_code[code] = c

soc = json.load(open("soc_offerings.json", encoding="utf-8"))
grid_rows = json.load(open("ece_offerings.json", encoding="utf-8"))[1:]


# ------------------------------------------------- ECE department grid parsing
def parse_grid():
    """-> {code: {"quarters": [...], "flags": [...]}} from the 2026-27 ECE grid."""
    out = {}
    for row in grid_rows:
        numbers = [n.strip() for n in row[0].split("/") if n.strip()]
        cells = [row[2].strip(), row[3].strip(), row[4].strip()]   # F, W, S
        quarters, flags = [], []
        for q, cell in zip(ORDER, cells):
            if not cell:
                continue
            up = cell.upper()
            if up.startswith("*NO"):
                flags.append(f"ECE department grid marks {q} 2026-27 as not offered")
            elif "TBA" in up:
                flags.append(f"ECE department grid lists {q} 2026-27 as TBA")
            else:
                # 'X', 'XD' (external-dept instructor), 'X (PS)', 'X (DS)'
                quarters.append(q)
        for n in numbers:
            out[f"ECE {n}"] = {"quarters": quarters, "flags": flags}
    return out


grid = parse_grid()


def soc_quarters(code):
    rec = soc.get(code)
    if not rec:
        return []
    qs = {QUARTER_CODES[q] for q in rec["quarters"] if q in QUARTER_CODES}
    return [q for q in ORDER if q in qs]


def offering_for(code):
    """Resolve quarter offerings + how much we trust them."""
    g = grid.get(code)
    hist = soc_quarters(code)

    if g and g["quarters"]:
        return {
            "quarters": g["quarters"],
            "confidence": "scheduled",
            "source": "ECE Undergraduate Courses 2026-27 grid",
            "source_url": GRID_URL,
            "notes": g["flags"],
        }
    if g and g["flags"]:
        # Marked *NO or TBA for 2026-27: fall back to history, never hard-block.
        return {
            "quarters": hist,
            "confidence": "uncertain",
            "source": "ECE Undergraduate Courses 2026-27 grid + Schedule of Classes history",
            "source_url": GRID_URL,
            "notes": g["flags"],
        }
    if hist:
        return {
            "quarters": hist,
            "confidence": "historical",
            "source": "UCSB Schedule of Classes, Fall 2024 - Fall 2026",
            "source_url": SOC_URL,
            "notes": [],
        }
    if g is not None:
        return {
            "quarters": [], "confidence": "uncertain",
            "source": "ECE Undergraduate Courses 2026-27 grid",
            "source_url": GRID_URL,
            "notes": ["Listed in the ECE department grid with no quarter marked for 2026-27"],
        }
    return {
        "quarters": [], "confidence": "unknown",
        "source": "no published quarter data found",
        "source_url": SOC_URL,
        "notes": ["No offering found in the ECE 2026-27 grid or in the "
                  "Schedule of Classes for Fall 2024 - Fall 2026"],
    }


# ------------------------------------------------------------ choose the roster
def is_planable(code):
    subj, n = code.rsplit(" ", 1)
    return not UNPLANNABLE.match(n)


roster = set()
for code in by_code:
    subj = code.rsplit(" ", 1)[0]
    if subj in ("ECE", "CMPSC") and is_planable(code):
        roster.add(code)
roster |= {c for c in SUPPORT_SEEDS if c in by_code}

# Pull in anything named by a prerequisite of a rostered course (transitively).
prereq_cache = {}


def prereq_of(code):
    if code in prereq_cache:
        return prereq_cache[code]
    c = by_code.get(code)
    raw = ""
    if c:
        raw = ((c.get("requisites") or {}).get("requisitesFreeform") or {}).get("value") or ""
    tree, notes, clean_raw = parse(raw)
    if code in PREREQ_OVERRIDES:
        ov = PREREQ_OVERRIDES[code]
        tree = ov["tree"]
        notes = notes + [f"[curated] {ov['why']}"]
    prereq_cache[code] = (tree, notes, clean_raw)
    return prereq_cache[code]


for _ in range(6):
    added = False
    for code in list(roster):
        tree, _n, _r = prereq_of(code)
        for ref in codes_in(tree):
            if ref not in roster and ref in by_code:
                roster.add(ref)
                added = True
    if not added:
        break


# ------------------------------------------------------------------ emit rows
courses = []
for code in sorted(roster, key=sort_key):
    c = by_code[code]
    subj, n = code.rsplit(" ", 1)
    tree, notes, raw = prereq_of(code)
    off = offering_for(code)
    credits = (c.get("credits") or {})
    units = credits.get("numberOfCredits")
    if units is None:
        units = (credits.get("creditHours") or {}).get("min")
    majors = ((c.get("customFields") or {}).get("theseMajorsCanRegister")) or []

    courses.append({
        "code": code,
        "subject": subj,
        "number": n,
        "title": (c.get("longName") or c.get("name") or "").strip(),
        "short_title": (c.get("name") or "").strip(),
        "units": float(units) if units is not None else None,
        "description": (c.get("description") or "").strip(),
        "college": c.get("college") or "",
        "restricted_majors": majors,
        "prereq_raw": raw,
        "prereq_tree": tree,
        "prereq_notes": notes,
        "offered_quarters": off["quarters"],
        "offering_confidence": off["confidence"],
        "offering_notes": off["notes"],
        "offering_source": off["source"],
        "offering_source_url": off["source_url"],
        "catalog_source": CATALOG_NAME,
        "catalog_url": CATALOG_URL + urllib.parse.quote(code),
    })

# Courses the 2026-27 GEAR requires but the published catalog does not carry yet.
for code, extra in NEW_COURSES.items():
    if code in {c["code"] for c in courses}:
        continue                      # a newer catalog now lists it -- prefer that
    subj, n = code.rsplit(" ", 1)
    off = offering_for(code)
    courses.append({
        "code": code,
        "subject": subj,
        "number": n,
        "title": extra["title"],
        "short_title": extra["title"],
        "units": extra["units"],
        "description": extra["description"],
        "college": extra.get("college", ""),
        "restricted_majors": [],
        "prereq_raw": "",
        "prereq_tree": None,
        "prereq_notes": [f"[new course] {extra['note']}"],
        "offered_quarters": off["quarters"],
        "offering_confidence": off["confidence"],
        "offering_notes": off["notes"] + [extra["note"]],
        "offering_source": extra["source"],
        "offering_source_url": extra["source_url"],
        "catalog_source": extra["source"],
        "catalog_url": extra["source_url"],
    })
courses.sort(key=lambda c: sort_key(c["code"]))

json.dump(courses, open(OUT, "w", encoding="utf-8"), indent=1)

# ------------------------------------------------------------------- summary
print(f"{len(courses)} courses -> {os.path.relpath(OUT)}")
from collections import Counter
print("by subject :", dict(Counter(c["subject"] for c in courses)))
print("offering   :", dict(Counter(c["offering_confidence"] for c in courses)))
print("with prereq:", sum(1 for c in courses if c["prereq_tree"]))
known = {c["code"] for c in courses}
missing = Counter()
for c in courses:
    for ref in codes_in(c["prereq_tree"]):
        if ref not in known:
            missing[ref] += 1
if missing:
    print("prereq refs not in roster (retired/other-dept):", dict(missing))
