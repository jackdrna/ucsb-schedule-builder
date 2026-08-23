/**
 * Copy the UCSB dataset into public/ so the built site can serve it directly.
 *
 *   node scripts/sync-data.mjs
 *
 * The deployed app has no backend: `src/utils/api.js` reads these two files instead
 * of calling Express. backend/data/ stays the single source of truth -- these copies
 * are generated, gitignored, and refreshed by `predev` / `prebuild`, so regenerating
 * the dataset cannot leave the site serving a stale one.
 */
import { copyFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const from = path.join(here, '..', '..', 'backend', 'data');
const to = path.join(here, '..', 'public', 'data');

const FILES = ['ucsb-courses.json', 'ucsb-requirements.json'];

const missing = FILES.filter((f) => !existsSync(path.join(from, f)));
if (missing.length) {
  console.error(
    `sync-data: missing ${missing.join(', ')} in ${from}\n` +
      'Run the UCSB pipeline in backend/scripts/ucsb first (see its README).'
  );
  process.exit(1);
}

mkdirSync(to, { recursive: true });
for (const file of FILES) {
  copyFileSync(path.join(from, file), path.join(to, file));
  const kb = (statSync(path.join(to, file)).size / 1024).toFixed(0);
  console.log(`sync-data: public/data/${file} (${kb} kB)`);
}
