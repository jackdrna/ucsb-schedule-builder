import axios from 'axios';

/**
 * Course and program data, from one of two places.
 *
 * By default the app is **static**: it reads the two dataset files out of `public/`
 * and needs no server at all, which is what lets it deploy to GitHub Pages. The
 * backend exists for local development and for regenerating the dataset; it serves
 * the same rows from Postgres, and the UI cannot tell the difference -- the API adds
 * only `id` and `prerequisites`, neither of which the UI reads.
 *
 * Set `VITE_API_BASE_URL` to opt into the live API instead:
 *
 *   VITE_API_BASE_URL=http://localhost:5000/api
 *
 * Paths are relative to the document, so the site works from any subdirectory
 * without knowing its own URL.
 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || null;
export const usingLiveApi = Boolean(API_BASE_URL);

const DATA_BASE = `${import.meta.env.BASE_URL || '/'}data`.replace(/\/{2,}$/, '/');

const client = axios.create({ headers: { 'Content-Type': 'application/json' } });

/**
 * The dataset is a few hundred kB and both pages want it, so fetch it once per
 * session. Client-side navigation between the directory and the builder would
 * otherwise re-download it.
 */
const cache = new Map();

async function load(key, url) {
  if (!cache.has(key)) {
    // Cache the promise, not the result, so two concurrent callers share one request.
    cache.set(
      key,
      client.get(url).then(
        (r) => r.data,
        (err) => {
          cache.delete(key);   // let a later attempt retry rather than fail forever
          throw err;
        }
      )
    );
  }
  return cache.get(key);
}

/**
 * Every course, with its prerequisite tree, quarter offerings and sources.
 * @returns {Promise<Array>}
 */
export async function fetchAllCourses() {
  return load(
    'courses',
    API_BASE_URL ? `${API_BASE_URL}/courses` : `${DATA_BASE}/ucsb-courses.json`
  );
}

/**
 * Degree requirements for every program (EE, CE).
 * @returns {Promise<Array>}
 */
export async function fetchPrograms() {
  return load(
    'programs',
    API_BASE_URL ? `${API_BASE_URL}/programs` : `${DATA_BASE}/ucsb-requirements.json`
  );
}

/**
 * One course by code. The space is optional -- 'ECE 130A' and 'ECE130A' both work.
 * @param {string} code
 * @returns {Promise<Object|null>}
 */
export async function fetchCourseByCode(code) {
  const compact = String(code).replace(/\s+/g, '').toUpperCase();
  const courses = await fetchAllCourses();
  return courses.find((c) => c.code.replace(/\s+/g, '').toUpperCase() === compact) || null;
}

/**
 * Degree requirements for one program.
 * @param {string} code 'EE' or 'CE'
 * @returns {Promise<Object|null>}
 */
export async function fetchProgram(code) {
  const programs = await fetchPrograms();
  return programs.find((p) => p.code.toUpperCase() === String(code).toUpperCase()) || null;
}

/**
 * What to tell the user when the dataset will not load. The cause differs by mode:
 * with the live API it is almost always a backend that is not running, and on the
 * static site it is a failed download or a bad deploy.
 * @returns {string}
 */
export function loadErrorMessage() {
  return usingLiveApi
    ? `Could not load courses from ${API_BASE_URL}. Is the backend running?`
    : 'Could not load the course data. Check your connection and reload.';
}

export default client;
