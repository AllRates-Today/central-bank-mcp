# Central Bank Rates MCP Server — @allratestoday/central-bank-mcp

Website: https://allratestoday.com/central-bank-rates-api/ · Hosted endpoint (no install): https://allratestoday.com/api/mcp · Docs: https://allratestoday.com/mcp/

[![npm version](https://img.shields.io/npm/v/@allratestoday/central-bank-mcp.svg)](https://www.npmjs.com/package/@allratestoday/central-bank-mcp)
[![npm downloads](https://img.shields.io/npm/dm/@allratestoday/central-bank-mcp.svg)](https://www.npmjs.com/package/@allratestoday/central-bank-mcp)
[![license](https://img.shields.io/npm/l/@allratestoday/central-bank-mcp.svg)](./LICENSE)
[![MCP](https://img.shields.io/badge/Model%20Context%20Protocol-1.x-blue.svg)](https://modelcontextprotocol.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6.svg)](https://www.typescriptlang.org/)
[![Central Bank Mcp on AI Agents Listing](https://aiagentslisting.com/central-bank-mcp/badge.svg?claim=837813c0572a45328913a7361270b559)](https://aiagentslisting.com/mcp/central-bank-mcp)

**Give your AI assistant the official exchange rates that compliance, tax, and accounting actually require. A Model Context Protocol server that lets Claude Code, Cursor, Claude Desktop, Windsurf, and any MCP-compatible client fetch published central-bank and tax-authority rates from 121 central banks and 3 tax authorities — ECB, Fed, Bank of Japan, HMRC, US Treasury, and more — via the [AllRatesToday API](https://allratestoday.com/central-bank-rates-api/).**

After installation, your assistant can answer questions like:

- *"What is the ECB's official USD/EUR rate today?"*
- *"What HMRC rate should I use for this March invoice?"*
- *"Show me the Bank of Japan's official rate for every day of Q1."*
- *"Compare the official USD/LKR rate across every central bank that publishes one."*

## ⚖️ Official rates vs mid-market rates

Everything this server returns is an **official published rate**: fixed once the institution publishes it, carrying that institution's own publication date — the number tax authorities, auditors, and customs require. It is *not* the live market rate. For **live mid-market rates** (price display, conversion, anything that should track the market), use the companion server [`@allratestoday/mcp-server`](https://www.npmjs.com/package/@allratestoday/mcp-server). The two can diverge by several percent — pick by use case. Methodology: [allratestoday.com/official-rates-methodology](https://allratestoday.com/official-rates-methodology/).

## 🚀 Why this server?

- 🏛️ **121 central banks + 3 tax authorities** — central banks (ECB, Fed, BOJ, SNB, RBI, …) plus tax authorities (HMRC, US Treasury, …), each served from its own published tables
- 📅 **Point-in-time correctness** — ask for any date; weekends and holidays roll back to the rate legally in force, and the response tells you which publication date applied
- 📊 **Cross-bank comparison** — one call returns every institution's rate for a pair, with min/max/median and spread stats
- 🧮 **Honest derivations** — with an API key, pairs a bank doesn't publish directly are cross-computed only within that bank's own table and flagged `derived`; banks are never mixed. Keyless serves only published pairs and their inverses
- 🔓 **Works with no API key** — installs and answers out of the box; the latest published table of every source is open
- 🧰 **Six focused tools** — small surface, easy for the model to use correctly
- 🔌 **Works everywhere MCP does** — stdio transport, MCP 1.x; Claude Code, Cursor, Claude Desktop, Windsurf, or any generic host

## 🔓 Keyless mode — what works with no setup

Install it with no configuration at all and it starts, connects, and answers:

| Tool | Keyless | What you get |
|---|---|---|
| `list_central_banks` | ✅ | Every covered institution (121 central banks, 3 tax authorities and the composite), from a catalogue bundled with the package (no coverage dates). |
| `get_official_rates` | ✅ | The **latest published table** of any source, or one published pair (or its inverse) from it, with the publisher's own `rate_date`. Cross pairs need a key. |
| `get_official_rates` with a `date` | 🔑 | One sentence explaining that dated tables need a paid plan. |
| `get_official_rate_history` | 🔑 | Same (paid plan). |
| `compare_official_rates` | 🔑 | One sentence explaining how to get a free key. |
| `get_publication_calendar` | 🔑 | Same. |
| `request_trial_key` | ✅ | Self-issues a 100-call, 7-day key with no account and adopts it for the session. |

The keyless path reads the open, edge-cached `/api/open/central-bank/{bank}`
endpoint — free to use with a visible attribution link back to allratestoday.com
(the exact wording ships in each response's `attribution` field).

## 🔑 Get your API key (free)

A free key adds cross-bank comparison, cross-computed pairs and publication
calendars — 300 lifetime calls, **no credit card required**. Dated (historical)
tables and time series need a paid plan: free and trial keys get a 403 for them.

1. Register at [allratestoday.com/register](https://allratestoday.com/register) — 30 seconds
2. Verify your email
3. Copy your key from the dashboard (format: `art_live_xxxxx`)
4. Use it as `ALLRATES_API_KEY` in the configs below

Without one the server prints a short summary of keyless mode on stderr and
keeps running — it never exits, because an MCP server that exits breaks the
host client's whole configuration.

## 🧩 Easiest install: the Claude Code plugin

If you use Claude Code, install the plugin instead of configuring this server by
hand — it bundles both AllRatesToday MCP servers, two skills, and five slash
commands (`/rate`, `/convert`, `/official-rate`, `/fx-history`,
`/add-currency-support`):

```
/plugin marketplace add AllRates-Today/claude-code-plugin
/plugin install allratestoday@allratestoday
```

Everything below still applies for other MCP clients.

## ☁️ Hosted endpoint — nothing to install

The same six tools also run as a hosted **Streamable HTTP** MCP server, together with the five tools of the sibling AllRatesToday server — eleven in total on the hosted endpoint (this npm package itself exposes six). Paste the URL into any client that supports remote MCP — Claude.ai and Claude Desktop connectors, ChatGPT, Cursor, VS Code, Codex, Gemini CLI:

```
https://allratestoday.com/api/mcp
```

```bash
claude mcp add --transport http allratestoday https://allratestoday.com/api/mcp
```

Works keyless. With a key, send `Authorization: Bearer art_live_…` or, where the client only takes a URL, connect to `https://allratestoday.com/api/mcp?api_key=art_live_…`. Registry name: `com.allratestoday/mcp`. One-click Cursor / VS Code buttons: https://allratestoday.com/mcp/#hosted

## 📦 Installation

```bash
# Run without installing (recommended)
npx -y @allratestoday/central-bank-mcp
```

```bash
# Or install globally
npm install -g @allratestoday/central-bank-mcp
central-bank-mcp
```

Both commands launch the stdio MCP server and wait for a client to connect — your MCP client launches them as a subprocess.

## 🏁 Quick setup per client

### Claude Code

```bash
claude mcp add central-bank-rates -- npx -y @allratestoday/central-bank-mcp
claude mcp env central-bank-rates ALLRATES_API_KEY=art_live_xxxxx
```

Restart Claude Code. Verify by asking: *"Which central banks can you fetch official rates from?"*

### Cursor

Edit `~/.cursor/mcp.json` (or `.cursor/mcp.json` inside your project):

```json
{
  "mcpServers": {
    "central-bank-rates": {
      "command": "npx",
      "args": ["-y", "@allratestoday/central-bank-mcp"],
      "env": {
        "ALLRATES_API_KEY": "art_live_xxxxx"
      }
    }
  }
}
```

### Claude Desktop

Edit `claude_desktop_config.json` (Settings → Developer → Edit Config) and add the same `mcpServers` block as the Cursor example above, then restart Claude Desktop.

## 🧰 Tools

| Tool | What it does | Plan |
|---|---|---|
| `list_central_banks` | All covered institutions with codes, metadata, latest date | Free (keyless: bundled catalogue) |
| `get_official_rates` | A bank's published table (or one pair), latest or for a given date | Keyless (latest) / Paid (dated) |
| `get_official_rate_history` | Date-by-date official series for one pair | Paid, billed ~1 call per month covered |
| `compare_official_rates` | One pair across every bank, with spread stats | Free (key required) |
| `get_publication_calendar` | Dates a bank actually published (no values) | Free (key required) |
| `request_trial_key` | Self-issue a 100-call, 7-day trial key (no account) and use it for the rest of the session | Keyless, 3 per IP per day |

## 🔒 Privacy

Only the request parameters and your API key ever reach allratestoday.com — never conversation context.

## 📚 More from AllRatesToday

- [Central bank REST API docs](https://allratestoday.com/central-bank-rates-api/)
- [Per-bank npm SDKs](https://github.com/AllRates-Today)
- [`@allratestoday/mcp-server`](https://www.npmjs.com/package/@allratestoday/mcp-server) — live mid-market rates MCP server

## 🔗 Links

- [API Documentation](https://allratestoday.com/developers)
- [Register (Free)](https://allratestoday.com/register)
- [Dashboard](https://allratestoday.com/profile)
- [Status](https://allratestoday.com/status)
- [GitHub](https://github.com/AllRates-Today/central-bank-mcp)

## License

MIT © AllRatesToday
