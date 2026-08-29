import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SERVER = fileURLToPath(new URL('../dist/index.js', import.meta.url));

// Minimal newline-delimited JSON-RPC client over the server's stdio transport.
function rpcSession(env) {
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let buffer = '';
  const pending = new Map();
  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    let idx;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    }
  });
  return {
    child,
    request(method, params, id) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), 10_000);
        pending.set(id, (msg) => {
          clearTimeout(timer);
          resolve(msg);
        });
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      });
    },
    kill() {
      child.kill();
    },
  };
}

async function listTools(session) {
  const init = await session.request(
    'initialize',
    { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
    1,
  );
  assert.equal(init.result.serverInfo.name, 'central-bank-mcp');
  const tools = await session.request('tools/list', {}, 2);
  return tools.result.tools;
}

test('starts in keyless mode when ALLRATES_API_KEY is missing', async () => {
  // A missing key must not kill the process: an MCP server that exits breaks
  // the host client's whole config. It announces keyless mode and keeps serving.
  const session = rpcSession({ ALLRATES_API_KEY: '' });
  let stderr = '';
  session.child.stderr.on('data', (c) => (stderr += c.toString()));
  try {
    const tools = await listTools(session);
    assert.ok(tools.some((t) => t.name === 'get_official_rates'));
    assert.ok(tools.some((t) => t.name === 'list_central_banks'));
  } finally {
    session.kill();
  }
  assert.match(stderr, /KEYLESS mode/);
  assert.match(stderr, /allratestoday\.com\/register/);
});

test('every tool is read-only and carries a usable description', async () => {
  const session = rpcSession({ ALLRATES_API_KEY: 'art_test_dummy' });
  try {
    for (const tool of await listTools(session)) {
      assert.ok(tool.inputSchema, `${tool.name} missing inputSchema`);
      assert.ok(tool.description.length > 50, `${tool.name} missing description`);
      assert.equal(tool.annotations?.readOnlyHint, true, `${tool.name} not marked read-only`);
    }
  } finally {
    session.kill();
  }
});
