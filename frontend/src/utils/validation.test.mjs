/**
 * Validation tests against the real UCSB dataset.
 *
 *   node frontend/src/utils/validation.test.mjs
 *
 * These assert the behaviour a student would expect from the published rules, so
 * they double as a check that the scraped data still says what we think it says.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  QUARTERS,
  emptySchedule,
  termKey,
  validatePlacement,
  validatePlan,
  checkOffering,
  describePrereqTree,
  totalUnits,
  auditDegree,
} from './validation.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, '..', '..', '..', 'backend', 'data');
const courses = JSON.parse(readFileSync(path.join(dataDir, 'ucsb-courses.json'), 'utf8'));
const programs = JSON.parse(readFileSync(path.join(dataDir, 'ucsb-requirements.json'), 'utf8'));
const programOf = (code) => {
  const p = programs.find((x) => x.code === code);
  assert.ok(p, `no program ${code}`);
  // The API flattens `definition` into the row; mirror that shape here.
  return p;
};

const catalog = new Map(courses.map((c) => [c.code, c]));
const get = (code) => {
  const c = catalog.get(code);
  assert.ok(c, `dataset is missing ${code}`);
  return c;
};

let passed = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    results.push(`  ok   ${name}`);
  } catch (err) {
    results.push(`  FAIL ${name}\n         ${err.message}`);
  }
}

/** Build a schedule from { 'Y1-Fall': ['ECE 10A', ...] }. */
function planOf(spec) {
  const schedule = emptySchedule();
  for (const [key, codes] of Object.entries(spec)) {
    schedule[key] = codes.map(get);
  }
  return schedule;
}

const place = (code, key, spec = {}) =>
  validatePlacement(get(code), key, planOf(spec), catalog);

/* ------------------------------------------------------------- data integrity */

test('dataset loaded with ECE and CMPSC coverage', () => {
  assert.ok(courses.length > 150, `only ${courses.length} courses`);
  assert.ok(courses.filter((c) => c.subject === 'ECE').length > 60);
  assert.ok(courses.filter((c) => c.subject === 'CMPSC').length > 40);
});

