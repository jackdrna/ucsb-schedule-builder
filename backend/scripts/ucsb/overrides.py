"""Hand-curated prerequisite trees for the cases where the official UCSB catalog
wording is genuinely ambiguous to a parser.

Each entry was read off the 2025-2026 UCSB General Catalog text (quoted in
`why`) and encoded by hand. Everything not listed here comes straight from the
automated parse of the catalog's own prerequisite field.
"""


def C(code, concurrent=False):
    return {"t": "course", "code": code, "concurrent": concurrent}


def AND(*kids):
    return {"t": "and", "kids": list(kids)}


def OR(*kids):
    return {"t": "or", "kids": list(kids)}


PREREQ_OVERRIDES = {
    # "Math 4B or Math 4A 5A recommended." -- recommended, not required.
    "ECE 130C": {
        "tree": None,
        "why": "Catalog says MATH 4B / 5A are 'recommended', not required.",
    },

    # "ME 16 or ME W 16 and 17; ME 152A and ME 151A (may be concurrent);
    #  or ECE 130A & 137A with a minimum grade of C- in both."
    # The trailing 'or' makes the ME sequence and the ECE pair alternatives.
    "ECE 141A": {
        "tree": OR(
            AND(C("ME 16"), C("ME 17"), C("ME 152A"), C("ME 151A", True)),
            AND(C("ECE 130A"), C("ECE 137A")),
        ),
        "why": "Trailing '; or ECE 130A & 137A' makes the whole ME sequence an "
               "alternative to the ECE pair; parser split it into a top-level AND.",
    },

    # "Proficiency in JAVA programming, and a C- in ECE 152A."
    "ECE 150": {
        "tree": C("ECE 152A"),
        "why": "Course reference sits inside a grade clause ('a C- in ECE 152A'), "
               "which the grade-clause stripper removed.",
    },

    # "ECE 15A and ECE 2A or ECE 10A & ECE 10AL with a minimum grade of C- in each
    #  course; or Computer Science 30 or 64 ..."
    # ECE 15A is required; then either the old ECE 2A or the current 10A+10AL.
    "ECE 152A": {
        "tree": OR(
            AND(C("ECE 15A"), OR(C("ECE 2A"), AND(C("ECE 10A"), C("ECE 10AL")))),
            C("CMPSC 30"), C("CMPSC 64"),
        ),
        "why": "'&' binds tighter than 'or' here: ECE 10A & ECE 10AL is one "
               "alternative to the retired ECE 2A.",
    },

    # "Physics 105A or Physics 103; or ME 163 or upper-division standing in ECE."
    "ECE 183": {
        "tree": None,
        "why": "'or upper-division standing in ECE' is an alternative to every "
               "listed course, so no course is strictly required for ECE majors.",
    },

    # "ECE 153A or ECE 153B. ECE 153A may be taken concurrently with ECE 188A."
    "ECE 188A": {
        "tree": OR(C("ECE 153A", True), C("ECE 153B")),
        "why": "Second sentence grants concurrency for ECE 153A only; the parser "
               "read it as an extra conjunct.",
    },

    # Same catalog wording as ECE 141A -- the two courses are cross-listed.
    "ME 141A": {
        "tree": OR(
            AND(C("ME 16"), C("ME 17"), C("ME 152A"), C("ME 151A", True)),
            AND(C("ECE 130A"), C("ECE 137A")),
        ),
        "why": "Cross-listed with ECE 141A; same trailing-'or' ambiguity.",
    },

    # "Mathematics 3A or 2A with a grade of C or better (may be taken
    #  concurrently), CS 8 or Engineering 3 or ECE 3 with a grade of C or better,
    #  or significant prior programming experience."
    "CMPSC 16": {
        "tree": AND(
            OR(C("MATH 3A", True), C("MATH 2A", True)),
            OR(C("CMPSC 8"), C("ENGR 3"), C("ECE 3")),
        ),
        "why": "Two comma-separated requirements, each internally an alternation; "
               "the comma is a conjunction here, not a disjunction.",
    },
}

# Courses whose catalog prerequisite text names no course but which the
# ECE/CS departments treat as having a real ordering requirement are NOT
# invented here -- if the catalog does not require it, we do not enforce it.
