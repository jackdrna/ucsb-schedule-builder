import React, { useLayoutEffect, useState } from 'react';
import './PrereqArrows.css';

const CELL = 12;         // routing grid pitch; also the spacing of parallel arrows
const CLEARANCE = 12;    // how far a line's centre keeps off a highlighted course
const CORNER = 40;       // bend radius, which turns the grid route into a curve
const HEAD_LEN = 18;
const HEAD_HALF = 11;
const START_TUCK = 10;   // lines start this far under their source course
const EDGE_INSET = 0.18; // share of an edge at each end that arrows keep clear of
const SEARCH_MARGIN = 20;
const MAX_EXPANSIONS = 80000;
// When no clear route turns up close by, search again this much wider and
// longer, while the whole layout is still inside its time budget. An arrow with
// no clear route at all is left out rather than drawn across a traced course;
// its course is still lifted above the tint.
const WIDE_MARGIN = 80;
const WIDE_EXPANSIONS = 150000;
const WIDE_BUDGET_MS = 1000;
// A search area past this many states keeps its bookkeeping in maps rather than
// arrays: a tall grid of full cards can span a hundred thousand pixels, and
// allocating every state along an arrow's whole bounding box costs more than
// the handful of cells near the line the search ever visits.
const DENSE_LIMIT = 2000000;
const HEURISTIC_WEIGHT = 1.3; // see search()
const LONG_RUN = 1200;    // vertical trips longer than this ride a straight lane (px)
const GAP_LEG = 160;      // how far from each end a lane run starts and stops (px)

// Turning costs, in cells. A 45-degree bend is cheap and a right angle dearer,
// so runs stay straight and dog-legs prefer the diagonal. Nothing sharper is allowed.
const TURN_COST = [0, 0.5, 2.5];
const EDGE_TURN_COST = [0, 1.5, 4]; // extra for bending right as a line leaves its course
const BOTTOM_ENTRY_COST = 8;         // arrows point into tops and sides by preference
// Crowding costs, per cell. Running along another arrow on the same heading is
// what makes lines pile up, so that is dear, and dearer the closer the two run;
// crossing one at an angle is cheap, so arrows cross rather than detour.
const PARALLEL_COST = 10;  // per cell another arrow runs through on the same heading
const NEAR_WEIGHT = 0.4;   // share of that one cell to the side (lines 12px apart)
const FAR_WEIGHT = 0.15;   // and two cells to the side (24px apart)
const CROSS_COST = 1;      // per cell holding another arrow on any heading

/** 0 for straight on, 1 for a 45-degree turn, 2 for a right angle, and so on. */
const turnSize = (a, b) => Math.min((a - b + 8) % 8, (b - a + 8) % 8);

// Eight headings, clockwise from east; screen y runs downward.
const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const OUTWARD = { right: 0, bottom: 2, left: 4, top: 6 };

/** Every node's box, relative to the positioned canvas. */
function measure(container) {
  const nodes = new Map();
  for (const el of container.querySelectorAll('[data-code]')) {
    nodes.set(el.dataset.code, {
      code: el.dataset.code,
      left: el.offsetLeft,
      top: el.offsetTop,
      width: el.offsetWidth,
      height: el.offsetHeight,
    });
  }
  return { nodes, width: container.clientWidth };
}

/**
 * The places an arrow can meet `node`: grid-aligned points along each edge,
 * each paired with the grid point just clear of the node where the line joins
 * the grid. Every arrow shares one grid, so no end needs a jog to line up.
 */
function slots(node) {
  const out = [];
  const reach = CLEARANCE + 1;
  const along = (from, to) => {
    const lo = Math.ceil((from + (to - from) * EDGE_INSET) / CELL);
    const hi = Math.floor((to - (to - from) * EDGE_INSET) / CELL);
    const list = [];
    for (let i = lo; i <= hi; i += 1) list.push(i);
    return list;
  };
  const right = node.left + node.width;
  const bottom = node.top + node.height;
  const topRow = Math.floor((node.top - reach) / CELL);
  const bottomRow = Math.ceil((bottom + reach) / CELL);
  const leftCol = Math.floor((node.left - reach) / CELL);
  const rightCol = Math.ceil((right + reach) / CELL);
  for (const i of along(node.left, right)) {
    out.push({ side: 'top', pos: i, edge: [i * CELL, node.top], cell: [i, topRow] });
    out.push({ side: 'bottom', pos: i, edge: [i * CELL, bottom], cell: [i, bottomRow] });
  }
  for (const j of along(node.top, bottom)) {
    out.push({ side: 'left', pos: j, edge: [node.left, j * CELL], cell: [leftCol, j] });
    out.push({ side: 'right', pos: j, edge: [right, j * CELL], cell: [rightCol, j] });
  }
  return out;
}

