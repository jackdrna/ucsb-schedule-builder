/**
 * Schedule validation against real UCSB rules.
 *
 * A plan is 4 years x 4 quarters. Terms are compared by absolute index, so
 * Year 2 Fall (4) really does come after Year 1 Summer (3).
 *
 * Two kinds of problem are reported:
 *   error   -- the placement breaks a published requirement; the drop is refused
 *   warning -- we cannot confirm the placement is legal; the drop is allowed
 */

/** The three quarters UCSB publishes offerings for. */
export const CORE_QUARTERS = ['Fall', 'Winter', 'Spring'];
export const SUMMER_QUARTER = 'Summer';

/**
 * Summer sits after Spring, so Year 1 Summer (3) precedes Year 2 Fall (4) and a
 * summer course can carry a prerequisite into the following autumn.
 */
export const QUARTERS = [...CORE_QUARTERS, SUMMER_QUARTER];
export const YEARS = [1, 2, 3, 4];
export const SLOTS_PER_QUARTER = 5;

/** Term key used throughout the app, e.g. 'Y2-Winter'. */
export function termKey(year, quarter) {
  return `Y${year}-${quarter}`;
}

export function allTermKeys() {
  return YEARS.flatMap((y) => QUARTERS.map((q) => termKey(y, q)));
}

export function parseTermKey(key) {
  const m = /^Y(\d)-(Fall|Winter|Spring|Summer)$/.exec(key || '');
  if (!m) return null;
  return { year: Number(m[1]), quarter: m[2] };
}

/** Absolute position of a term in the plan: Y1 Fall = 0 ... Y4 Summer = 15. */
export function termIndex(key) {
  const t = parseTermKey(key);
  if (!t) return -1;
  return (t.year - 1) * QUARTERS.length + QUARTERS.indexOf(t.quarter);
}

export function termLabel(key) {
  const t = parseTermKey(key);
  return t ? `Year ${t.year} ${t.quarter}` : key;
}

export function emptySchedule() {
  return Object.fromEntries(allTermKeys().map((k) => [k, []]));
}

/* ------------------------------------------------------------------ offerings */

/**
 * Is `course` offered in `quarter`?
 * -> { status: 'ok' | 'error' | 'warning', message }
 *
 * A course is only hard-blocked when UCSB actually publishes its quarters. When
 * the ECE grid says *NO or TBA, or nothing is published at all, we warn instead
 * of blocking, because the course may still show up in GOLD.
 *
 * Summer is always a warning. Every source this app reads -- the General Catalog,
 * the ECE course grid and the Schedule of Classes harvest -- covers Fall, Winter
 * and Spring only, so no course in the dataset lists a summer quarter. Blocking on
 * that absence would refuse every confirmed course from Summer Sessions, which do
 * run; the honest answer is that we cannot check it.
 */
export function checkOffering(course, quarter) {
  const offered = course.offered_quarters || [];
  const confidence = course.offering_confidence || 'unknown';
  const trusted = confidence === 'scheduled' || confidence === 'historical';

  if (quarter === SUMMER_QUARTER) {
    return {
      status: 'warning',
      message:
        `UCSB does not publish Summer Sessions offerings in the sources behind this ` +
        `app, so ${course.code} in Summer cannot be checked` +
        `${offered.length ? ` (it runs in ${listOf(offered)} during the year)` : ''}. ` +
        `Confirm it in GOLD.`,
    };
  }

  if (offered.includes(quarter)) {
    if (trusted) return { status: 'ok', message: '' };
    return {
      status: 'warning',
      message:
        `${course.code} is usually offered in ${quarter}, but UCSB has not confirmed it ` +
        `for this year${noteTail(course.offering_notes)}.`,
    };
  }

  if (!trusted) {
    return {
      status: 'warning',
      message:
        `No confirmed quarter for ${course.code}` +
        `${offered.length ? ` (recently offered in ${listOf(offered)})` : ''}` +
        `. Check GOLD before relying on ${quarter}${noteTail(course.offering_notes)}.`,
    };
  }

  return {
    status: 'error',
    message: offered.length
      ? `${course.code} is not offered in ${quarter}. It runs in ${listOf(offered)}.`
      : `${course.code} has no offered quarters on record.`,
  };
}

