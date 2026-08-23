"""Harvest 3 academic years of ACTUAL course offerings from the official
UCSB Schedule of Classes (my.sa.ucsb.edu/public/curriculum/coursesearch.aspx).

Produces soc_offerings.json:
  { "CMPSC 130A": { "quarters": {"20254": true, ...}, "title": ..., "units": ...,
                    "prereq": ..., "description": ... }, ... }
"""
import re, html, json, sys, time
from fetch_soc import search

# UCSB term codes: YYYY + 1=Winter 2=Spring 3=Summer 4=Fall
QUARTERS = {
    "20244": ("Fall", 2024), "20251": ("Winter", 2025), "20252": ("Spring", 2025),
    "20254": ("Fall", 2025), "20261": ("Winter", 2026), "20262": ("Spring", 2026),
    "20264": ("Fall", 2026),
}
SUBJECTS = ["ECE", "CMPSC", "MATH", "PHYS", "CHEM", "ENGR", "WRIT", "PSTAT"]


def strip(t):
    t = re.sub(r"<[^>]+>", " ", t)
    return re.sub(r"\s+", " ", html.unescape(t).replace("\xa0", " ")).strip()


def parse(page):
    """Return {code: {title, units, prereq, description}} for one subject/quarter page."""
    out = {}
    # Each course block starts with <td id="CourseTitle"> holding "SUBJ  NUM"
    for m in re.finditer(r'<td id="CourseTitle".*?</td>', page, re.S):
        block = m.group(0)
        # Code is the text before the nested MasterCourseTableDiv
        head = block.split('<div class="MasterCourseTableDiv"', 1)[0]
        code_txt = strip(head)
        cm = re.match(r"^([A-Z][A-Z&\. ]*?)\s+(\d{1,3}[A-Z]{0,3})$", code_txt)
        if not cm:
            continue
        code = f"{cm.group(1).strip()} {cm.group(2)}"
        info = {}
        mt = re.search(r'<table class="MasterCourseTable".*?</table>', block, re.S)
        if mt:
            rows = re.findall(r"<tr[^>]*>(.*?)</tr>", mt.group(0), re.S)
            for r in rows:
                cells = [strip(c) for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", r, re.S)]
                if len(cells) >= 2 and cells[0].endswith(":"):
                    info[cells[0].rstrip(":").strip()] = cells[1]
        out[code] = {
            "title": info.get("Full Title", ""),
            "units": info.get("Units", ""),
            "prereq": info.get("PreRequisite", ""),
            "description": info.get("Description", ""),
            "college": info.get("College", ""),
        }
    return out


if __name__ == "__main__":
    agg = {}
    for subj in SUBJECTS:
        for q in QUARTERS:
            for attempt in range(3):
                try:
                    page = search(q, subj)
                    break
                except Exception as e:
                    print(f"  retry {subj} {q}: {e}", file=sys.stderr)
                    time.sleep(5)
            else:
                print(f"FAILED {subj} {q}", file=sys.stderr)
                continue
            found = parse(page)
            for code, info in found.items():
                rec = agg.setdefault(code, {"quarters": {}, "title": "", "units": "",
                                            "prereq": "", "description": "", "college": ""})
                rec["quarters"][q] = True
                for k in ("title", "units", "prereq", "description", "college"):
                    if info.get(k) and not rec[k]:
                        rec[k] = info[k]
            print(f"{subj} {q}: {len(found)} courses", file=sys.stderr)
            time.sleep(1)
    json.dump(agg, open("soc_offerings.json", "w", encoding="utf-8"), indent=1)
    print(f"saved {len(agg)} course records", file=sys.stderr)