/** Binary min-heap keyed on f. */
class Heap {
  constructor() { this.items = []; }
  get size() { return this.items.length; }
  push(item) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * A grid point as one number, shared by every arrow's search. Kept under 2^28
 * even for a thousand-course grid and times four for the heading, so it stays
 * a small integer: map lookups on larger numbers are several times slower,
 * and the search makes millions of them.
 */
const cellKey = (ix, iy) => (iy + 64) * 1024 + (ix + 64);

/**
 * What stepping onto a grid point on heading `d` costs for the arrows already
 * laid there. Headings are compared by axis: east and west run along one line.
 */
function crowding(shared, ix, iy, d) {
  const k = cellKey(ix, iy);
  return (shared.along.get(k * 4 + (d & 3)) || 0) * PARALLEL_COST + (shared.any.get(k) || 0) * CROSS_COST;
}

/**
 * A* over the grid in eight directions, from any of `starts` to any of `goals`.
 * Each start leaves its node along its outward heading; each goal must be
 * reached heading straight into its node, which leaves the head a straight run.
 *
 * The search is weighted toward the goal (HEURISTIC_WEIGHT): a hair longer
 * than the best route at worst, but it runs straight at the target instead of
 * fanning out, which keeps a trace across a thousand-course grid quick.
 */
function search({ starts, goals, blocked, shared, xRange, margin = SEARCH_MARGIN, budget = MAX_EXPANSIONS }) {
  const all = [...starts, ...goals];
  const minX = Math.max(Math.min(...all.map((s) => s.cell[0])) - margin, xRange[0]);
  const maxX = Math.min(Math.max(...all.map((s) => s.cell[0])) + margin, xRange[1]);
  const minY = Math.min(...all.map((s) => s.cell[1])) - margin;
  const maxY = Math.max(...all.map((s) => s.cell[1])) + margin;
  const W = maxX - minX + 1;
  const H = maxY - minY + 1;
  const cellIndex = (ix, iy) => (iy - minY) * W + (ix - minX);

  const goalAt = new Map();
  for (const g of goals) {
    const c = cellIndex(...g.cell);
    if (!goalAt.has(c)) goalAt.set(c, []);
    goalAt.get(c).push(g);
  }
  const goalFor = (c, d) => {
    const list = goalAt.get(c);
    return list ? list.find((gl) => gl.d === d) : undefined;
  };
  // Octile distance to the box around the goals, in constant time.
  const gx0 = Math.min(...goals.map((g) => g.cell[0]));
  const gx1 = Math.max(...goals.map((g) => g.cell[0]));
  const gy0 = Math.min(...goals.map((g) => g.cell[1]));
  const gy1 = Math.max(...goals.map((g) => g.cell[1]));
  const h = (ix, iy) => {
    const dx = ix < gx0 ? gx0 - ix : ix > gx1 ? ix - gx1 : 0;
    const dy = iy < gy0 ? gy0 - iy : iy > gy1 ? iy - gy1 : 0;
    return (Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy)) * HEURISTIC_WEIGHT;
  };

  const dense = W * H * 8 <= DENSE_LIMIT;

  // Whether each grid point is inside a highlighted node: 0 unknown, 1 open, 2 blocked.
  const cellState = dense ? new Uint8Array(W * H) : new Map();
  const isBlocked = (ix, iy) => {
    const c = cellIndex(ix, iy);
    let state = dense ? cellState[c] : cellState.get(c);
    if (!state) {
      state = blocked(ix * CELL, iy * CELL) ? 2 : 1;
      if (dense) cellState[c] = state;
      else cellState.set(c, state);
    }
    return state === 2;
  };