test('every course cites a UCSB source and URL', () => {
  for (const c of courses) {
    // Courses the GEAR requires but the catalog does not carry yet (CMPSC 41)
    // cite the department page instead, so accept any ucsb.edu source.
    assert.match(c.catalog_url || '', /^https:\/\/[\w.-]*ucsb\.edu\//, c.code);
    assert.ok(c.catalog_source, c.code);
    assert.ok(c.offering_source, c.code);
  }
});

test('no prerequisite tree is impossible to satisfy', () => {
  const satisfiable = (n) => {
    if (!n) return true;
    if (n.t === 'course') return catalog.has(n.code);
    return n.t === 'and' ? n.kids.every(satisfiable) : n.kids.some(satisfiable);
  };
  const broken = courses.filter((c) => !satisfiable(c.prereq_tree)).map((c) => c.code);
  assert.deepEqual(broken, []);
});

/* ------------------------------------------------------- quarter availability */

test('ECE 154A is Fall-only per the ECE 2026-27 grid', () => {
  assert.deepEqual(get('ECE 154A').offered_quarters, ['Fall']);
  assert.equal(get('ECE 154A').offering_confidence, 'scheduled');
});

test('a confirmed course in the wrong quarter is refused', () => {
  const r = place('ECE 154A', termKey(3, 'Winter'), { 'Y2-Winter': ['ECE 152A'] });
  assert.equal(r.allowed, false);
  assert.equal(r.status, 'error');
  assert.match(r.message, /not offered in Winter/);
});

test('a confirmed course in the right quarter is accepted', () => {
  const r = place('ECE 154A', termKey(3, 'Fall'), { 'Y2-Winter': ['ECE 152A'] });
  assert.equal(r.allowed, true);
  assert.equal(r.status, 'ok');
});

test('a course the ECE grid marks *NO warns instead of blocking', () => {
  const c = get('ECE 158');
  assert.equal(c.offering_confidence, 'uncertain');
  const r = place('ECE 158', termKey(4, 'Winter'), {
    'Y2-Fall': ['ECE 130A'], 'Y2-Winter': ['ECE 130B'],
  });
  assert.equal(r.allowed, true, r.message);
  assert.equal(r.status, 'warning');
});

test('a course with no published offerings warns instead of blocking', () => {
  const unknown = courses.find((c) => c.offering_confidence === 'unknown' && !c.prereq_tree);
  const r = validatePlacement(unknown, termKey(1, 'Fall'), emptySchedule(), catalog);
  assert.equal(r.allowed, true, r.message);
  assert.equal(r.status, 'warning');
});

test('checkOffering reports ok for a scheduled quarter', () => {
  assert.equal(checkOffering(get('ECE 154A'), 'Fall').status, 'ok');
  assert.equal(checkOffering(get('ECE 154A'), 'Spring').status, 'error');
});

/* -------------------------------------------------------------------- summer */

test('the plan is 4 years x 4 quarters, Summer last', () => {
  assert.deepEqual(QUARTERS, ['Fall', 'Winter', 'Spring', 'Summer']);
  assert.equal(Object.keys(emptySchedule()).length, 16);
  assert.ok('Y1-Summer' in emptySchedule());
});

test('no course in the dataset publishes a summer offering', () => {
  // The premise behind warning rather than blocking on Summer. If UCSB ever
  // publishes summer quarters, this fails and checkOffering should be revisited.
  const withSummer = courses.filter((c) => (c.offered_quarters || []).includes('Summer'));
  assert.deepEqual(withSummer.map((c) => c.code), []);
});

test('Summer warns instead of blocking, even for a Fall-only course', () => {
  // ECE 154A is confirmed Fall-only, so Winter is refused outright -- but Summer
  // Sessions are unpublished here, not known-absent, so it may only warn.
  assert.equal(checkOffering(get('ECE 154A'), 'Summer').status, 'warning');
  const r = place('ECE 154A', termKey(3, 'Summer'), { 'Y2-Winter': ['ECE 152A'] });
  assert.equal(r.allowed, true, r.message);
  assert.equal(r.status, 'warning');
  assert.match(r.message, /Summer Sessions|Confirm it in GOLD/);
});

test('Summer falls after Spring and before the next Fall', () => {
  // ECE 152A taken in Year 1 Summer must satisfy ECE 154A in Year 2 Fall.
  const ok = place('ECE 154A', termKey(2, 'Fall'), { 'Y1-Summer': ['ECE 152A'] });
  assert.equal(ok.allowed, true, ok.message);

  // And the other way round is too late: Y2-Summer comes after Y2-Fall.
  const late = place('ECE 154A', termKey(2, 'Fall'), { 'Y2-Summer': ['ECE 152A'] });
  assert.equal(late.allowed, false);
  assert.match(late.message, /ECE 152A/);

  // Spring of the same year still counts as earlier than Summer.
  const spring = place('ECE 154A', termKey(2, 'Summer'), { 'Y2-Spring': ['ECE 152A'] });
  assert.equal(spring.allowed, true, spring.message);
});

test('a summer course is a real placement: it takes a slot and counts units', () => {
  const plan = planOf({ 'Y1-Summer': ['MATH 3A', 'CMPSC 8'] });
  assert.equal(totalUnits(Object.values(plan).flat()), 8);

  const full = place('ECE 139', termKey(1, 'Summer'), {
    'Y1-Summer': ['ECE 132', 'ECE 133', 'ECE 134', 'ECE 136A', 'ECE 145A'],
  });
  assert.equal(full.allowed, false);
  assert.match(full.message, /already has 5 courses/);
});

/* ------------------------------------------------------------- prerequisites */

test('ECE 154A refuses to go before ECE 152A', () => {
  const r = place('ECE 154A', termKey(2, 'Fall'));
  assert.equal(r.allowed, false);
  assert.match(r.message, /ECE 152A/);
});

test('a prerequisite in the same quarter is not enough', () => {
  // ECE 152A runs Winter/Spring, ECE 153B runs Fall/Spring -- both fit Spring.
  const r = place('ECE 153B', termKey(2, 'Spring'), { 'Y2-Spring': ['ECE 152A'] });
  assert.equal(r.allowed, false);
  assert.match(r.message, /earlier quarter/);
});

test('a prerequisite in an earlier quarter satisfies the requirement', () => {
  const r = place('ECE 153B', termKey(2, 'Spring'), { 'Y2-Winter': ['ECE 152A'] });
  assert.equal(r.allowed, true, r.message);
});

test('"may be taken concurrently" allows the same quarter (ECE 10AL with ECE 10A)', () => {
  const tree = get('ECE 10AL').prereq_tree;
  assert.equal(tree.t, 'course');
  assert.equal(tree.concurrent, true);
  const r = place('ECE 10AL', termKey(1, 'Fall'), { 'Y1-Fall': ['ECE 10A'] });
  assert.equal(r.allowed, true, r.message);
});

test('a non-concurrent prerequisite still requires an earlier quarter (ECE 10B)', () => {
  assert.equal(get('ECE 10B').prereq_tree.concurrent, false);
  const bad = place('ECE 10B', termKey(1, 'Winter'), { 'Y1-Winter': ['ECE 10A'] });
  assert.equal(bad.allowed, false);
  const good = place('ECE 10B', termKey(1, 'Winter'), { 'Y1-Fall': ['ECE 10A'] });
  assert.equal(good.allowed, true, good.message);
});

test('an OR group is satisfied by any one branch (ECE 146A needs ECE 139 or PSTAT 120A)', () => {
  const base = {
    'Y2-Fall': ['ECE 130A'],
    'Y2-Spring': ['ECE 130B'],
  };
  const without = place('ECE 146A', termKey(3, 'Fall'), base);
  assert.equal(without.allowed, false);
  assert.match(without.message, /one of|ECE 139|PSTAT 120A/);

  const withEce139 = place('ECE 146A', termKey(3, 'Fall'), {
    ...base, 'Y2-Winter': ['ECE 139'],
  });
  assert.equal(withEce139.allowed, true, withEce139.message);

  const withPstat = place('ECE 146A', termKey(3, 'Fall'), {
    ...base, 'Y2-Winter': ['PSTAT 120A'],
  });
  assert.equal(withPstat.allowed, true, withPstat.message);
});

test('a retired alternative cannot satisfy a requirement, but the live one can', () => {
  // ECE 152A: (ECE 15A and (ECE 2A or ECE 10A+10AL)) or CMPSC 30 or CMPSC 64.
  // ECE 2A, CMPSC 30 are retired and absent from the catalog.
  assert.equal(catalog.has('ECE 2A'), false);
  const r = place('ECE 152A', termKey(2, 'Winter'), {
    'Y1-Fall': ['ECE 15A', 'ECE 10A', 'ECE 10AL'],
  });
  assert.equal(r.allowed, true, r.message);
});

test('ECE 152A via the CMPSC 64 branch also works', () => {
  const r = place('ECE 152A', termKey(2, 'Spring'), { 'Y2-Winter': ['CMPSC 64'] });
  assert.equal(r.allowed, true, r.message);
});

test('a deep AND chain reports what is actually missing (ECE 137A)', () => {
  const r = place('ECE 137A', termKey(3, 'Winter'), {
    'Y1-Fall': ['ECE 10A', 'ECE 10AL'],
    'Y1-Winter': ['ECE 10B', 'ECE 10BL'],
    'Y1-Spring': ['ECE 10C', 'ECE 10CL'],
  });
  assert.equal(r.allowed, false);
  assert.match(r.message, /ECE 130A/);
  assert.match(r.message, /ECE 132/);
});

test('a fully satisfied deep chain is accepted (ECE 137A)', () => {
  const r = place('ECE 137A', termKey(3, 'Winter'), {
    'Y1-Fall': ['ECE 10A', 'ECE 10AL'],
    'Y1-Winter': ['ECE 10B', 'ECE 10BL'],
    'Y1-Spring': ['ECE 10C', 'ECE 10CL'],
    'Y2-Fall': ['ECE 130A', 'ECE 132'],
  });
  assert.equal(r.allowed, true, r.message);
});

test('courses the catalog says are only recommended do not block (ECE 130C)', () => {
  assert.equal(get('ECE 130C').prereq_tree, null);
  const r = place('ECE 130C', termKey(3, 'Spring'));
  assert.equal(r.allowed, true, r.message);
});

/* -------------------------------------------------------------- housekeeping */

test('the same course cannot be scheduled twice', () => {
  const r = place('ECE 139', termKey(3, 'Fall'), { 'Y2-Fall': ['ECE 139'] });
  assert.equal(r.allowed, false);
  assert.match(r.message, /already in your plan/);
});

test('a quarter cannot hold more than five courses', () => {
  const r = place('ECE 139', termKey(2, 'Fall'), {
    'Y2-Fall': ['ECE 132', 'ECE 133', 'ECE 134', 'ECE 136A', 'ECE 145A'],
  });
  assert.equal(r.allowed, false);
  assert.match(r.message, /already has 5 courses/);
});

/* -------------------------------------------------------------- whole-plan check */

test('validatePlan flags a course whose prerequisite is missing', () => {
  const broken = planOf({ 'Y3-Fall': ['ECE 154A'] });
  const issue = validatePlan(broken, catalog).byCode['ECE 154A'];
  assert.ok(issue, 'ECE 154A should be flagged with no ECE 152A in the plan');
  assert.equal(issue.status, 'error');
  assert.match(issue.message, /ECE 152A/);
});

test('validatePlan clears a course once its prerequisite is in place', () => {
  const fixed = planOf({ 'Y2-Winter': ['ECE 152A'], 'Y3-Fall': ['ECE 154A'] });
  // ECE 152A's own prerequisites are still unmet here, so it stays flagged --
  // but ECE 154A must not be.
  assert.equal(validatePlan(fixed, catalog).byCode['ECE 154A'], undefined);
});

test('validatePlan reports a *NO course as a warning, not an error', () => {
  const plan = planOf({
    'Y2-Fall': ['ECE 130A'],
    'Y2-Winter': ['ECE 130B'],
    'Y4-Spring': ['ECE 158'],
  });
  const issue = validatePlan(plan, catalog).byCode['ECE 158'];
  assert.ok(issue);
  assert.equal(issue.status, 'warning');
});

test('a plan built from the bottom up has no errors at all', () => {
  // Every prerequisite chain satisfied from scratch, in quarters UCSB publishes.
  const plan = planOf({
    'Y1-Fall': ['MATH 3A', 'ENGR 3'],
    'Y1-Winter': ['MATH 3B', 'CMPSC 16'],
    'Y1-Spring': ['MATH 4A', 'CMPSC 24', 'PHYS 7A'],
    'Y2-Fall': ['MATH 4B', 'PHYS 7B', 'ECE 10A', 'ECE 10AL', 'ECE 15A'],
    'Y2-Winter': ['ECE 10B', 'ECE 10BL', 'ECE 130A', 'ECE 152A'],
    'Y2-Spring': ['ECE 10C', 'ECE 10CL', 'ECE 139'],
    'Y3-Fall': ['ECE 154A'],
    'Y3-Winter': ['ECE 154B'],
  });
  const report = validatePlan(plan, catalog);
  assert.deepEqual(
    report.errors.map((e) => `${e.code}: ${e.message}`),
    []
  );
});

test('failure messages bracket an "and" nested inside an "or"', () => {
  // ECE 10A: (MATH 2A and 2B) or (MATH 3A and 3B) or (MATH 3AH and 3BH), ...
  const r = place('ECE 10A', termKey(1, 'Fall'));
  assert.equal(r.allowed, false);
  assert.match(r.message, /one of \(MATH 2A and MATH 2B\) \/ \(MATH 3A and MATH 3B\)/);
  // The retired MATH 3AH / 3BH branch is dropped as unactionable.
  assert.ok(!r.message.includes('MATH 3AH'), r.message);
});

/* -------------------------------------------------------------- presentation */

test('prerequisite trees render readably', () => {
  assert.equal(
    describePrereqTree(get('ECE 146A').prereq_tree),
    'ECE 130A; ECE 130B; one of ECE 139 / PSTAT 120A'
  );
  assert.equal(describePrereqTree(get('ECE 10AL').prereq_tree), 'ECE 10A (may be concurrent)');
  assert.equal(describePrereqTree(null), '');
});

test('unit totals add up', () => {
  assert.equal(totalUnits([get('ECE 10A'), get('ECE 10AL')]), 5);
  assert.equal(totalUnits([]), 0);
});

/* ------------------------------------------------------------------ overrides */

test('prior credit satisfies a prerequisite without taking a slot (MATH 4B)', () => {
  // ECE 130A needs MATH 4B or MATH 5A. With AP / transfer credit for MATH 4B it
  // should drop into Year 1 Fall, which is the earliest term there is.
  const blocked = place('ECE 130A', termKey(1, 'Fall'));
  assert.equal(blocked.allowed, false);
  assert.match(blocked.message, /MATH 4B/);

  const withCredit = validatePlacement(
    get('ECE 130A'), termKey(1, 'Fall'), emptySchedule(), catalog,
    { priorCredit: ['MATH 4B'] }
  );
  assert.equal(withCredit.allowed, true, withCredit.message);
  assert.equal(withCredit.status, 'ok');
});

test('a credited course cannot also be scheduled', () => {
  const r = validatePlacement(
    get('MATH 4B'), termKey(2, 'Fall'), emptySchedule(), catalog,
    { priorCredit: ['MATH 4B'] }
  );
  assert.equal(r.allowed, false);
  assert.match(r.message, /already have credit/);
});

test('waiving a course\'s prerequisites lets it be placed (CMPSC 16)', () => {
  // CMPSC 16 needs (MATH 3A or 2A) and (CMPSC 8 or ENGR 3 or ECE 3); the catalog
  // itself ends "...or significant prior programming experience".
  const blocked = place('CMPSC 16', termKey(1, 'Fall'));
  assert.equal(blocked.allowed, false);
  assert.match(blocked.message, /CMPSC 8|ENGR 3|ECE 3/);

  const waived = validatePlacement(
    get('CMPSC 16'), termKey(1, 'Fall'), emptySchedule(), catalog,
    { prereqWaivers: ['CMPSC 16'] }
  );
  assert.equal(waived.allowed, true, waived.message);
  assert.equal(waived.status, 'warning');
  assert.match(waived.message, /waived/);
});

test('a waiver applies only to the waived course', () => {
  // Waiving CMPSC 16 must not also excuse CMPSC 24, which needs CMPSC 16.
  const r = validatePlacement(
    get('CMPSC 24'), termKey(1, 'Fall'), emptySchedule(), catalog,
    { prereqWaivers: ['CMPSC 16'] }
  );
  assert.equal(r.allowed, false);
  assert.match(r.message, /CMPSC 16/);
});

test('a waived course still needs its own quarter to be right', () => {
  // ECE 154A runs Fall only; waiving its prerequisites must not waive that.
  const r = validatePlacement(
    get('ECE 154A'), termKey(2, 'Winter'), emptySchedule(), catalog,
    { prereqWaivers: ['ECE 154A'] }
  );
  assert.equal(r.allowed, false);
  assert.match(r.message, /not offered in Winter/);
});

test('validatePlan reports a waiver as a warning, and clears prior-credit gaps', () => {
  const plan = planOf({ 'Y1-Fall': ['CMPSC 16', 'ECE 130A'] });

  const bare = validatePlan(plan, catalog);
  assert.equal(bare.byCode['CMPSC 16'].status, 'error');
  assert.equal(bare.byCode['ECE 130A'].status, 'error');

  const overridden = validatePlan(plan, catalog, {
    prereqWaivers: ['CMPSC 16'],
    priorCredit: ['MATH 4B'],
  });
  assert.equal(overridden.errors.length, 0,
    overridden.errors.map((e) => e.message).join(' | '));
  assert.equal(overridden.byCode['CMPSC 16'].status, 'warning');
  assert.equal(overridden.byCode['ECE 130A'], undefined);
});

test('prior credit counts towards degree requirements and units', () => {
  const program = programOf('EE');
  const bare = auditDegree(emptySchedule(), program, { catalog });
  const withCredit = auditDegree(emptySchedule(), program, {
    catalog, priorCredit: ['MATH 4A', 'MATH 4B'],
  });

  const req = (a) => a.groups.flatMap((g) => g.requirements)
    .find((r) => r.label === 'MATH 4A-B');
  assert.equal(req(bare).met, false);
  assert.equal(req(withCredit).met, true);
  assert.equal(withCredit.units.credited, 8);
  assert.equal(withCredit.units.planned, 8);
});

test('prior credit for an approved elective counts towards elective units', () => {
  const audit = auditDegree(emptySchedule(), programOf('EE'), {
    catalog, priorCredit: ['ECE 132'],
  });
  assert.deepEqual(audit.electives.courses, ['ECE 132']);
  assert.equal(audit.electives.units, get('ECE 132').units);
});

test('waiving a course does not excuse the courses that depend on it', () => {
  // Taking CMPSC 16 and MATH 4B in Year 1 Fall without their own prerequisites,
  // while everything downstream still has to have them.
  const overrides = { prereqWaivers: ['CMPSC 16', 'MATH 4B'] };
  const plan = planOf({ 'Y1-Fall': ['CMPSC 16', 'MATH 4B'] });

  // Both sit in Year 1 Fall with nothing behind them.
  assert.equal(validatePlan(plan, catalog, overrides).errors.length, 0);

  // ECE 130A still needs MATH 4B, and gets it only from Year 1 Winter onwards --
  // a waiver is not credit, so it does not move the course earlier.
  const sameTerm = validatePlacement(
    get('ECE 130A'), termKey(1, 'Fall'), plan, catalog, overrides
  );
  assert.equal(sameTerm.allowed, false);
  assert.match(sameTerm.message, /MATH 4B/);

  const laterTerm = validatePlacement(
    get('ECE 130A'), termKey(1, 'Winter'), plan, catalog, overrides
  );
  assert.equal(laterTerm.allowed, true, laterTerm.message);

  // CMPSC 24 still needs CMPSC 16 -- and its own MATH requirement, unwaived.
  const noMath = validatePlacement(
    get('CMPSC 24'), termKey(1, 'Winter'), plan, catalog, overrides
  );
  assert.equal(noMath.allowed, false);
  assert.match(noMath.message, /MATH 3B|MATH 2B/);

  const withMath = validatePlacement(
    get('CMPSC 24'), termKey(1, 'Winter'),
    planOf({ 'Y1-Fall': ['CMPSC 16', 'MATH 4B'], 'Y1-Winter': ['MATH 3B'] }),
    catalog, overrides
  );
  assert.equal(withMath.allowed, true, withMath.message);
});

test('a waived course still occupies a slot, unlike prior credit', () => {
  const waived = auditDegree(
    planOf({ 'Y1-Fall': ['MATH 4B'] }), programOf('EE'),
    { catalog, prereqWaivers: ['MATH 4B'] }
  );
  assert.equal(waived.units.planned, 4);
  assert.equal(waived.units.credited, 0);

  const credited = auditDegree(
    emptySchedule(), programOf('EE'), { catalog, priorCredit: ['MATH 4B'] }
  );
  assert.equal(credited.units.credited, 4);
});

test('overrides default to off, so omitting them changes nothing', () => {
  const plan = planOf({ 'Y2-Winter': ['ECE 152A'], 'Y3-Fall': ['ECE 154A'] });
  assert.deepEqual(
    validatePlan(plan, catalog),
    validatePlan(plan, catalog, {})
  );
  const program = programOf('EE');
  assert.deepEqual(
    auditDegree(plan, program, { catalog }),
    auditDegree(plan, program, { catalog, priorCredit: [], prereqWaivers: [] })
  );
});

/* --------------------------------------------------------------- degree audit */

test('both programs load with requirements, electives and depth options', () => {
  for (const code of ['EE', 'CE']) {
    const p = programOf(code);
    assert.ok(p.groups.length >= 2, code);
    assert.ok(p.electives.codes.length > 20, code);
    assert.ok(p.depth.items.length >= 9, code);
    assert.ok(p.total_units > 150, code);
    assert.match(p.source_url, /^https:\/\/(engineering|www)\.ucsb\.edu\//, code);
  }
});

test('every course a program references exists in the dataset', () => {
  const known = new Set(courses.map((c) => c.code));
  const treeCodes = (n) =>
    n.t === 'course' ? [n.code] : n.kids.flatMap(treeCodes);
  const missing = new Set();
  for (const p of programs) {
    for (const g of p.groups) for (const r of g.requirements) {
      treeCodes(r.tree).forEach((c) => known.has(c) || missing.add(c));
    }
    p.electives.codes.forEach((c) => known.has(c) || missing.add(c));
    for (const item of p.depth.items) for (const rule of item.rules) {
      rule.options.flat().forEach((c) => known.has(c) || missing.add(c));
    }
  }
  assert.deepEqual([...missing], []);
});

test('an empty plan meets nothing and reports every requirement as missing', () => {
  const audit = auditDegree(emptySchedule(), programOf('EE'));
  assert.equal(audit.met, false);
  assert.equal(audit.summary.requiredMet, 0);
  assert.ok(audit.summary.requiredTotal >= 15);
  assert.equal(audit.electives.units, 0);
  assert.equal(audit.depth.completed.length, 0);
  assert.equal(audit.units.planned, 0);
});

test('an "or" requirement is met by either branch (CHEM 1A or 2A or ECE 6)', () => {
  const find = (a) => a.groups.flatMap((g) => g.requirements)
    .find((r) => r.label.startsWith('CHEM 1A'));
  assert.equal(find(auditDegree(planOf({ 'Y1-Fall': ['ECE 6'] }), programOf('EE'))).met, true);
  assert.equal(find(auditDegree(planOf({ 'Y1-Fall': ['CHEM 1A'] }), programOf('EE'))).met, true);
  const none = find(auditDegree(planOf({ 'Y1-Fall': ['ECE 3'] }), programOf('EE')));
  assert.equal(none.met, false);
  assert.deepEqual(none.missing, ['CHEM 1A']);   // cheapest branch to finish
});

test('a partly finished sequence reports what is left (MATH 2A-B or 3A-B)', () => {
  const audit = auditDegree(planOf({ 'Y1-Fall': ['MATH 3A'] }), programOf('EE'));
  const r = audit.groups.flatMap((g) => g.requirements).find((x) => x.label.startsWith('MATH 2A-B'));
  assert.equal(r.met, false);
  assert.deepEqual(r.missing, ['MATH 3B']);      // not the untouched MATH 2A-B branch
});

test('a required course does not also count as an elective', () => {
  // ECE 154A is required for CE and is not on the CE elective list; ECE 130A is on
  // the CE elective list and is not required, so only it should count.
  const audit = auditDegree(
    planOf({ 'Y3-Fall': ['ECE 154A', 'ECE 130A'] }),
    programOf('CE')
  );
  assert.deepEqual(audit.electives.courses, ['ECE 130A']);
});

test('EE: an "all" track completes only when every course is there', () => {
  const track = (a) => a.depth.items.find((d) => d.name.startsWith('High Speed'));
  const partial = auditDegree(
    planOf({ 'Y3-Fall': ['ECE 132', 'ECE 137A'], 'Y3-Spring': ['ECE 137B'] }),
    programOf('EE')
  );
  assert.equal(track(partial).met, false);
  assert.deepEqual(track(partial).remaining, ['ECE 145A', 'ECE 145B']);

  const done = auditDegree(
    planOf({
      'Y3-Fall': ['ECE 132', 'ECE 145A'], 'Y3-Winter': ['ECE 137A', 'ECE 145B'],
      'Y3-Spring': ['ECE 137B'],
    }),
    programOf('EE')
  );
  assert.equal(track(done).met, true);
});

test('EE: an "at least 4 of" track completes on the fourth course', () => {
  const track = (a) => a.depth.items.find((d) => d.name === 'Machine Learning');
  const three = auditDegree(
    planOf({ 'Y3-Fall': ['ECE 133', 'ECE 157A'], 'Y3-Winter': ['ECE 157B'] }),
    programOf('EE')
  );
  assert.equal(track(three).met, false);
  assert.equal(track(three).satisfied, 3);
  assert.equal(track(three).needed, 4);

  const four = auditDegree(
    planOf({ 'Y3-Fall': ['ECE 133', 'ECE 157A'], 'Y3-Winter': ['ECE 157B', 'ECE 180'] }),
    programOf('EE')
  );
  assert.equal(track(four).met, true);
});

test('EE: a two-rule track needs both halves (Computer Architecture)', () => {
  const track = (a) => a.depth.items.find((d) => d.name === 'Computer Architecture');
  const coreOnly = auditDegree(
    planOf({ 'Y3-Fall': ['ECE 154A'], 'Y3-Winter': ['ECE 154B'] }),
    programOf('EE')
  );
  assert.equal(track(coreOnly).met, false);

  const full = auditDegree(
    planOf({
      'Y3-Fall': ['ECE 154A', 'ECE 153A'], 'Y3-Winter': ['ECE 154B', 'ECE 152B'],
    }),
    programOf('EE')
  );
  assert.equal(track(full).met, true);
});

test('CE: a sequence accepts either cross-listed code (ECE 181 or CMPSC 181)', () => {
  const seq = (a) => a.depth.items.find((d) => d.name === 'Multimedia');
  const viaEce = auditDegree(
    planOf({ 'Y3-Fall': ['ECE 180', 'ECE 181'] }), programOf('CE')
  );
  assert.equal(seq(viaEce).met, true);
  const viaCmpsc = auditDegree(
    planOf({ 'Y3-Fall': ['ECE 180'], 'Y3-Winter': ['CMPSC 181'] }), programOf('CE')
  );
  assert.equal(seq(viaCmpsc).met, true);
});

test('CE: needs two sequences, not one', () => {
  const one = auditDegree(
    planOf({ 'Y3-Fall': ['ECE 157A'], 'Y3-Winter': ['ECE 157B'] }), programOf('CE')
  );
  assert.equal(one.depth.completed.length, 1);
  assert.equal(one.depth.met, false);

  const two = auditDegree(
    planOf({
      'Y3-Fall': ['ECE 157A', 'ECE 179D'], 'Y3-Winter': ['ECE 157B', 'ECE 179P'],
    }),
    programOf('CE')
  );
  assert.equal(two.depth.completed.length, 2);
  assert.equal(two.depth.met, true);
});

test('CE: the capstone requirement takes either department route', () => {
  const cap = (a) => a.groups.flatMap((g) => g.requirements)
    .find((r) => r.label.startsWith('Capstone'));
  const viaCmpsc = auditDegree(
    planOf({ 'Y4-Fall': ['CMPSC 189A'], 'Y4-Winter': ['CMPSC 189B'] }), programOf('CE')
  );
  assert.equal(cap(viaCmpsc).met, true);
  const viaEce = auditDegree(
    planOf({ 'Y4-Fall': ['ECE 189A'], 'Y4-Winter': ['ECE 189B'], 'Y4-Spring': ['ECE 189C'] }),
    programOf('CE')
  );
  assert.equal(cap(viaEce).met, true);
});

test('ENGR 101 and CMPSC 41 are in the dataset -- both majors require them', () => {
  const byCode = new Map(courses.map((c) => [c.code, c]));
  const engr = byCode.get('ENGR 101');
  assert.ok(engr, 'ENGR 101 missing');
  assert.deepEqual(engr.offered_quarters, ['Fall', 'Winter', 'Spring']);

  const cmpsc41 = byCode.get('CMPSC 41');
  assert.ok(cmpsc41, 'CMPSC 41 missing');
  // New for 2026-27 and not in the published catalog, so it must warn, never block.
  assert.equal(cmpsc41.offering_confidence, 'unknown');
  assert.match(cmpsc41.catalog_source, /GEAR 2026-27/);
});

test('a full EE plan built to the GEAR sheet satisfies the degree', () => {
  // Follows the EE four-year plan (GEAR 2026-27 p. 25), with the High Speed /
  // High Frequency Integrated Circuits track for depth. Non-major requirements
  // (writing, G.E., free electives) are not modelled, so units fall short by design.
  const plan = planOf({
    'Y1-Fall': ['ECE 3', 'ECE 5', 'MATH 3A'],
    'Y1-Winter': ['CMPSC 16', 'MATH 3B', 'PHYS 7A'],
    'Y1-Spring': ['ECE 6', 'MATH 4A', 'PHYS 7B'],
    'Y2-Fall': ['ECE 10A', 'ECE 10AL', 'MATH 4B', 'PHYS 7C', 'PHYS 7L'],
    'Y2-Winter': ['ECE 10B', 'ECE 10BL', 'ECE 130A', 'MATH 6A', 'PHYS 7D'],
    'Y2-Spring': ['ECE 10C', 'ECE 10CL', 'ECE 130B', 'ECE 139', 'MATH 6B'],
    'Y3-Fall': ['ECE 15A', 'ECE 134', 'ECE 132'],
    'Y3-Winter': ['ECE 152A', 'ECE 137A', 'ECE 144'],
    'Y3-Spring': ['ECE 153B', 'ECE 137B', 'ECE 148'],
    'Y4-Fall': ['ECE 188A', 'ECE 145A', 'ECE 136A'],
    'Y4-Winter': ['ECE 188B', 'ECE 145B', 'ECE 135'],
    'Y4-Spring': ['ECE 188C', 'ENGR 101', 'ECE 145C'],
  });

  const audit = auditDegree(plan, programOf('EE'));

  const unmet = audit.groups.flatMap((g) => g.requirements).filter((r) => !r.met);
  assert.deepEqual(unmet.map((r) => `${r.label} -> needs ${r.missing.join(', ')}`), []);

  assert.equal(audit.depth.met, true);
  assert.ok(
    audit.depth.completed.includes('High Speed, High Frequency Integrated Circuits'),
    `tracks complete: ${audit.depth.completed.join(', ')}`
  );
  assert.equal(audit.electives.met, true,
    `${audit.electives.units} of ${audit.electives.minUnits} elective units`);

  // Every placement in that plan is also legal on prerequisites and quarters.
  assert.deepEqual(
    validatePlan(plan, catalog).errors.map((e) => `${e.code}: ${e.message}`),
    []
  );
});

/* --------------------------------------------------------------------- report */

console.log(results.join('\n'));
const failed = results.length - passed;
console.log(`\n${passed}/${results.length} passed${failed ? `, ${failed} FAILED` : ''}`);
process.exit(failed ? 1 : 0);
