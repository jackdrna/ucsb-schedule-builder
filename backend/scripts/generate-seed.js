/**
 * Generate backend/db/seed.sql from backend/data/ucsb-courses.json.
 *
 * The JSON is produced by backend/scripts/ucsb/build_dataset.py, which merges the
 * UCSB General Catalog, the ECE department's quarter-offering grid, and the UCSB
 * Schedule of Classes. See backend/scripts/ucsb/README.md.
 *
 *   node backend/scripts/generate-seed.js
 */
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data', 'ucsb-courses.json');
const PROGRAMS = path.join(__dirname, '..', 'data', 'ucsb-requirements.json');
const OUT = path.join(__dirname, '..', 'db', 'seed.sql');

const courses = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const programs = JSON.parse(fs.readFileSync(PROGRAMS, 'utf8'));

const q = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const num = (v) => (v === null || v === undefined ? 'NULL' : String(v));
const arr = (items) =>
  !items || items.length === 0
    ? "'{}'"
    : `ARRAY[${items.map(q).join(', ')}]::TEXT[]`;
const jsonb = (v) => (v === null || v === undefined ? 'NULL' : `${q(JSON.stringify(v))}::JSONB`);

/** Flatten a prereq tree into unique {code, concurrent} edges. */
function edgesOf(node, out = new Map()) {
  if (!node) return out;
  if (node.t === 'course') {
    // If a course appears both ways, concurrency is the more permissive option.
    out.set(node.code, (out.get(node.code) || false) || !!node.concurrent);
    return out;
  }
  for (const kid of node.kids) edgesOf(kid, out);
  return out;
}

const lines = [];
lines.push('-- GENERATED FILE -- do not edit by hand.');
lines.push('-- Regenerate with: node backend/scripts/generate-seed.js');
lines.push(`-- ${courses.length} UCSB courses, sourced from catalog.ucsb.edu,`);
lines.push('-- www.ece.ucsb.edu/undergrad/courses and my.sa.ucsb.edu/public/curriculum.');
lines.push('');
lines.push('BEGIN;');
lines.push('TRUNCATE TABLE courses RESTART IDENTITY CASCADE;');
lines.push('TRUNCATE TABLE programs RESTART IDENTITY CASCADE;');
lines.push('');

lines.push(
  'INSERT INTO courses (code, subject, number, title, short_title, units, description,',
  '  college, restricted_majors, prereq_raw, prereq_tree, prereq_notes, offered_quarters,',
  '  offering_confidence, offering_notes, offering_source, offering_source_url,',
  '  catalog_source, catalog_url) VALUES'
);

const values = courses.map(
  (c) =>
    `  (${q(c.code)}, ${q(c.subject)}, ${q(c.number)}, ${q(c.title)}, ${q(c.short_title)}, ` +
    `${num(c.units)}, ${q(c.description)}, ${q(c.college)}, ${arr(c.restricted_majors)}, ` +
    `${q(c.prereq_raw)}, ${jsonb(c.prereq_tree)}, ${arr(c.prereq_notes)}, ` +
    `${arr(c.offered_quarters)}, ${q(c.offering_confidence)}, ${arr(c.offering_notes)}, ` +
    `${q(c.offering_source)}, ${q(c.offering_source_url)}, ${q(c.catalog_source)}, ` +
    `${q(c.catalog_url)})`
);
lines.push(values.join(',\n') + ';');
lines.push('');

// Derived prerequisite edges. prereq_id stays NULL for retired courses that the
// catalog still names as alternatives (ECE 2A, MATH 5A, ...).
const edgeRows = [];
for (const c of courses) {
  for (const [code, concurrent] of edgesOf(c.prereq_tree)) {
    edgeRows.push(`  (${q(c.code)}, ${q(code)}, ${concurrent ? 'TRUE' : 'FALSE'})`);
  }
}

lines.push('INSERT INTO prerequisite_edges (course_id, prereq_code, prereq_id, concurrent)');
lines.push('SELECT c.id, e.prereq_code, p.id, e.concurrent');
lines.push('FROM (VALUES');
lines.push(edgeRows.join(',\n'));
lines.push(') AS e(course_code, prereq_code, concurrent)');
lines.push('JOIN courses c ON c.code = e.course_code');
lines.push('LEFT JOIN courses p ON p.code = e.prereq_code;');
lines.push('');

// Degree requirements. The nested spec (groups / electives / depth) goes in one
// JSONB column; the scalars people query by get their own columns.
lines.push(
  'INSERT INTO programs (code, name, catalog_year, total_units, source, source_url,',
  '  definition) VALUES'
);
lines.push(
  programs
    .map((p) => {
      const { code, name, catalog_year: year, total_units: units, source, source_url: url,
        ...definition } = p;
      return `  (${q(code)}, ${q(name)}, ${q(year)}, ${num(units)}, ${q(source)}, ` +
        `${q(url)}, ${jsonb(definition)})`;
    })
    .join(',\n') + ';'
);
lines.push('');
lines.push('COMMIT;');
lines.push('');

fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
console.log(`Wrote ${OUT}`);
console.log(`  ${courses.length} courses, ${edgeRows.length} prerequisite edges`);
console.log(`  ${programs.length} programs: ${programs.map((p) => p.code).join(', ')}`);
