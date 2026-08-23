"""Scrape the official UCSB Schedule of Classes (my.sa.ucsb.edu public curriculum search)
to determine which quarters each course is ACTUALLY offered in."""
import re, html, json, sys, time, urllib.parse, urllib.request, http.cookiejar

URL = "https://my.sa.ucsb.edu/public/curriculum/coursesearch.aspx"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
opener.addheaders = [("User-Agent", UA)]


def hidden_fields(page):
    out = {}
    for m in re.finditer(r'<input[^>]*type="hidden"[^>]*>', page):
        tag = m.group(0)
        n = re.search(r'name="([^"]+)"', tag)
        v = re.search(r'value="([^"]*)"', tag)
        if n:
            out[n.group(1)] = html.unescape(v.group(1)) if v else ""
    return out


def search(quarter, subject, level="Undergraduate"):
    page = opener.open(URL, timeout=90).read().decode("utf-8", "replace")
    f = hidden_fields(page)
    f.update({
        "ctl00$pageContent1$quarterList": quarter,
        "ctl00$pageContent1$courseList": subject,
        "ctl00$pageContent1$dropDownCourseLevels": level,
        # searchButton is <input type="image"> -> postback needs click coordinates
        "ctl00$pageContent1$searchButton.x": "20",
        "ctl00$pageContent1$searchButton.y": "10",
    })
    data = urllib.parse.urlencode(f).encode()
    req = urllib.request.Request(URL, data=data, headers={
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": UA, "Referer": URL,
    })
    return opener.open(req, timeout=120).read().decode("utf-8", "replace")


def course_codes(page):
    """Pull course codes out of the results page."""
    txt = re.sub(r"<[^>]+>", "\n", page)
    txt = html.unescape(txt).replace("\xa0", " ")
    codes = set()
    for m in re.finditer(r"\b([A-Z][A-Z&\. ]{1,6}?)\s+(\d{1,3}[A-Z]{0,2})\b", txt):
        codes.add((m.group(1).strip(), m.group(2)))
    return codes


if __name__ == "__main__":
    q, subj = sys.argv[1], sys.argv[2]
    p = search(q, subj)
    open(f"soc_{subj.strip()}_{q}.html", "w", encoding="utf-8").write(p)
    print(len(p), "bytes")
    cs = sorted(c for c in course_codes(p) if c[0] == subj.strip())
    print(len(cs), cs[:40])
