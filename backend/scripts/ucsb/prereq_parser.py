"""Parse UCSB General Catalog freeform prerequisite text into AND/OR requirement trees.

Tree node shapes:
  {"t": "course", "code": "ECE 130A", "concurrent": bool}
  {"t": "and", "kids": [...]}
  {"t": "or",  "kids": [...]}

Non-course requirements (major restrictions, class standing, consent, minimum
grades) are extracted separately as `notes` and never block scheduling.

Grammar handled, in binding order (tightest first):
  1. series / slash atoms   ECE 10A-B-C   PHYS 5/PHYS 5L      -> atomic AND group
  2. 'or'                   A or B                            -> OR
  3. ',' / 'and' / '&'      A, B and C                        -> AND
  4. ';'                    A; B                              -> AND  ('; or' -> OR)
"""
import re, html

# Department words -> UCSB subject codes. Longest phrases first.
DEPT_PATTERNS = [
    (r"electrical\s+(?:and|&)\s+computer\s+engineering", "ECE"),
    (r"electrical\s+engineering", "ECE"),
    (r"computer\s+engineering", "ECE"),
    (r"computer\s+science", "CMPSC"),
    (r"mechanical\s+engineering", "ME"),
    (r"chemical\s+engineering", "CH E"),
    (r"mathematics", "MATH"),
    (r"physics", "PHYS"),
    (r"chemistry", "CHEM"),
    (r"materials", "MATRL"),
    (r"engineering", "ENGR"),
    (r"cmpsc", "CMPSC"), (r"cs", "CMPSC"),
    (r"ece", "ECE"), (r"ee", "ECE"),
    (r"math", "MATH"), (r"phys", "PHYS"), (r"chem", "CHEM"),
    (r"pstat", "PSTAT"), (r"engr", "ENGR"), (r"matrl", "MATRL"), (r"me", "ME"),
]
# Wrapped so that 'cs' cannot match inside 'Linguistics' and 'me' cannot match
# inside 'Mathematics'.
DEPT_ALT = ("(?<![A-Za-z])(?:" + "|".join(p for p, _ in DEPT_PATTERNS) + ")(?![A-Za-z])")
DEPT_LOOKUP = [(re.compile(rf"^(?:{p})$", re.I), c) for p, c in DEPT_PATTERNS]

NUMBER = r"\d{1,3}[A-Z]{0,3}"

# Clauses that state a requirement but are not a course prerequisite.
NOTE_PATTERNS = [
    r"open (?:only )?to [^;.]*", r"not open for credit[^;.]*", r"open for credit[^;.]*",
    r"upper[-\s]division standing[^;.]*", r"lower[-\s]division standing[^;.]*",
    r"senior standing[^;.]*", r"junior standing[^;.]*",
    r"consent of (?:the )?(?:instructor|department|chair)[^;.]*",
    r"permission of instructor[^;.]*",
    r"familiarity with[^;.]*", r"proficiency in[^;.]*", r"knowledge of[^;.]*",
    r"significant (?:prior )?programming experience[^;.]*",
    r"may be repeated[^;.]*", r"sections not always offered",
    r"must have a [\d.]+ gpa[^;.]*", r"students must:.*",
    r"completion of \d+ upper[-\s]?divis\w*[^;.]*",
    # grade qualifiers
    r"all with a minimum grade of [abc][-+]?", r"with a minimum grade of [abc][-+]?",
    r"with a minimum of grade of [abc][-+]?", r"with minimum grades of [abc][-+]?",
    r"with a (?:letter )?grade of [abc][-+]?(?: or better)?",
    r"with a [abc][-+]?(?: grade)?(?: or better)?(?: grade)?",
    r"with a minimum grade of a [abc][-+]?(?: or better)?",
    r"in (?:each|both|all)(?: of (?:those|the) courses)?(?: course)?",
    r"\(in either\)", r"or equivalent", r"or consent of instructor",
    r"or significant prior programming experience", r"recommended",
    r"pre-?requisites?:", r"\bor better\b",
    # Placement / exam credit alternatives: the numbers in these are exam scores
    # and exam levels, not course numbers. Must not run past a ')' or ',', or the
    # requirement that follows the clause gets eaten with it.
    r"\([^)]*\bap\b[^)]*\)",
    r"\bap (?:calculus|math|physics|chemistry|statistics)\b[^;.,)]*",
    r"\bap\b[^;.,)]*?(?:score|exam)[^;.,)]*",
    r"with a score of[^;.,)]*", r"score of \d+(?: or better)?",
    r"qualifying score on the mathematics placement exam[^;.]*",
    r"satisfaction of the entry level writing requirement[^;.]*",
    r"advanced placement[^;.,)]*",
]