function listOf(items) {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function noteTail(notes) {
  return notes && notes.length ? ` (${notes[0]})` : '';
}

/* ------------------------------------------------------------------ overrides */

/**
 * Per-student overrides. Neither changes the UCSB data; both record something the
 * app cannot know from the catalog alone.
 *
 *   priorCredit    courses already completed -- AP or exam credit, transfer work,
 *                  community college, or a course taken before this plan starts.
 *                  They satisfy prerequisites anywhere and count towards the
 *                  degree, without taking up a slot in the grid.
 *
 *   prereqWaivers  courses whose own prerequisites should not be enforced, for a
 *                  placement test, a departmental exception, or an escape hatch the
 *                  catalog itself offers -- CMPSC 16 ends "...or significant prior
 *                  programming experience", which no course code can express.
 *
 * Accepts a Set, an array, or nothing.
 */
export function asCodeSet(value) {
  if (!value) return new Set();
  return value instanceof Set ? value : new Set(value);
}

/** Prior credit sits before the plan starts, so it satisfies any deadline. */
const PRIOR_CREDIT_TERM = -1;

/* --------------------------------------------------------------- prerequisites */

/**
 * Where each course sits in the plan.
 * -> Map from course code to its term index; prior credit maps to -1.
 */
export function placementMap(schedule, { exclude, priorCredit } = {}) {
  const map = new Map();
  for (const code of asCodeSet(priorCredit)) {
    if (code !== exclude) map.set(code, PRIOR_CREDIT_TERM);
  }
  for (const [key, courses] of Object.entries(schedule)) {
    const idx = termIndex(key);
    for (const c of courses) {
      if (exclude && c.code === exclude) continue;
      // If a course somehow appears twice, the earliest placement wins.
      if (!map.has(c.code) || map.get(c.code) > idx) map.set(c.code, idx);
    }
  }
  return map;
}

/**
 * Can `node` be satisfied for a course placed at `target`?
 * `catalog` is a Map from code to course, used to spot prerequisites that no
 * longer exist (retired alternatives such as ECE 2A or MATH 5A).
 */
function evaluate(node, target, placed, catalog) {
  if (!node) return { ok: true };

  if (node.t === 'course') {
    const at = placed.get(node.code);
    const deadline = node.concurrent ? target : target - 1;
    if (at !== undefined && at <= deadline) return { ok: true };
    return {
      ok: false,
      code: node.code,
      retired: !catalog.has(node.code),
      scheduledLate: at !== undefined,
      concurrent: !!node.concurrent,
    };
  }

  const results = node.kids.map((k) => evaluate(k, target, placed, catalog));

  if (node.t === 'and') {
    const failures = results.filter((r) => !r.ok);
    if (failures.length === 0) return { ok: true };
    return { ok: false, all: failures };
  }

  // 'or' -- satisfied by any one branch
  if (results.some((r) => r.ok)) return { ok: true };
  return { ok: false, any: results };
}

/**
 * Turn a failed evaluation into something a student can act on.
 * `nested` adds brackets so an "and" inside an "or" stays readable.
 */
function describe(fail, nested = false) {
  if (fail.code) {
    if (fail.scheduledLate) {
      return fail.concurrent
        ? `${fail.code} (scheduled too late)`
        : `${fail.code} (must be in an earlier quarter)`;
    }
    return fail.retired ? `${fail.code} (no longer offered)` : fail.code;
  }

  if (fail.all) {
    const text = fail.all.map((f) => describe(f, true)).join(' and ');
    return nested && fail.all.length > 1 ? `(${text})` : text;
  }

  if (fail.any) {
    // Retired alternatives are noise -- a student cannot act on them.
    const live = fail.any.filter((f) => !isRetiredBranch(f));
    const parts = (live.length ? live : fail.any).map((f) => describe(f, true));
    if (parts.length === 1) return parts[0];
    return `one of ${parts.join(' / ')}`;
  }

  return 'an unlisted requirement';
}

/** True if every course in a failed branch is a course UCSB no longer offers. */
function isRetiredBranch(fail) {
  if (fail.code) return !!fail.retired;
  const kids = fail.all || fail.any || [];
  return kids.length > 0 && kids.every(isRetiredBranch);
}

/**
 * Are `course`'s prerequisites met if it sits in `termKey`?
 * -> { status: 'ok' | 'error' | 'waived', message }
 */
export function checkPrerequisites(course, key, schedule, catalog, options = {}) {
  const tree = course.prereq_tree;
  if (!tree) return { status: 'ok', message: '' };

  if (asCodeSet(options.prereqWaivers).has(course.code)) {
    return {
      status: 'waived',
      message: `Prerequisites for ${course.code} are marked waived.`,
    };
  }

  const target = termIndex(key);
  const placed = placementMap(schedule, {
    exclude: course.code,
    priorCredit: options.priorCredit,
  });
  const result = evaluate(tree, target, placed, catalog);
  if (result.ok) return { status: 'ok', message: '' };

  return {
    status: 'error',
    message: `${course.code} needs ${describe(result)} before ${termLabel(key)}.`,
  };
}

/* ------------------------------------------------------------------ placement */

/**
 * Should this course be allowed into this term?
 * -> { allowed, status: 'ok' | 'error' | 'warning', message }
 */
export function validatePlacement(course, key, schedule, catalog, options = {}) {
  const t = parseTermKey(key);
  if (!t) return { allowed: false, status: 'error', message: 'Unknown term.' };

  if (asCodeSet(options.priorCredit).has(course.code)) {
    return {
      allowed: false,
      status: 'error',
      message: `You already have credit for ${course.code}, so it does not need a slot. ` +
        `Remove the credit first if you mean to take it again.`,
    };
  }

  const already = Object.entries(schedule).find(
    ([k, list]) => k !== key && list.some((c) => c.code === course.code)
  );
  if (already) {
    return {
      allowed: false,
      status: 'error',
      message: `${course.code} is already in your plan (${termLabel(already[0])}).`,
    };
  }

  if ((schedule[key] || []).length >= SLOTS_PER_QUARTER) {
    return {
      allowed: false,
      status: 'error',
      message: `${termLabel(key)} already has ${SLOTS_PER_QUARTER} courses.`,
    };
  }

  const prereq = checkPrerequisites(course, key, schedule, catalog, options);
  if (prereq.status === 'error') {
    return { allowed: false, status: 'error', message: prereq.message };
  }

  const offering = checkOffering(course, t.quarter);
  if (offering.status === 'error') {
    return { allowed: false, status: 'error', message: offering.message };
  }
  if (offering.status === 'warning') {
    return { allowed: true, status: 'warning', message: offering.message };
  }
  if (prereq.status === 'waived') {
    return { allowed: true, status: 'warning', message: prereq.message };
  }

  return { allowed: true, status: 'ok', message: '' };
}

/**
 * Re-check the whole plan. Moving or removing a course can break a course placed
 * later, so every placement is validated against the current plan.
 * -> { byCode: { CODE: {status, message} }, errors: [...], warnings: [...] }
 */
export function validatePlan(schedule, catalog, options = {}) {
  const byCode = {};
  const errors = [];
  const warnings = [];

  for (const [key, courses] of Object.entries(schedule)) {
    const t = parseTermKey(key);
    if (!t) continue;
    for (const course of courses) {
      const messages = [];
      let status = 'ok';

      const prereq = checkPrerequisites(course, key, schedule, catalog, options);
      if (prereq.status === 'error') {
        status = 'error';
        messages.push(prereq.message);
      } else if (prereq.status === 'waived') {
        status = 'warning';
        messages.push(prereq.message);
      }

      const offering = checkOffering(course, t.quarter);
      if (offering.status === 'error') {
        status = 'error';
        messages.push(offering.message);
      } else if (offering.status === 'warning' && status !== 'error') {
        status = 'warning';
        messages.push(offering.message);
      }

      if (status !== 'ok') {
        const entry = { code: course.code, term: key, status, message: messages.join(' ') };
        byCode[course.code] = entry;
        (status === 'error' ? errors : warnings).push(entry);
      }
    }
  }

  return { byCode, errors, warnings };
}

/* -------------------------------------------------------------- degree audit */

/**
 * Progress towards a degree, given a plan and a program definition from
 * /api/programs.
 *
 * This is a completion check, not a sequencing one: a required course counts
 * wherever it sits in the plan. Prerequisite ordering is already handled by
 * validatePlan, so flagging it twice would only add noise.
 *
 * -> {
 * Courses in `options.priorCredit` count as taken. Pass `options.catalog` too, so
 * their units can be looked up.
 *
 * -> {
 *      groups:    [{ id, name, requirements: [{ label, met, missing, units, note }] }],
 *      electives: { name, minUnits, units, courses, met, note },
 *      depth:     { name, label, minComplete, completed, items: [...], met, note },
 *      units:     { planned, credited, required, met },
 *      met:       boolean,
 *      summary:   { requiredMet, requiredTotal }
 *    }
 */
export function auditDegree(schedule, program, options = {}) {
  if (!program) return null;

  // Prior credit counts towards the degree exactly like a scheduled course --
  // the units were earned, so requirements and elective totals must see them.
  const credit = asCodeSet(options.priorCredit);
  const catalog = options.catalog || new Map();
  const credited = [...credit].map((code) => catalog.get(code) || { code, units: 0 });

  const planned = [...Object.values(schedule).flat(), ...credited];
  const plannedCodes = new Set(planned.map((c) => c.code));
  const has = (code) => plannedCodes.has(code);

  // Which courses a required slot consumed, so electives cannot double-count them.
  const consumed = new Set();

  const groups = (program.groups || []).map((group) => ({
    id: group.id,
    name: group.name,
    requirements: group.requirements.map((r) => {
      const missing = unmetCodes(r.tree, has);
      const met = missing === null;
      if (met) satisfiedCodes(r.tree, has).forEach((c) => consumed.add(c));
      return {
        label: r.label,
        units: r.units ?? null,
        note: r.note ?? null,
        met,
        missing: missing || [],
      };
    }),
  }));

  const requiredAll = groups.flatMap((g) => g.requirements);
  const requiredMet = requiredAll.filter((r) => r.met).length;

  // Electives: planned courses on the approved list that a required slot did not use.
  const electiveSpec = program.electives || { codes: [], min_units: 0 };
  const approved = new Set(electiveSpec.codes || []);
  const electiveCourses = planned.filter((c) => approved.has(c.code) && !consumed.has(c.code));
  const electiveUnits = totalUnits(electiveCourses);
  const minElectiveUnits = electiveSpec.min_units || 0;

  // Tracks (EE) or senior elective sequences (CE).
  const depthSpec = program.depth || { items: [], min_complete: 0, label: 'sequence' };
  const depthItems = (depthSpec.items || []).map((item) => {
    const rules = item.rules.map((rule) => evaluateDepthRule(rule, has));
    const satisfiedOptions = rules.reduce((n, r) => n + r.satisfied.length, 0);
    const totalNeeded = rules.reduce((n, r) => n + r.needed, 0);
    return {
      name: item.name,
      met: rules.every((r) => r.met),
      satisfied: satisfiedOptions,
      needed: totalNeeded,
      remaining: rules.flatMap((r) => (r.met ? [] : r.remaining)),
    };
  });
  const completedDepth = depthItems.filter((d) => d.met);
  const minDepth = depthSpec.min_complete || 0;

  const plannedUnits = totalUnits(planned);
  const requiredUnits = program.total_units || 0;

  const electivesMet = electiveUnits >= minElectiveUnits;
  const depthMet = completedDepth.length >= minDepth;
  const unitsMet = plannedUnits >= requiredUnits;

  return {
    program: { code: program.code, name: program.name, catalogYear: program.catalog_year },
    groups,
    electives: {
      name: electiveSpec.name || 'Electives',
      minUnits: minElectiveUnits,
      units: electiveUnits,
      courses: electiveCourses.map((c) => c.code),
      met: electivesMet,
      note: electiveSpec.note || null,
    },
    depth: {
      name: depthSpec.name || 'Depth',
      label: depthSpec.label || 'sequence',
      minComplete: minDepth,
      completed: completedDepth.map((d) => d.name),
      items: depthItems,
      met: depthMet,
      note: depthSpec.note || null,
    },
    units: {
      planned: plannedUnits,
      credited: totalUnits(credited),
      required: requiredUnits,
      met: unitsMet,
    },
    summary: { requiredMet, requiredTotal: requiredAll.length },
    met: requiredMet === requiredAll.length && electivesMet && depthMet && unitsMet,
  };
}

/**
 * Which courses are still needed to satisfy a requirement tree.
 * Returns null when the requirement is already met.
 */
function unmetCodes(node, has) {
  if (!node) return null;

  if (node.t === 'course') return has(node.code) ? null : [node.code];

  if (node.t === 'and') {
    const missing = node.kids.flatMap((k) => unmetCodes(k, has) || []);
    return missing.length ? missing : null;
  }

  // 'or' -- met if any branch is; otherwise report the cheapest branch to finish.
  const branches = node.kids.map((k) => unmetCodes(k, has));
  if (branches.some((b) => b === null)) return null;
  return branches.reduce((best, b) => (best === null || b.length < best.length ? b : best), null);
}

/** The courses a satisfied tree actually used, so electives cannot reuse them. */
function satisfiedCodes(node, has) {
  if (!node) return [];
  if (node.t === 'course') return has(node.code) ? [node.code] : [];
  if (node.t === 'and') return node.kids.flatMap((k) => satisfiedCodes(k, has));
  for (const kid of node.kids) {
    if (unmetCodes(kid, has) === null) return satisfiedCodes(kid, has);
  }
  return [];
}

/** Evaluate one track/sequence rule. An option is met if any of its codes is planned. */
function evaluateDepthRule(rule, has) {
  const options = rule.options.map((codes) => ({ codes, met: codes.some(has) }));
  const satisfied = options.filter((o) => o.met);
  const needed = rule.kind === 'all' ? options.length : rule.n;
  const met = satisfied.length >= needed;
  return {
    met,
    needed,
    satisfied: satisfied.map((o) => o.codes.find(has)),
    remaining: options.filter((o) => !o.met).map((o) => o.codes.join(' or ')),
  };
}

/* ---------------------------------------------------------------- presentation */

/** Render a prerequisite tree as text: 'ECE 130A and one of ECE 139 / PSTAT 120A'. */
export function describePrereqTree(node, depth = 0) {
  if (!node) return '';
  if (node.t === 'course') {
    return node.code + (node.concurrent ? ' (may be concurrent)' : '');
  }
  const parts = node.kids.map((k) => describePrereqTree(k, depth + 1));
  if (node.t === 'and') return parts.join(depth === 0 ? '; ' : ' and ');
  return parts.length > 1 ? `one of ${parts.join(' / ')}` : parts[0];
}

export function totalUnits(courses) {
  return courses.reduce((sum, c) => sum + (Number(c.units) || 0), 0);
}