  // Cheapest cost found to each state, and the state it was reached from (-1: a start).
  const bestArr = dense ? new Float64Array(W * H * 8).fill(Infinity) : null;
  const fromArr = dense ? new Int32Array(W * H * 8).fill(-1) : null;
  const bestMap = dense ? null : new Map();
  const fromMap = dense ? null : new Map();
  const bestOf = dense ? (k) => bestArr[k] : (k) => bestMap.get(k) ?? Infinity;
  const fromOf = dense ? (k) => fromArr[k] : (k) => fromMap.get(k) ?? -1;
  const record = dense
    ? (k, g, prev) => { bestArr[k] = g; fromArr[k] = prev; }
    : (k, g, prev) => { bestMap.set(k, g); fromMap.set(k, prev); };
  const startAt = new Map();
  const open = new Heap();
  for (const s of starts) {
    const k = (cellIndex(...s.cell) << 3) | s.d;
    if (startAt.has(k)) continue;
    startAt.set(k, s);
    record(k, 0, -1);
    open.push({ f: h(...s.cell), g: 0, k });
  }

  // Whether a goal can be reached at all, ignoring headings and costs. Flooding
  // the open grid points is cheap next to a search that must spend its whole
  // budget to find there is no way through, which is most of the time a trace
  // takes when some arrow has no route.
  if (dense) {
    const seen = new Uint8Array(W * H);
    const stack = [];
    for (const s of starts) {
      const c = cellIndex(...s.cell);
      if (!seen[c]) {
        seen[c] = 1;
        stack.push(c);
      }
    }
    let reachable = false;
    while (stack.length && !reachable) {
      const c = stack.pop();
      if (goalAt.has(c)) reachable = true;
      const cx = (c % W) + minX;
      const cy = Math.floor(c / W) + minY;
      for (let d = 0; d < 8; d += 1) {
        const ix = cx + DIRS[d][0];
        const iy = cy + DIRS[d][1];
        if (ix < minX || ix > maxX || iy < minY || iy > maxY) continue;
        const n = cellIndex(ix, iy);
        if (seen[n] || isBlocked(ix, iy)) continue;
        if (d % 2 && blocked((ix - DIRS[d][0] / 2) * CELL, (iy - DIRS[d][1] / 2) * CELL)) continue;
        seen[n] = 1;
        stack.push(n);
      }
    }
    if (!reachable) return null;
  }

  let expansions = 0;
  while (open.size && expansions < budget) {
    const { g: g0, k: k0 } = open.pop();
    if (g0 > bestOf(k0)) continue;
    const c0 = k0 >> 3;
    const d0 = k0 & 7;
    const ix0 = (c0 % W) + minX;
    const iy0 = Math.floor(c0 / W) + minY;
    const leaving = startAt.has(k0);
    const goal = !leaving && goalFor(c0, d0);
    if (goal) {
      const turns = [];
      let start = null;
      let prevD = -1;
      for (let k = k0; k !== -1; k = fromOf(k)) {
        const c = k >> 3;
        const d = k & 7;
        // Walking backward: keep the end, and each cell where the heading changed.
        const prev = fromOf(k);
        if (prevD === -1 || d !== prevD || prev === -1) turns.push([(c % W) + minX, Math.floor(c / W) + minY]);
        prevD = d;
        if (prev === -1) start = startAt.get(k);
      }
      turns.reverse();
      return { start, goal, points: turns.map(([x, y]) => [x * CELL, y * CELL]) };
    }
    expansions += 1;

    for (let d = 0; d < 8; d += 1) {
      const diff = turnSize(d0, d);
      if (diff > 2) continue;
      const ix = ix0 + DIRS[d][0];
      const iy = iy0 + DIRS[d][1];
      if (ix < minX || ix > maxX || iy < minY || iy > maxY) continue;
      if (isBlocked(ix, iy)) continue;
      // A diagonal step must not clip a node's corner either.
      if (d % 2 && blocked((ix - DIRS[d][0] / 2) * CELL, (iy - DIRS[d][1] / 2) * CELL)) continue;
      const c = cellIndex(ix, iy);
      let g = g0 + (d % 2 ? Math.SQRT2 : 1) + TURN_COST[diff] + crowding(shared, ix, iy, d);
      if (leaving && diff > 0) g += EDGE_TURN_COST[diff];
      const arriving = goalFor(c, d);
      if (arriving) g += arriving.cost;
      const k = (c << 3) | d;
      if (g >= bestOf(k)) continue;
      record(k, g, k0);
      open.push({ f: g + h(ix, iy), g, k });
    }
  }
  return null;
}