CONCURRENT_RE = re.compile(
    r"\(\s*may be (?:taken )?concurrent(?:ly)?(?:\s+with[^)]*)?\s*\)", re.I)


def clean(text):
    text = re.sub(r"<[^>]+>", " ", text or "")
    text = html.unescape(text).replace("\xa0", " ")
    for a, b in [("–", "-"), ("—", "-"), ("’", "'"), (" ", " ")]:
        text = text.replace(a, b)
    return re.sub(r"\s+", " ", text).strip()


def strip_notes(text):
    notes = []
    for pat in NOTE_PATTERNS:
        def grab(m):
            s = m.group(0).strip(" .,;:")
            if len(s) > 4 and not re.match(
                    r"^(in (each|both|all)|pre-?requisites?|or better)", s, re.I):
                notes.append(s)
            return " "
        text = re.sub(pat, grab, text, flags=re.I)
    return re.sub(r"\s+", " ", text).strip(" .,;"), notes


def dept_of(token):
    if not token:
        return None
    t = token.strip()
    for rx, code in DEPT_LOOKUP:
        if rx.match(t):
            return code
    return None


# ------------------------------------------------------------------ phase 1
# Turn multi-course constructs into single atoms so 'or' can't split them.

def is_lab_pair(codes):
    """True if a slash-joined group is a lecture and its lab ('PHYS 5/PHYS 5L').

    Lab pairs share a numeric base and one code carries a trailing 'L'; two
    unrelated courses joined by a slash ('MATH 2A/3A') are alternatives instead.
    """
    bases, has_lab = set(), False
    for code in codes:
        n = code.rsplit(" ", 1)[1]
        m = re.match(r"(\d{1,3})", n)
        bases.add(m.group(1) if m else n)
        if n.endswith("L"):
            has_lab = True
    return has_lab and len(bases) == 1


def build_atoms(text):
    """Replace course refs and series/slash groups with @@n@@ placeholders.

    Returns (text_with_placeholders, atoms) where atoms[n] is a tree node.
    """
    atoms = []
    carry = [None]

    # A single course reference, optionally with a series tail and/or concurrency mark.
    ref = re.compile(
        rf"(?:(?P<dept>{DEPT_ALT})\s+)?"
        rf"(?P<num>{NUMBER})"
        rf"(?P<series>(?:\s*-\s*[A-Z]{{1,3}})+)?"
        rf"(?P<slash>(?:\s*/\s*(?:(?:{DEPT_ALT})\s+)?{NUMBER})+)?"
        rf"(?P<conc>\s*@@C@@)?",
        re.I)

    def repl(m):
        dept = dept_of(m.group("dept")) if m.group("dept") else carry[0]
        if not dept:
            return m.group(0)          # unattributable number -- leave as prose
        carry[0] = dept
        conc = bool(m.group("conc"))
        codes = [f"{dept} {m.group('num').upper()}"]

        if m.group("series"):
            base = re.match(r"(\d{1,3})", m.group("num")).group(1)
            for suf in re.findall(r"-\s*([A-Z]{1,3})", m.group("series"), re.I):
                codes.append(f"{dept} {base}{suf.upper()}")

        slashed = []
        if m.group("slash"):
            for part in re.findall(rf"/\s*(?:({DEPT_ALT})\s+)?({NUMBER})",
                                   m.group("slash"), re.I):
                d = dept_of(part[0]) or dept
                slashed.append(f"{d} {part[1].upper()}")

        kids = [{"t": "course", "code": c, "concurrent": conc} for c in codes]
        joiner = "and"
        if slashed:
            # 'PHYS 5/PHYS 5L' pairs a lecture with its lab -- both are required.
            # 'Mathematics 2A/3A' lists two alternatives -- either will do.
            kids += [{"t": "course", "code": c, "concurrent": conc} for c in slashed]
            if not is_lab_pair(codes + slashed):
                joiner = "or"

        node = kids[0] if len(kids) == 1 else {"t": joiner, "kids": kids}
        atoms.append(node)
        return f" @@{len(atoms) - 1}@@ "

    out = ref.sub(repl, text)
    return re.sub(r"\s+", " ", out), atoms


# ------------------------------------------------------------------ phase 2

PLACEHOLDER = re.compile(r"@@(\d+)@@")


def collect(seg, atoms):
    return [atoms[int(i)] for i in PLACEHOLDER.findall(seg)]


def set_concurrent(node):
    """Mark every course under `node` as concurrency-allowed."""
    if node["t"] == "course":
        node["concurrent"] = True
    else:
        for k in node["kids"]:
            set_concurrent(k)
    return node


def any_concurrent(node):
    if node["t"] == "course":
        return bool(node.get("concurrent"))
    return any(any_concurrent(k) for k in node["kids"])


