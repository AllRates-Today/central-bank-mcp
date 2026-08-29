#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { CentralBankClient, CentralBankApiError } from './client.js';
import { VERSION } from './version.js';

const BANK_DESC =
  "Bank/authority code as returned by list_central_banks (lowercase, e.g. 'ecb', 'fed', 'boj', 'hmrc', 'cbsl'). Call list_central_banks first if unsure — codes are short abbreviations of the institution, not country codes.";

const bank = z
  .string()
  .regex(/^[a-z0-9-]{2,20}$/i, 'must be a bank code like ecb, fed, boj — see list_central_banks')
  .describe(BANK_DESC);

const ccy = z
  .string()
  .regex(/^[A-Za-z]{3}$/, 'must be a 3-letter ISO 4217 currency code')
  .describe("ISO 4217 currency code, 3 letters, case-insensitive (e.g. 'USD', 'EUR', 'LKR').");

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')
  .describe('Calendar date in YYYY-MM-DD format.');

const READ_ONLY = { readOnlyHint: true, openWorldHint: true } as const;

function ok(structured: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(structured, null, 2) }],
    structuredContent: structured,
  };
}

function fail(err: unknown) {
  const message =
    err instanceof CentralBankApiError
      ? `AllRatesToday error${err.status ? ` (${err.status})` : ''}: ${err.message}`
      : err instanceof Error
        ? err.message
        : String(err);
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

async function main() {
  const apiKey = process.env.ALLRATES_API_KEY;

  // No key is NOT a fatal error. The latest published table of every source is
  // served by the open, edge-cached /api/open/central-bank/* endpoints, so the
  // server starts and answers the most common question out of the box; tools
  // that need the metered endpoints say so, with the sign-up link, when called.
  // Exiting here instead would break the whole MCP config in the host client.
  if (!apiKey) {
    console.error(
      [
        '',
        '  AllRatesToday central-bank MCP — running in KEYLESS mode.',
        '',
        '  Available now, no key needed:',
        '    • list_central_banks       — every covered source',
        '    • get_official_rates       — the latest published table (any source)',
        '',
        '  Needs a free API key (historical dates, time series, cross-bank compare,',
        '  publication calendars):',
        '    1. https://allratestoday.com/register — free tier, no card, under a minute',
        '    2. Add to this server\'s MCP config:  "env": { "ALLRATES_API_KEY": "art_live_..." }',
        '',
      ].join('\n'),
    );
  }

  const client = new CentralBankClient({
    apiKey,
    baseUrl: process.env.ALLRATES_BASE_URL,
  });

  const server = new McpServer({ name: 'central-bank-mcp', version: VERSION });

  server.registerTool(
    'list_central_banks',
    {
      title: 'List covered central banks & tax authorities',
      description:
        "Call this FIRST when you need a bank code, or when the user asks 'which central banks do you cover?' or 'do you have rates from X?'. Returns { banks: [{ code, name, country, home_ccy, rate_types, latest date, ... }], disclaimer } for 60+ institutions — central banks (ECB, Fed, BOJ, ...) plus tax authorities (HMRC, US Treasury, ...). The `code` field is what every other tool takes as its `bank` parameter. Cheap to call.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => {
      try {
        return ok(await client.listBanks());
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'get_official_rates',
    {
      title: "Get a bank's official published rates",
      description:
        "Use this for OFFICIAL rates a specific institution published — 'what is the ECB rate for USD?', 'Bank of Japan official rate on 2026-03-14', 'HMRC rate for invoicing'. These are the fixed rates in force for compliance, tax, customs, and accounting — NOT live market rates. Omit `date` for the newest published table; give `date` (paid plans) for the table in force on that day (weekends/holidays roll back to the last published date — the response's rate_date says which). Omit source/target for the bank's full table { rates: [{ base, quote, type, value }] }; give both for one pair — cross-computed via the bank's own home currency when not directly published, flagged `derived`. For live mid-market rates use the @allratestoday/mcp-server package instead.",
      inputSchema: {
        bank,
        date: isoDate
          .optional()
          .describe(
            'Optional YYYY-MM-DD. Omit for the latest published table (all plans). A specific date requires a paid plan.',
          ),
        source: ccy.optional().describe('Optional. With target, narrows to one pair.'),
        target: ccy.optional().describe('Optional. With source, narrows to one pair.'),
      },
      annotations: READ_ONLY,
    },
    async ({ bank: bankCode, date, source, target }) => {
      try {
        if ((source && !target) || (!source && target)) {
          return fail(new Error('Provide both source and target, or neither.'));
        }
        return ok(
          await client.getRates(bankCode.toLowerCase(), {
            date,
            source: source?.toUpperCase(),
            target: target?.toUpperCase(),
          }),
        );
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'get_official_rate_history',
    {
      title: "Get a bank's official rate history",
      description:
        "Use this for a date-by-date series of one bank's OFFICIAL rates — 'ECB USD rate for every day of 2025', 'how did the CBSL official rate move last quarter'. Returns one row per published date: { series: [{ date, rate, rate_type, derived, method }] }. Give either `symbol` (matches either side of the pair vs the bank's home currency) or a source+target pair. Defaults to the last year when from/to omitted. Paid plans only, and BILLED BY VOLUME: one API call per month of history covered (a year-long series costs ~12 calls) — keep ranges as narrow as the question needs. For publication dates without values (free) use get_publication_calendar.",
      inputSchema: {
        bank,
        symbol: ccy
          .optional()
          .describe("One currency vs the bank's home currency, e.g. 'USD'. Alternative to source+target."),
        source: ccy.optional(),
        target: ccy.optional(),
        from: isoDate.optional().describe('Start date. Defaults to one year ago.'),
        to: isoDate.optional().describe('End date. Defaults to today.'),
      },
      annotations: READ_ONLY,
    },
    async ({ bank: bankCode, symbol, source, target, from, to }) => {
      try {
        if (!symbol && !(source && target)) {
          return fail(new Error('Provide either symbol, or both source and target.'));
        }
        return ok(
          await client.getHistory(bankCode.toLowerCase(), {
            symbol: symbol?.toUpperCase(),
            source: source?.toUpperCase(),
            target: target?.toUpperCase(),
            from,
            to,
          }),
        );
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'compare_official_rates',
    {
      title: 'Compare one pair across every bank',
      description:
        "Use this when the user wants one currency pair across ALL institutions at once — 'what does each central bank say USD/EUR is?', 'spread between official USD/LKR rates', 'which bank has the highest official rate for X?'. One call returns every covered bank's latest official rate for the pair plus spread stats { min, max, median, spread_bps } over fresh sources (stale quarterly publishers are returned but excluded from stats). Rates a bank doesn't publish directly are cross-computed within that bank's own table only — banks are never mixed. Methodology: https://allratestoday.com/official-rates-methodology/",
      inputSchema: { source: ccy, target: ccy },
      annotations: READ_ONLY,
    },
    async ({ source, target }) => {
      try {
        return ok(await client.compareBanks(source.toUpperCase(), target.toUpperCase()));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'get_publication_calendar',
    {
      title: "Get a bank's publication calendar",
      description:
        "Use this to see WHICH dates a bank actually published a rate table — 'did the ECB publish on 2026-01-01?', 'how often does the US Treasury publish?'. Returns dates only, no rate values, so it is available on every plan (unlike history). Gaps reveal weekends, holidays, and weekly/quarterly publication cadence. Give ?year=YYYY or a from/to range; large ranges are capped and flagged `truncated`.",
      inputSchema: {
        bank,
        year: z
          .string()
          .regex(/^\d{4}$/, 'must be YYYY')
          .optional()
          .describe("Whole calendar year, e.g. '2026'. Alternative to from/to."),
        from: isoDate.optional(),
        to: isoDate.optional(),
      },
      annotations: READ_ONLY,
    },
    async ({ bank: bankCode, year, from, to }) => {
      try {
        return ok(await client.getAvailability(bankCode.toLowerCase(), { year, from, to }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
