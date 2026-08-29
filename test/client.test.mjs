import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CentralBankClient, CentralBankApiError } from '../dist/client.js';

function stubFetch(status, body, capture = {}) {
  return async (url, init) => {
    capture.url = url;
    capture.init = init;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    };
  };
}

test('success returns parsed body', async () => {
  const client = new CentralBankClient({
    apiKey: 'k',
    fetchImpl: stubFetch(200, { banks: [{ code: 'ecb' }], disclaimer: 'x' }),
  });
  const res = await client.listBanks();
  assert.equal(res.banks[0].code, 'ecb');
});

test('sends bearer auth and versioned user-agent', async () => {
  const capture = {};
  const client = new CentralBankClient({
    apiKey: 'secret',
    fetchImpl: stubFetch(200, { rates: [] }, capture),
  });
  await client.getRates('ecb');
  assert.equal(capture.init.headers['Authorization'], 'Bearer secret');
  assert.match(capture.init.headers['User-Agent'], /^central-bank-mcp\/\d+\.\d+\.\d+$/);
});

test('latest vs dated path selection', async () => {
  const capture = {};
  const client = new CentralBankClient({ apiKey: 'k', fetchImpl: stubFetch(200, {}, capture) });
  await client.getRates('boj');
  assert.match(String(capture.url), /\/v1\/central-bank\/boj\/latest$/);
  await client.getRates('boj', { date: '2026-03-14', source: 'USD', target: 'JPY' });
  assert.match(String(capture.url), /\/v1\/central-bank\/boj\/2026-03-14\?source=USD&target=JPY$/);
});

test('history passes query params', async () => {
  const capture = {};
  const client = new CentralBankClient({ apiKey: 'k', fetchImpl: stubFetch(200, {}, capture) });
  await client.getHistory('cbsl', { symbol: 'USD', from: '2026-01-01', to: '2026-02-01' });
  const u = new URL(String(capture.url));
  assert.equal(u.pathname.endsWith('/v1/central-bank/cbsl/history'), true);
  assert.equal(u.searchParams.get('symbol'), 'USD');
  assert.equal(u.searchParams.get('from'), '2026-01-01');
});

test('compare builds the composite URL', async () => {
  const capture = {};
  const client = new CentralBankClient({ apiKey: 'k', fetchImpl: stubFetch(200, {}, capture) });
  await client.compareBanks('USD', 'EUR');
  assert.match(String(capture.url), /\/v1\/central-banks\/rates\?source=USD&target=EUR$/);
});

test('401 maps to invalid API key message', async () => {
  const client = new CentralBankClient({ apiKey: 'bad', fetchImpl: stubFetch(401, {}) });
  await assert.rejects(
    () => client.listBanks(),
    (err) =>
      err instanceof CentralBankApiError &&
      err.status === 401 &&
      err.message === 'Invalid AllRatesToday API key',
  );
});

test('403 maps to paid-plan message with upstream passthrough', async () => {
  const client = new CentralBankClient({
    apiKey: 'k',
    fetchImpl: stubFetch(403, { error: 'History requires a paid plan' }),
  });
  await assert.rejects(
    () => client.getHistory('ecb', { symbol: 'USD' }),
    (err) => err instanceof CentralBankApiError && err.message === 'History requires a paid plan',
  );
});

test('429 maps to quota message', async () => {
  const client = new CentralBankClient({ apiKey: 'k', fetchImpl: stubFetch(429, {}) });
  await assert.rejects(
    () => client.listBanks(),
    (err) => err instanceof CentralBankApiError && err.message === 'AllRatesToday API quota exceeded',
  );
});

test('keyless listBanks answers from the bundled catalogue, without calling out', async () => {
  const client = new CentralBankClient({
    fetchImpl: () => {
      throw new Error('should not be called');
    },
  });
  assert.equal(client.keyless, true);
  const res = await client.listBanks();
  assert.equal(res.catalog, 'bundled');
  assert.ok(res.banks.length > 50);
  assert.ok(res.banks.some((b) => b.code === 'ecb'));
});

test('keyless getRates reads the open endpoint, unauthenticated', async () => {
  const capture = {};
  const client = new CentralBankClient({
    fetchImpl: stubFetch(200, { bank: 'ecb', rate_date: '2026-08-28', rate: 0.86 }, capture),
  });
  const res = await client.getRates('ecb', { source: 'USD', target: 'EUR' });
  assert.match(capture.url, /\/open\/central-bank\/ecb\?source=USD&target=EUR$/);
  assert.equal(capture.init.headers.Authorization, undefined);
  assert.match(capture.init.headers['User-Agent'], /keyless/);
  assert.equal(res.rate, 0.86);
});

test('keyless metered lookups explain how to get a free key', async () => {
  const client = new CentralBankClient({
    fetchImpl: () => {
      throw new Error('should not be called');
    },
  });
  await assert.rejects(
    () => client.getRates('ecb', { date: '2026-01-05' }),
    (err) => err instanceof CentralBankApiError && /needs an AllRatesToday API key/.test(err.message),
  );
  await assert.rejects(
    () => client.getHistory('ecb', { symbol: 'USD' }),
    (err) => err instanceof CentralBankApiError && /register/.test(err.message),
  );
});
