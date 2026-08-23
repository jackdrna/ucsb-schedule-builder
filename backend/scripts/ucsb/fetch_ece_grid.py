"""Scrape the ECE department's own quarter-offering grid.

Source: https://www.ece.ucsb.edu/undergrad/courses
        table "ECE Undergraduate Courses 2026-27"

Writes ece_offerings.json: a list of rows, the first being the header, each row
[number, title, Fall, Winter, Spring, Summer]. Cell values are the department's
own markings -- 'X', 'XD' (external-department instructor), 'X (PS)', '*NO'
(not offered), 'TBA'.
"""
import html
import json
import re
import sys
import urllib.request

URL = "https://www.ece.ucsb.edu/undergrad/courses"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")


def text_of(fragment):
    fragment = re.sub(r"<[^>]+>", " ", fragment)
    fragment = html.unescape(fragment).replace("\xa0", " ")
    return re.sub(r"\s+", " ", fragment).strip()


def main():
    req = urllib.request.Request(URL, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=90) as r:
        page = r.read().decode("utf-8", "replace")

    rows = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", page, re.S):
        cells = [text_of(c) for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr, re.S)]
        if len(cells) >= 6:
            rows.append(cells[:6])

    if len(rows) < 20:
        sys.exit(f"only found {len(rows)} rows -- the page layout probably changed")

    with open("ece_offerings.json", "w", encoding="utf-8") as f:
        json.dump(rows, f, indent=0)

    header = rows[0]
    print(f"saved ece_offerings.json: {len(rows) - 1} courses", file=sys.stderr)
    print(f"  columns: {' | '.join(header)}", file=sys.stderr)


if __name__ == "__main__":
    main()
