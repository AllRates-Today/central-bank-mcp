// Regenerates src/banks.ts — the offline source catalogue used by keyless mode.
//
// Truth lives in the AllRatesToday site repo's src/data/central-banks.js (itself
// a mirror of the cb-rates D1 `banks` table). Point this at that file when a new
// source is added:
//
//   node scripts/gen-banks.mjs [path/to/central-banks.js] > src/banks.ts
//
// Default assumes the site repo is checked out alongside this one.
//
// The live https://allratestoday.com/api/open/central-banks list is the truth for
// WHICH sources exist (it carries only code/name, so metadata comes from the site
// file). The script refuses to write if the two disagree; set GEN_BANKS_OFFLINE=1
// to skip that check.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const src = resolve(
  process.argv[2] ?? '../astro-blog-starter-template/src/data/central-banks.js',
);
const { centralBanks } = await import(pathToFileURL(src).href);

if (!process.env.GEN_BANKS_OFFLINE) {
  const res = await fetch('https://allratestoday.com/api/open/central-banks');
  if (!res.ok) throw new Error(`live catalogue: HTTP ${res.status}`);
  const live = new Set((await res.json()).sources.map((s) => s.code));
  const local = new Set(centralBanks.map((b) => b.code));
  const missing = [...live].filter((c) => !local.has(c));
  const extra = [...local].filter((c) => !live.has(c));
  if (missing.length || extra.length) {
    throw new Error(
      `central-banks.js is out of sync with the live catalogue — missing: [${missing}] not live: [${extra}]`,
    );
  }
}

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
