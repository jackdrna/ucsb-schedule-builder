"""UCSB Electrical Engineering and Computer Engineering degree requirements, 2026-27.

Transcribed by hand from UCSB's own published requirement sheets, because they are
published as a PDF and a set of department pages rather than as queryable data:

  EE major requirements   GEAR 2026-27, p. 24
  EE four-year plan       GEAR 2026-27, p. 25
  CE major requirements   GEAR 2026-27, p. 20
  CE four-year plan       GEAR 2026-27, p. 21
      https://engineering.ucsb.edu/sites/default/files/images/26-27_GEAR.pdf
  EE tracks               https://www.ece.ucsb.edu/undergrad/curriculum
  CE sequences            https://www.ce.ucsb.edu/undergrad/curriculum/senior-elective-sequences

Requirement shapes
------------------
A required course uses the same AND/OR tree the prerequisite parser produces, so the
frontend can reuse one evaluator:

    {"t": "course", "code": "ECE 134"}
    {"t": "and", "kids": [...]}      every child needed
    {"t": "or",  "kids": [...]}      any one child

A track / sequence is a list of rules, each either

    {"kind": "all",     "options": [[codes], ...]}          every option needed
    {"kind": "atLeast", "n": 4, "options": [[codes], ...]}  n options needed

where an option is satisfied if ANY of its codes is in the plan. A track is complete
when all of its rules pass.

Run: python requirements.py   ->  backend/data/ucsb-requirements.json
"""
import json, os

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data")
COURSES = os.path.join(DATA_DIR, "ucsb-courses.json")
OUT = os.path.join(DATA_DIR, "ucsb-requirements.json")


def C(code):
    return {"t": "course", "code": code}


def AND(*codes_or_nodes):
    return {"t": "and", "kids": [C(k) if isinstance(k, str) else k for k in codes_or_nodes]}


def OR(*codes_or_nodes):
    return {"t": "or", "kids": [C(k) if isinstance(k, str) else k for k in codes_or_nodes]}


def req(label, tree, units=None, note=None):
    r = {"label": label, "tree": tree}
    if units is not None:
        r["units"] = units
    if note:
        r["note"] = note
    return r


def rule_all(*options):
    return {"kind": "all", "options": [list(o) if isinstance(o, (list, tuple)) else [o]
                                       for o in options]}


def rule_at_least(n, *options):
    return {"kind": "atLeast", "n": n,
            "options": [list(o) if isinstance(o, (list, tuple)) else [o] for o in options]}


GEAR_URL = "https://engineering.ucsb.edu/sites/default/files/images/26-27_GEAR.pdf"
GEAR = "UCSB GEAR 2026-27"

# The ECE 10 sequence is six separate enrolments; the GEAR lists them as one line.
ECE_10_SEQUENCE = AND("ECE 10A", "ECE 10AL", "ECE 10B", "ECE 10BL",
                      "ECE 10C", "ECE 10CL")
PHYS_7 = AND("PHYS 7A", "PHYS 7B", "PHYS 7C", "PHYS 7D", "PHYS 7L")
MATH_LOWER = OR(AND("MATH 2A", "MATH 2B"), AND("MATH 3A", "MATH 3B"))


# ---------------------------------------------------------------- EE (GEAR p. 24)

