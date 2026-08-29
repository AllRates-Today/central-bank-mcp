// Regenerates src/banks.ts — the offline source catalogue used by keyless mode.
//
// Truth lives in the AllRatesToday site repo's src/data/central-banks.js (itself
// a mirror of the cb-rates D1 `banks` table). Point this at that file when a new
// source is added:
//
//   node scripts/gen-banks.mjs [path/to/central-banks.js] > src/banks.ts
//
// Default assumes the site repo is checked out alongside this one.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const src = resolve(
  process.argv[2] ?? '../astro-blog-starter-template/src/data/central-banks.js',
);
const { centralBanks } = await import(pathToFileURL(src).href);

const rows = centralBanks.map((b) => ({
  code: b.code,
  name: b.name,
  country: b.country,
  home_ccy: b.homeCcy,
  kind: b.kind ?? 'central_bank',
  npm: b.npm,
}));

process.stdout.write(`// GENERATED FILE — do not edit by hand.
// Offline catalogue of the sources AllRatesToday covers, mirrored from the
// site's src/data/central-banks.js. It exists so list_central_banks answers in
// keyless mode, where /api/v1/central-banks (which carries coverage dates and
// needs a key) is unavailable. Regenerate with scripts/gen-banks.mjs.

export interface BankCatalogEntry {
  code: string;
  name: string;
  country: string;
  home_ccy: string;
  kind: string;
  npm?: string;
}

export const BANK_CATALOG: BankCatalogEntry[] = [
${rows.map((r) => `  ${JSON.stringify(r)},`).join('\n')}
];
`);
