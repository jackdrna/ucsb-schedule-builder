"""Print parsed prereq trees next to the official catalog text, for hand-verification."""
import json, re, sys
from prereq_parser import parse, render, clean

SKIP_RE = re.compile(r"^(9[0-9]|19[0-9])")   # seminars, special topics, independent study


def num(c):
    m = re.match(r"(\d+)", c.get("courseNumber", "") or "")
    return int(m.group(1)) if m else 9999


d = json.load(open("catalog_raw.json", encoding="utf-8"))
subjects = sys.argv[1:] or ["ECE", "CMPSC"]

for subj in subjects:
    rows = [c for c in d[subj] if num(c) < 200 and c.get("status") == "Active"]
    rows.sort(key=lambda c: c.get("orderByKeyForCode", ""))
    print(f"\n{'='*100}\n{subj}\n{'='*100}")
    for c in rows:
        n = c.get("courseNumber", "")
        if SKIP_RE.match(n):
            continue
        rq = ((c.get("requisites") or {}).get("requisitesFreeform") or {}).get("value")
        tree, notes, raw = parse(rq)
        print(f"\n{c['code']}  ({c.get('longName') or c['name']})")
        print(f"  RAW  : {raw or '(none)'}")
        print(f"  TREE : {render(tree)}")
        if notes:
            print(f"  NOTES: {' | '.join(notes)}")