EE = {
    "code": "EE",
    "name": "Electrical Engineering (BS)",
    "catalog_year": "2026-27",
    "total_units": 189,
    "source": f"{GEAR}, Electrical Engineering (p. 24)",
    "source_url": GEAR_URL,
    "notes": [
        "Courses used for major requirements must be taken for a letter grade.",
        "Departmental electives need your faculty adviser's approval.",
    ],
    "groups": [
        {
            "id": "prep",
            "name": "Preparation for the major",
            "requirements": [
                req("CHEM 1A or 2A or ECE 6", OR("CHEM 1A", "CHEM 2A", "ECE 6"), 4),
                req("CMPSC 9 or CMPSC 16", OR("CMPSC 9", "CMPSC 16"), 4),
                req("ECE 3", C("ECE 3"), 4),
                req("ECE 5", C("ECE 5"), 4),
                req("ECE 10A, 10AL, 10B, 10BL, 10C, 10CL", ECE_10_SEQUENCE, 15),
                req("ECE 15A", C("ECE 15A"), 4),
                req("MATH 2A-B or 3A-B", MATH_LOWER, 8),
                req("MATH 4A-B", AND("MATH 4A", "MATH 4B"), 8),
                req("MATH 6A-B", AND("MATH 6A", "MATH 6B"), 8),
                req("PHYS 7A, 7B, 7C, 7D, 7L", PHYS_7, 16),
                req("ECE 130A-B", AND("ECE 130A", "ECE 130B"), 8),
                req("ECE 139", C("ECE 139"), 4),
            ],
        },
        {
            "id": "upper",
            "name": "Upper division major",
            "requirements": [
                req("ECE 134", C("ECE 134"), 4),
                req("ECE 152A", C("ECE 152A"), 5),
                req("ECE 153A or 153B", OR("ECE 153A", "ECE 153B"), 4,
                    "If you take both, one counts as a departmental elective."),
                req("ECE 188A-B-C", AND("ECE 188A", "ECE 188B", "ECE 188C"), 12),
                req("ENGR 101", C("ENGR 101"), 3,
                    "May be taken any quarter of senior year."),
            ],
        },
    ],
    "electives": {
        "name": "Departmental electives",
        "min_units": 36,
        "note": "Must include an approved depth sequence for your track, or another "
                "adviser-approved sequence of at least four courses. ECE 192/196 count "
                "for at most 4 units combined; TMP for at most one course. ECE 194 "
                "special topics also count but are not listed in this app.",
        "codes": [
            "ECE 120A", "ECE 120B", "ECE 122A", "ECE 122B", "ECE 123", "ECE 125",
            "ECE 130C", "ECE 132", "ECE 133", "ECE 135",
            "ECE 136A", "ECE 136B", "ECE 136C", "ECE 137A", "ECE 137B",
            "ECE 141A", "ECE 141B", "ECE 142", "ECE 144",
            "ECE 145A", "ECE 145B", "ECE 145C", "ECE 146A", "ECE 146B",
            "ECE 147A", "ECE 147B", "ECE 147C", "ECE 148", "ECE 149",
            "ECE 152B", "ECE 153A", "ECE 153B", "ECE 154A", "ECE 154B",
            "ECE 157A", "ECE 157B", "ECE 157C", "ECE 158", "ECE 160",
            "ECE 162A", "ECE 162B", "ECE 162C", "ECE 178",
            "ECE 179D", "ECE 179P", "ECE 180", "ECE 181", "ECE 183", "ECE 184",
            "ECE 186",
            "MATRL 100A", "MATRL 100B", "MATRL 100C", "MATRL 101",
            "MATRL 162A", "MATRL 162B", "TMP 120", "TMP 122",
        ],
    },
    "depth": {
        "name": "Depth sequence (track)",
        "min_complete": 1,
        "label": "track",
        "note": "One approved track, or another sequence of at least four courses "
                "approved by your faculty adviser by the end of fall quarter, junior year.",
        "source_url": "https://www.ece.ucsb.edu/undergrad/curriculum",
        "items": [
            {"name": "Signal Processing and Sensing",
             "rules": [rule_at_least(4, "ECE 130C", "ECE 133", "ECE 148", "ECE 158",
                                     "ECE 178", "ECE 180", "ECE 181", "ECE 186")]},
            {"name": "Robotics and Control",
             "rules": [rule_at_least(4, "ECE 130C", "ECE 147A", "ECE 147B",
                                     "ECE 147C", "ECE 179D")]},
            {"name": "High Speed, High Frequency Integrated Circuits",
             "rules": [rule_all("ECE 132", "ECE 137A", "ECE 137B",
                                "ECE 145A", "ECE 145B")]},
            {"name": "Wireless Communications and Sensing",
             "rules": [rule_at_least(4, "ECE 130C", "ECE 146A", "ECE 146B",
                                     "ECE 148", "ECE 158")]},
            {"name": "Photonics",
             "rules": [rule_at_least(4, "ECE 132", "ECE 135", "ECE 136A", "ECE 136B",
                                     "ECE 136C", "ECE 144", "ECE 162A", "ECE 162B",
                                     "ECE 162C")]},
            {"name": "Semiconductors and Integrated Circuits",
             "rules": [rule_all("ECE 120A", ["ECE 120B", "ECE 137B"], "ECE 132",
                                "ECE 137A", "ECE 142")]},
            {"name": "Computer Architecture",
             "rules": [rule_all("ECE 154A", "ECE 154B"),
                       rule_at_least(2, "ECE 152B", "ECE 153A", "ECE 153B")]},
            {"name": "Digital VLSI",
             "rules": [rule_all(["ECE 122A", "ECE 123"], "ECE 122B"),
                       rule_at_least(2, "ECE 132", "ECE 157A", "ECE 157B")]},
            {"name": "Machine Learning",
             "rules": [rule_at_least(4, "ECE 133", "ECE 157A", "ECE 157B",
                                     "ECE 180", "ECE 181", "ECE 186")]},
        ],
    },
}


