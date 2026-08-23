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


def fetch(subject):
    body = json.dumps({
        "condition": "and",
        "filters": [{
            "id": "subjectCode-1", "name": "subjectCode", "inputType": "select",
            "group": "course", "type": "is", "value": subject
        }]
    }).encode()
    url = (f"{BASE}?catalogId={CATALOG_ID}&skip=0&limit=2000"
           f"&effectiveDatesRange={EFFECTIVE}&orderBy=catalogDisplayName")
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Content-Type": "application/json",
        "Origin": "https://catalog.ucsb.edu",
        "Referer": "https://catalog.ucsb.edu/",
        "User-Agent": "Mozilla/5.0",
    })
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


all_courses = {}
for s in SUBJECTS:
    d = fetch(s)
    rows = d["data"]
    print(f"{s}: listLength={d['listLength']} fetched={len(rows)}", file=sys.stderr)
    all_courses[s] = rows

with open("catalog_all.json", "w", encoding="utf-8") as f:
    json.dump(all_courses, f, indent=1)
print(f"saved catalog_all.json ({sum(len(v) for v in all_courses.values())} courses)",
      file=sys.stderr)
