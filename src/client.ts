import { VERSION } from './version.js';
import { BANK_CATALOG } from './banks.js';

const DEFAULT_BASE_URL = 'https://allratestoday.com/api';

export interface ClientOptions {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class CentralBankApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'CentralBankApiError';
  }
}

/**
 * Thrown when a tool needs an endpoint that is behind the API key. Carries the
 * sign-up instructions so the assistant can relay one actionable sentence
 * instead of a bare 401.
 */
export class NeedsKeyError extends CentralBankApiError {
  constructor(what: string) {
    super(
      `This lookup (${what}) needs an AllRatesToday API key. The free tier covers it — ` +
        'sign up at https://allratestoday.com/register (no card, under a minute), then set ' +
        'ALLRATES_API_KEY in the MCP server config and restart. Without a key this server can ' +
        'still return the latest published table for any source (get_official_rates) and the ' +
        'source catalogue (list_central_banks).',
    );
    this.name = 'NeedsKeyError';
  }
}

function errorMessage(status: number, upstream: string | undefined): string {
  switch (status) {
    case 400:
      return upstream ?? 'Bad request — check the bank code, currency codes, or date format';
    case 401:
      return 'Invalid AllRatesToday API key';
    case 402:
    case 403:
      return upstream ?? 'This endpoint requires a paid AllRatesToday plan';
    case 404:
      return upstream ?? 'Unknown bank code or unsupported currency pair for this bank';
    case 429:
      return 'AllRatesToday API quota exceeded';
    default:
      return upstream ? `HTTP ${status} — ${upstream}` : `HTTP ${status}`;
  }
}

export interface CbRate {
  base: string;
  quote: string;
  type: string;
  value: number;
}

export class CentralBankClient {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ClientOptions = {}) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /** True when no API key is configured: only the open endpoints are reachable. */
  get keyless(): boolean {
    return !this.apiKey;
  }

  private async request<T>(
    path: string,
    query: Record<string, string | undefined> = {},
  ): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') url.searchParams.set(key, value);
    }

    if (!this.apiKey) throw new NeedsKeyError(path);

    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'User-Agent': `central-bank-mcp/${VERSION}`,
      'Authorization': `Bearer ${this.apiKey}`,
    };

    const res = await this.fetchImpl(url.toString(), { method: 'GET', headers });
    const text = await res.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }

    if (!res.ok) {
      const upstream =
        body && typeof body === 'object' && 'error' in body && typeof (body as any).error === 'string'
          ? (body as any).error
          : undefined;
      throw new CentralBankApiError(errorMessage(res.status, upstream), res.status, body);
    }

    return body as T;
  }

  /**
   * GET against the keyless, CORS-open, edge-cached /api/open/* surface.
   * Same plumbing as request(), minus the Authorization header.
   */
  private async openRequest<T>(
    path: string,
    query: Record<string, string | undefined> = {},
  ): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') url.searchParams.set(key, value);
    }

    const res = await this.fetchImpl(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': `central-bank-mcp/${VERSION} (keyless)`,
      },
    });
    const text = await res.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }

    if (!res.ok) {
      const upstream =
        body && typeof body === 'object' && 'error' in body && typeof (body as any).error === 'string'
          ? (body as any).error
          : undefined;
      throw new CentralBankApiError(errorMessage(res.status, upstream), res.status, body);
    }

    return body as T;
  }

  listBanks() {
    // Keyless: the bundled catalogue. It carries every code and name but no
    // coverage dates, so it is labelled as such by the caller.
    if (this.keyless) {
      return Promise.resolve({
        banks: BANK_CATALOG.map((b) => ({ ...b })),
        catalog: 'bundled' as const,
        disclaimer:
          'Offline source catalogue bundled with this MCP server. Coverage dates and history ' +
          'depth need an API key (free tier at https://allratestoday.com/register).',
      });
    }
    return this.request<{
      banks: Array<Record<string, unknown>>;
      disclaimer: string;
    }>('/v1/central-banks');
  }

  // date undefined -> /latest; date given -> /{YYYY-MM-DD} (paid plans).
  getRates(bank: string, opts: { date?: string; source?: string; target?: string } = {}) {
    // Keyless: the latest published table is open (edge-cached, no upstream
    // cost). A past date is not — that is the metered part.
    if (this.keyless) {
      if (opts.date) return Promise.reject(new NeedsKeyError(`${bank} table for ${opts.date}`));
      return this.openRequest<Record<string, unknown>>(
        `/open/central-bank/${encodeURIComponent(bank)}`,
        { source: opts.source, target: opts.target },
      );
    }
    const path = `/v1/central-bank/${encodeURIComponent(bank)}/${opts.date ?? 'latest'}`;
    return this.request<Record<string, unknown>>(path, {
      source: opts.source,
      target: opts.target,
    });
  }

  getHistory(
    bank: string,
    opts: { symbol?: string; source?: string; target?: string; from?: string; to?: string },
  ) {
    return this.request<Record<string, unknown>>(
      `/v1/central-bank/${encodeURIComponent(bank)}/history`,
      opts,
    );
  }

  compareBanks(source: string, target: string) {
    return this.request<Record<string, unknown>>('/v1/central-banks/rates', { source, target });
  }

  getAvailability(bank: string, opts: { year?: string; from?: string; to?: string }) {
    return this.request<Record<string, unknown>>(
      `/v1/central-bank/${encodeURIComponent(bank)}/availability`,
      opts,
    );
  }
}