def parse_or(seg, atoms):
    """'A or B or C' -> OR node. Bare conjunctions inside become AND.

    UCSB phrases concurrency once, at the end of an alternation
    ("PSTAT 120A or ECE 139 (may be taken concurrently)"), and means it for
    every alternative -- so propagate the flag across the whole group.
    """
    alts = []
    for part in re.split(r"\s+or\s+", seg, flags=re.I):
        nodes = collect(part, atoms)
        if not nodes:
            continue
        alts.append(nodes[0] if len(nodes) == 1 else {"t": "and", "kids": nodes})
    if not alts:
        return None
    if len(alts) == 1:
        return alts[0]
    node = {"t": "or", "kids": alts}
    if any_concurrent(node):
        set_concurrent(node)
    return node


def parse_and(chunk, atoms):
    """'A, B and C' -> AND node; each element may itself be an OR.

    Special case: a comma list with no 'and' whose final item starts with 'or'
    ("Physics 3, 7B or 23") is an alternation, not a conjunction.
    """
    if ("," in chunk and re.search(r"\s+or\s+", chunk, flags=re.I)
            and not re.search(r"\s+and\s+", chunk, flags=re.I)):
        return parse_or(re.sub(r"\s*,\s*", " or ", chunk), atoms)

    kids = []
    for piece in re.split(r"\s*,\s*|\s+and\s+", chunk, flags=re.I):
        if not PLACEHOLDER.search(piece):
            continue
        n = parse_or(piece, atoms)
        if n:
            kids.append(n)
    if not kids:
        return None
    return kids[0] if len(kids) == 1 else {"t": "and", "kids": kids}


def flatten(node):
    """Collapse nested same-type nodes and de-duplicate."""
    if node is None or node["t"] == "course":
        return node
    kids, seen = [], set()
    for k in node["kids"]:
        k = flatten(k)
        if k is None:
            continue
        if k["t"] == node["t"]:
            for gk in k["kids"]:
                key = repr(gk)
                if key not in seen:
                    seen.add(key)
                    kids.append(gk)
        else:
            key = repr(k)
            if key not in seen:
                seen.add(key)
                kids.append(k)
    if not kids:
        return None
    return kids[0] if len(kids) == 1 else {"t": node["t"], "kids": kids}


def parse(text):
    """Return (tree | None, notes, cleaned_raw_text)."""
    raw = clean(text)
    if not raw:
        return None, [], ""

    body, notes = strip_notes(raw)
    body = CONCURRENT_RE.sub(" @@C@@ ", body)
    body = body.replace("&", " and ")
    body = re.sub(r"\beither\b", " ", body, flags=re.I)
    # 'Mathematics 4A (or 4AI)' -- the parentheses only soften an alternative.
    body = re.sub(r"\(\s*(or|and)\s+", r" \1 ", body, flags=re.I)
    body = re.sub(r"\s*\)", " ", body)
    # Separate requirements are sometimes separate sentences.
    body = re.sub(r"\.\s+(?=[A-Z])", "; ", body)
    body = re.sub(r"\s+", " ", body)

    body, atoms = build_atoms(body)
    if not atoms:
        return None, notes, raw

    and_parts = []
    for chunk in re.split(r"\s*;\s*", body):
        if not PLACEHOLDER.search(chunk):
            continue
        leading_or = bool(re.match(r"^\s*(?:and\s*,?\s*)?or\b", chunk, re.I))
        chunk = re.sub(r"^\s*(?:and\s*,?\s*)?or\b", " ", chunk, flags=re.I)
        # 'Co-requisite: Physics 7C' -- a corequisite runs alongside the course.
        corequisite = bool(re.match(r"^\s*co-?requisites?\b", chunk, re.I))
        chunk = re.sub(r"^\s*co-?requisites?:?\s*", " ", chunk, flags=re.I)
        node = parse_and(chunk, atoms)
        if not node:
            continue
        if corequisite:
            set_concurrent(node)
        if leading_or and and_parts:
            prev = and_parts.pop()
            and_parts.append({"t": "or", "kids": [prev, node]})
        else:
            and_parts.append(node)

    if not and_parts:
        return None, notes, raw
    tree = and_parts[0] if len(and_parts) == 1 else {"t": "and", "kids": and_parts}
    return flatten(tree), notes, raw


def render(node):
    if node is None:
        return "-"
    if node["t"] == "course":
        return node["code"] + ("*" if node.get("concurrent") else "")
    joiner = " AND " if node["t"] == "and" else " OR "
    return "(" + joiner.join(render(k) for k in node["kids"]) + ")"


def codes_in(node):
    if node is None:
        return set()
    if node["t"] == "course":
        return {node["code"]}
    s = set()
    for k in node["kids"]:
        s |= codes_in(k)
    return s
