import { VERSION } from './version.js';

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

  private async request<T>(
    path: string,
    query: Record<string, string | undefined> = {},
  ): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') url.searchParams.set(key, value);
    }

    if (!this.apiKey) {
      throw new CentralBankApiError(
        'AllRatesToday API key is required. Sign up free at https://allratestoday.com/register to get a key, then set ALLRATES_API_KEY in your MCP config.',
      );
    }

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

  listBanks() {
    return this.request<{
      banks: Array<Record<string, unknown>>;
      disclaimer: string;
    }>('/v1/central-banks');
  }

  // date undefined -> /latest; date given -> /{YYYY-MM-DD} (paid plans).
  getRates(bank: string, opts: { date?: string; source?: string; target?: string } = {}) {
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