# ---------------------------------------------------------------- CE (GEAR p. 20)

CE = {
    "code": "CE",
    "name": "Computer Engineering (BS)",
    "catalog_year": "2026-27",
    "total_units": 191,
    "source": f"{GEAR}, Computer Engineering (p. 20)",
    "source_url": GEAR_URL,
    "notes": [
        "Courses used for major requirements must be taken for a letter grade.",
        "Departmental electives need your faculty adviser's approval.",
    ],
    "groups": [
        {
            "id": "prep",
            "name": "Preparation for the major",
            "requirements": [
                req("ECE 3 or CMPSC 8", OR("ECE 3", "CMPSC 8"), 4,
                    "From the CE four-year plan (GEAR p. 21) and the department's "
                    "curriculum page; not itemised on the GEAR requirement list."),
                req("CMPSC 16", C("CMPSC 16"), 4),
                req("CMPSC 24", C("CMPSC 24"), 4),
                req("CMPSC 32", C("CMPSC 32"), 4),
                req("CMPSC 41", C("CMPSC 41"), 4,
                    "New for 2026-27, in place of CMPSC 40."),
                req("ECE 1A-1B", AND("ECE 1A", "ECE 1B"), 2),
                req("ECE 5", C("ECE 5"), 4),
                req("ECE 10A, 10AL, 10B, 10BL, 10C, 10CL", ECE_10_SEQUENCE, 15),
                req("ECE 15A", C("ECE 15A"), 4),
                req("MATH 2A-B or 3A-B", MATH_LOWER, 8),
                req("MATH 4A-B", AND("MATH 4A", "MATH 4B"), 8),
                req("MATH 6A", C("MATH 6A"), 4),
                req("PHYS 7A, 7B, 7C, 7D, 7L", PHYS_7, 16),
            ],
        },
        {
            "id": "upper",
            "name": "Upper division major",
            "requirements": [
                req("CMPSC 130A", C("CMPSC 130A"), 4),
                req("ECE 139", C("ECE 139"), 4),
                req("ECE 152A", C("ECE 152A"), 5),
                req("ECE 154A", C("ECE 154A"), 4),
                req("ENGR 101", C("ENGR 101"), 3,
                    "May be taken any quarter of senior year."),
                req("Capstone: CMPSC 189A-B or ECE 189A-B-C",
                    OR(AND("CMPSC 189A", "CMPSC 189B"),
                       AND("ECE 189A", "ECE 189B", "ECE 189C")), 8,
                    "CMPSC 156 is the prerequisite for CMPSC 189A; "
                    "ECE 153B is the prerequisite for ECE 189A."),
            ],
        },
    ],
    "electives": {
        "name": "Computer Engineering electives",
        "min_units": 36,
        "note": "Must include at least two approved sequences. ECE/CMPSC 192 and 196 "
                "count for at most 4 units combined. ECE 194 special topics also count "
                "but are not listed in this app.",
        "codes": [
            "CMPSC 130B", "CMPSC 138", "CMPSC 153A", "CMPSC 156", "CMPSC 160",
            "CMPSC 162", "CMPSC 165A", "CMPSC 165B", "CMPSC 170", "CMPSC 171",
            "CMPSC 174A", "CMPSC 176A", "CMPSC 176B", "CMPSC 176C", "CMPSC 177",
            "CMPSC 178", "CMPSC 181",
            "ECE 122A", "ECE 122B", "ECE 123", "ECE 130A", "ECE 130B", "ECE 130C",
            "ECE 133", "ECE 147A", "ECE 147B", "ECE 148", "ECE 149", "ECE 150",
            "ECE 152B", "ECE 153A", "ECE 153B", "ECE 154B",
            "ECE 157A", "ECE 157B", "ECE 157C", "ECE 160", "ECE 178",
            "ECE 179D", "ECE 179P", "ECE 180", "ECE 181", "ECE 184", "ECE 186",
        ],
    },
    "depth": {
        "name": "Senior elective sequences",
        "min_complete": 2,
        "label": "sequence",
        "note": "Two sequence topics, at least two courses in each.",
        "source_url": "https://www.ce.ucsb.edu/undergrad/curriculum/senior-elective-sequences",
        "items": [
            {"name": "Computer Networks",
             "rules": [rule_all("CMPSC 176A", ["CMPSC 176B", "CMPSC 176C"])]},
            {"name": "Computer Systems Design",
             "rules": [rule_all(["ECE 153A", "CMPSC 153A"], "ECE 153B")]},
            {"name": "Design and Test Automation",
             "rules": [rule_all("ECE 157A", "ECE 157B")]},
            {"name": "Distributed Systems",
             "rules": [rule_all("CMPSC 171"),
                       rule_at_least(1, "CMPSC 176A", "CMPSC 176B")]},
            {"name": "Machine Learning",
             "rules": [rule_all("CMPSC 165A", "CMPSC 165B")]},
            {"name": "Multimedia",
             "rules": [rule_at_least(2, "ECE 180", "ECE 178",
                                     ["ECE 181", "CMPSC 181"])]},
            {"name": "Programming Languages",
             "rules": [rule_all("CMPSC 160", "CMPSC 162")]},
            {"name": "Real-Time Computing & Control",
             "rules": [rule_all("ECE 147A", "ECE 147B")]},
            {"name": "Robotics",
             "rules": [rule_all("ECE 179D", "ECE 179P")]},
            {"name": "Signals and Systems",
             "rules": [rule_all("ECE 130A", "ECE 130B")]},
            {"name": "System Software Architecture",
             "rules": [rule_all("CMPSC 170", "CMPSC 171")]},
            {"name": "Very Large Scale Integration (VLSI)",
             "rules": [rule_all(["ECE 122A", "ECE 123"], "ECE 122B")]},
        ],
    },
}


PROGRAMS = [EE, CE]

if __name__ == "__main__":
    json.dump(PROGRAMS, open(OUT, "w", encoding="utf-8"), indent=1)
    print(f"wrote {os.path.relpath(OUT)}")

    courses = {c["code"] for c in json.load(open(COURSES, encoding="utf-8"))}

    def codes_in_tree(node):
        if node["t"] == "course":
            return {node["code"]}
        out = set()
        for k in node["kids"]:
            out |= codes_in_tree(k)
        return out

    for p in PROGRAMS:
        referenced = set(p["electives"]["codes"])
        for g in p["groups"]:
            for r in g["requirements"]:
                referenced |= codes_in_tree(r["tree"])
        for item in p["depth"]["items"]:
            for rule in item["rules"]:
                for opt in rule["options"]:
                    referenced |= set(opt)
        missing = sorted(referenced - courses)
        n_req = sum(len(g["requirements"]) for g in p["groups"])
        print(f"{p['code']}: {n_req} required entries, "
              f"{len(p['electives']['codes'])} elective options, "
              f"{len(p['depth']['items'])} {p['depth']['label']}s, "
              f"{len(referenced)} courses referenced")
        if missing:
            print(f"  NOT IN DATASET: {missing}")
