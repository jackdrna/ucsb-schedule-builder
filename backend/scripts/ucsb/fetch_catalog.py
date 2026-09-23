"""Pull official UCSB General Catalog course data from catalog.ucsb.edu (Coursedog API).

Writes catalog_all.json, which build_dataset.py reads. The file is a multi-megabyte
raw scrape and is git-ignored, so run this on a fresh checkout before building.

CATALOG_ID pins a catalog year. To check whether UCSB has published a newer one:

    curl -s -H 'Origin: https://catalog.ucsb.edu' \
      'https://app.coursedog.com/api/v1/catalogs/urls?url=catalog.ucsb.edu' \
      | python -c 'import json,sys; d=json.load(sys.stdin)["catalog"]; \
                   print(d["displayName"], d["_id"])'
"""
import json, urllib.request, sys

CATALOG_ID = "mZXlGvYb30h2fSq3aYLn"  # 2025-2026 General Catalog
EFFECTIVE = "2025-09-01,2026-08-31"  # must match the catalog year above
BASE = "https://app.coursedog.com/api/v1/cm/ucsb/courses/search/%24filters"

# ECE and CMPSC are the majors; the rest are required courses, approved electives,
# or alternatives that ECE/CMPSC prerequisites name. Keep this list complete --
# build_dataset.py only sees what lands here.
SUBJECTS = ["ECE", "CMPSC", "MATH", "PHYS", "CHEM", "ENGR", "PSTAT", "WRIT",
            "ME", "MATRL", "TMP"]

# General education is not a subject, it is a tag. The catalog carries it on every
# course as customFields.generalSubjectAreas (A1, A2, B, C, D, E, F, G) and
# customFields.specialSubjectAreas (ETH, EUR, NWC, WRT, QNT), which is the same
# tagging the registrar's GE search reads. Sweeping by tag rather than listing ~75
# departments means a course newly approved for an area arrives on the next run.
GE_FIELDS = ["customFields.generalSubjectAreas", "customFields.specialSubjectAreas"]

PAGE = 500


def post(filters, skip, limit):
    body = json.dumps({"condition": "and", "filters": filters}).encode()
    url = (f"{BASE}?catalogId={CATALOG_ID}&skip={skip}&limit={limit}"
           f"&effectiveDatesRange={EFFECTIVE}&orderBy=catalogDisplayName")
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Content-Type": "application/json",
        "Origin": "https://catalog.ucsb.edu",
        "Referer": "https://catalog.ucsb.edu/",
        "User-Agent": "Mozilla/5.0",
    })
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.load(r)


def fetch(subject):
    return post([{
        "id": "subjectCode-1", "name": "subjectCode", "inputType": "select",
        "group": "course", "type": "is", "value": subject
    }], 0, 2000)


def fetch_tagged(field):
    """Every course carrying any value in `field`, paged."""
    filters = [{"id": f"{field}-1", "name": field, "inputType": "multiselect",
                "group": "course", "type": "isNotEmpty"}]
    rows, skip = [], 0
    while True:
        d = post(filters, skip, PAGE)
        rows += d["data"]
        if len(rows) >= d["listLength"] or not d["data"]:
            return rows
        skip += PAGE


all_courses = {}
for s in SUBJECTS:
    d = fetch(s)
    rows = d["data"]
    print(f"{s}: listLength={d['listLength']} fetched={len(rows)}", file=sys.stderr)
    all_courses[s] = rows

# GE courses land under their own subject codes, alongside the seeded subjects. A
# course already fetched by subject is skipped, so the subject sweep stays the
# authority for the departments it covers.
seen = {c.get("_id") for rows in all_courses.values() for c in rows}
for field in GE_FIELDS:
    rows = fetch_tagged(field)
    added = 0
    for c in rows:
        if c.get("_id") in seen:
            continue
        seen.add(c["_id"])
        all_courses.setdefault(c.get("subjectCode") or "?", []).append(c)
        added += 1
    print(f"{field}: listLength={len(rows)} new={added}", file=sys.stderr)

with open("catalog_all.json", "w", encoding="utf-8") as f:
    json.dump(all_courses, f, indent=1)
print(f"saved catalog_all.json ({sum(len(v) for v in all_courses.values())} courses, "
      f"{len(all_courses)} subjects)", file=sys.stderr)