/** Drop repeated and collinear points so every remaining point is a real bend. */
function simplify(points) {
  const out = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last[0] - p[0]) < 0.5 && Math.abs(last[1] - p[1]) < 0.5) continue;
    out.push(p);
    while (out.length >= 3) {
      const [a, b, c] = out.slice(-3);
      const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      const dot = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]);
      if (Math.abs(cross) > 0.5 * Math.hypot(c[0] - a[0], c[1] - a[1]) || dot < 0) break;
      out.splice(out.length - 2, 1);
    }
  }
  return out;
}

/** A polyline with every bend eased into a curve. */
function roundedPath(points) {
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const [px, py] = points[i - 1];
    const [cx, cy] = points[i];
    const [nx, ny] = points[i + 1];
    const l1 = Math.hypot(cx - px, cy - py);
    const l2 = Math.hypot(nx - cx, ny - cy);
    const r = Math.min(CORNER, l1 / 2, l2 / 2);
    const ax = cx - ((cx - px) / l1) * r;
    const ay = cy - ((cy - py) / l1) * r;
    const bx = cx + ((nx - cx) / l2) * r;
    const by = cy + ((ny - cy) / l2) * r;
    d += ` L${ax},${ay} Q${cx},${cy} ${bx},${by}`;
  }
  const [lx, ly] = points[points.length - 1];
  return `${d} L${lx},${ly}`;
}

/**
 * Lay out every arrow. Every highlighted course is an obstacle, so no arrow
 * crosses a course in the trace; faded courses under the tint are not, so
 * arrows fly straight over them. Each arrow picks its own edges and spots on
 * them. Arrows into the traced course go first, then the rest shortest first,
 * and each later one pays to run alongside an earlier one, which keeps
 * parallel arrows apart.
 */
