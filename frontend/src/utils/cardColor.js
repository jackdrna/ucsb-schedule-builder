const PASTELS = [
  'pastel-1', 'pastel-2', 'pastel-3', 'pastel-4',
  'pastel-5', 'pastel-6', 'pastel-7', 'pastel-8',
];

/**
 * Stable colour per course, so a card looks the same everywhere. Returns the
 * name of a pastel from globals.css, usable as a class or as var(--name).
 */
export function colorFor(code) {
  let hash = 0;
  for (let i = 0; i < code.length; i += 1) hash = (hash * 31 + code.charCodeAt(i)) % 1024;
  return PASTELS[hash % PASTELS.length];
}