function layout(geo, edges) {
  const codes = new Set(edges.flatMap((e) => [e.from, e.to]));
  const highlighted = [...codes].map((c) => geo.nodes.get(c)).filter(Boolean);
  const rects = highlighted.map((n) => [
    n.left - CLEARANCE, n.top - CLEARANCE, n.left + n.width + CLEARANCE, n.top + n.height + CLEARANCE,
  ]);
  const blocked = (x, y) => rects.some(([l, t, r, b]) => x > l && x < r && y > t && y < b);
  const xRange = [-1, Math.ceil(geo.width / CELL) + 1];

  const slotCache = new Map(highlighted.map((n) => [n.code, slots(n)]));
  // Spots already used by a line, and those of them where a head arrives.
  const taken = new Set();
  const heads = new Set();
  const slotKey = (code, s, o = 0) => `${code}:${s.side}:${s.pos + o}`;
  const inRange = (s) => s.cell[0] >= xRange[0] && s.cell[0] <= xRange[1];
  // A slot is usable if its grid point is clear of every other highlighted
  // course and it has room: a line leaving needs only its own spot, clear of any
  // head beside it, but a head is wider and needs the spots either side free too.
  // So a busy course fits twice as many lines out as heads in.
  const usable = (code, s, head, extra) => {
    if (taken.has(slotKey(code, s))) return false;
    for (const o of [-1, 1]) {
      if ((head ? taken : heads).has(slotKey(code, s, o))) return false;
    }
    return !blocked(s.cell[0] * CELL, s.cell[1] * CELL) && (!extra || extra());
  };

  /**
   * Long vertical runs. Each takes its own straight lane at any x clear of the
   * traced courses over its whole length (faded courses do not count), never on
   * another long run it overlaps, so side by side they sit a cell apart. The page
   * margins count, as the gaps between columns hold only two lanes each. The
   * candidates come nearest either end's centre first, so the arrow can leave or
   * arrive straight.
   */
  const runs = [];
  const LANE_TRIES = 6;
  const lanesFor = (source, target, lo, hi) => {
    const ends = [source, target].map((n) => Math.round((n.left + n.width / 2) / CELL));
    const clear = (ix) => {
      if (runs.some((u) => u.ix === ix && u.lo < hi && lo < u.hi)) return false;
      const x = ix * CELL;
      return !rects.some(([l, t, r, bt]) => x > l && x < r && t < hi && lo < bt);
    };
    const out = [];
    for (let o = 0; o <= xRange[1] - xRange[0] && out.length < LANE_TRIES; o += 1) {
      for (const end of ends) {
        for (const ix of o ? [end - o, end + o] : [end]) {
          if (ix >= xRange[0] && ix <= xRange[1] && !out.includes(ix) && clear(ix)) out.push(ix);
        }
      }
    }
    return out;
  };

  const begun = performance.now();
  const shared = { along: new Map(), any: new Map() };
  const centre = (n) => [n.left + n.width / 2, n.top + n.height / 2];
  // Heads take three spots to a line's one, so the arrows into the busiest
  // course (the traced one) claim its edges before the lines leaving it do.
  const ends = new Map();
  for (const e of edges) for (const c of [e.from, e.to]) ends.set(c, (ends.get(c) || 0) + 1);
  const routes = edges
    .filter((e) => geo.nodes.get(e.from) && geo.nodes.get(e.to))
    .map((e) => {
      const [ax, ay] = centre(geo.nodes.get(e.from));
      const [bx, by] = centre(geo.nodes.get(e.to));
      return { ...e, dist: Math.hypot(ax - bx, ay - by), busy: ends.get(e.to) };
    })
    .sort((p, q) => q.busy - p.busy || p.dist - q.dist);

  return routes
    .map((r) => {
      const route = (wide) => {
        const starts = slotCache
          .get(r.from)
          .filter((s) => inRange(s) && usable(r.from, s, false))
          .map((s) => ({ ...s, d: OUTWARD[s.side] }));
        const goals = slotCache
          .get(r.to)
          .filter((s) => {
            if (!inRange(s)) return false;
            // The head needs one straight step before the grid point, clear of courses.
            const inward = (OUTWARD[s.side] + 4) % 8;
            const px = (s.cell[0] - DIRS[inward][0]) * CELL;
            const py = (s.cell[1] - DIRS[inward][1]) * CELL;
            return usable(r.to, s, true, () => !blocked(px, py));
          })
          .map((s) => ({
            ...s,
            d: (OUTWARD[s.side] + 4) % 8,
            cost: s.side === 'bottom' ? BOTTOM_ENTRY_COST : 0,
          }));
        if (!starts.length || !goals.length) return null;
        const opts = { blocked, shared, xRange };
        if (wide) Object.assign(opts, { margin: WIDE_MARGIN, budget: WIDE_EXPANSIONS });

        // A long vertical trip rides a lane of its own: search out to it, run
        // straight along it, and search in from it. Only the two short ends cost
        // a search.
        const a = geo.nodes.get(r.from);
        const b = geo.nodes.get(r.to);
        const down = b.top > a.top;
        const span = down ? b.top - (a.top + a.height) : a.top - (b.top + b.height);
        if (span > LONG_RUN) {
          const d = down ? 2 : 6;
          const sign = down ? 1 : -1;
          const y1 = (down ? a.top + a.height : a.top) + sign * GAP_LEG;
          const y2 = (down ? b.top : b.top + b.height) - sign * GAP_LEG;
          const lo = Math.min(y1, y2);
          const hi = Math.max(y1, y2);
          for (const lane of lanesFor(a, b, lo, hi)) {
            const out = search({ ...opts, starts, goals: [{ cell: [lane, Math.round(y1 / CELL)], d, cost: 0 }] });
            const back = out && search({ ...opts, starts: [{ cell: [lane, Math.round(y2 / CELL)], d }], goals });
            if (back) {
              return { start: out.start, goal: back.goal, points: [...out.points, ...back.points], run: { ix: lane, lo, hi } };
            }
          }
          // With no lane, a search the whole way covers thousands of pixels one
          // grid point at a time; worth a try only while time allows, as on a
          // phone's single column it runs out of budget every time.
          if (performance.now() - begun > WIDE_BUDGET_MS) return null;
        }
        return search({ ...opts, starts, goals });
      };
      const found = route(false) || (performance.now() - begun < WIDE_BUDGET_MS && route(true));
      if (!found) return null;

      const { start, goal } = found;
      if (found.run) runs.push(found.run);
      // Hold the chosen spots, so no two lines or heads overlap.
      taken.add(slotKey(r.from, start));
      taken.add(slotKey(r.to, goal));
      heads.add(slotKey(r.to, goal));
      // Start a little under the source course: the traced courses sit above the
      // arrows, so each line appears to slide out from beneath its course.
      const [ox, oy] = DIRS[OUTWARD[start.side]];
      const tucked = [start.edge[0] - ox * START_TUCK, start.edge[1] - oy * START_TUCK];
      const points = simplify([tucked, start.edge, ...found.points, goal.edge]);
      // Mark the cells this arrow runs through, by axis, and more lightly the
      // cells to either side of it, so the arrows routed after it keep a lane of
      // space when they run alongside and cross it freely when they do not.
      const along = new Map();
      const any = new Map();
      const mark = (map, k, w) => map.set(k, Math.max(map.get(k) || 0, w));
      for (let i = 1; i < points.length; i += 1) {
        const [x0, y0] = points[i - 1];
        const [x1, y1] = points[i];
        const axis = ((Math.round(Math.atan2(y1 - y0, x1 - x0) / (Math.PI / 4)) + 8) % 8) & 3;
        const [px, py] = DIRS[axis + 2];
        const n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / CELL));
        for (let s = 0; s <= n; s += 1) {
          const ix = Math.round((x0 + ((x1 - x0) * s) / n) / CELL);
          const iy = Math.round((y0 + ((y1 - y0) * s) / n) / CELL);
          mark(any, cellKey(ix, iy), 1);
          mark(along, cellKey(ix, iy) * 4 + axis, 1);
          for (const [o, w] of [[1, NEAR_WEIGHT], [2, FAR_WEIGHT]]) {
            mark(along, cellKey(ix + o * px, iy + o * py) * 4 + axis, w);
            mark(along, cellKey(ix - o * px, iy - o * py) * 4 + axis, w);
          }
        }
      }
      for (const [map, into] of [[along, shared.along], [any, shared.any]]) {
        for (const [k, w] of map) into.set(k, (into.get(k) || 0) + w);
      }

      // End the line where the head begins, so the stroke does not blunt the point.
      const tip = points[points.length - 1];
      const prev = points[points.length - 2];
      const len = Math.hypot(tip[0] - prev[0], tip[1] - prev[1]) || 1;
      const ux = (tip[0] - prev[0]) / len;
      const uy = (tip[1] - prev[1]) / len;
      const back = Math.min(HEAD_LEN - 1, len - 1);
      const line = [...points.slice(0, -1), [tip[0] - ux * back, tip[1] - uy * back]];
      const bx = tip[0] - ux * HEAD_LEN;
      const by = tip[1] - uy * HEAD_LEN;
      const head = [
        tip,
        [bx - uy * HEAD_HALF, by + ux * HEAD_HALF],
        [bx + uy * HEAD_HALF, by - ux * HEAD_HALF],
      ];

      return {
        id: r.id,
        kind: r.relation,
        d: roundedPath(line),
        head: head.map((p) => p.join(',')).join(' '),
      };
    })
    .filter(Boolean);
}

/**
 * PrereqArrows -- an overlay on the directory grid drawing arrows into the
 * traced course from its direct prerequisites and out to what it unlocks next.
 *
 * @param {Object} containerRef ref to the positioned canvas holding the nodes
 * @param {Array}  edges        [{ id, from, to, relation }], relation one of 'prereq',
 *                              'one-of', 'concurrent', 'concurrent-one-of' or 'dependent'
 * @param {*}      layoutKey    changes whenever the set of nodes on screen does
 */
function PrereqArrows({ containerRef, edges, layoutKey }) {
  const [arrows, setArrows] = useState([]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || edges.length === 0) {
      setArrows([]);
      return undefined;
    }
    let size = '';
    const draw = () => {
      // The observer also fires once on attaching; skip redraws at an unchanged size.
      const next = `${container.clientWidth}x${container.clientHeight}`;
      if (next === size) return;
      size = next;
      setArrows(layout(measure(container), edges));
    };
    draw();
    // Wrapping follows the width; redraw when it moves.
    const observer = new ResizeObserver(draw);
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, edges, layoutKey]);

  if (arrows.length === 0) return null;

  // Arrows into the traced course sit on top.
  const order = { dependent: 0, 'concurrent-one-of': 1, 'one-of': 2, concurrent: 3, prereq: 4 };
  const sorted = [...arrows].sort((p, q) => order[p.kind] - order[q.kind]);

  return (
    <svg className="prereq-arrows" aria-hidden="true">
      {sorted.map((a) => (
        <g key={a.id} className={`prereq-arrow ${a.kind}`}>
          <path className="arrow-line" d={a.d} />
          <polygon className="arrow-head" points={a.head} />
        </g>
      ))}
    </svg>
  );
}

export default PrereqArrows;
