# Sanctions Screening: Check Names Against OFAC, EU, UK & UN

Screen any name or company against official OFAC, EU, UK and UN sanctions lists — bulk, with match scores. For AML/KYC. Nothing stored.

An MCP server hosted on [MCPize](https://mcpize.com). Also published as an [Apify Actor](https://apify.com/apifmcpfactory/sanctions-screening) with the same screening core.

## What it does

Sanctions Screening checks any name or company against the current OFAC SDN, OFAC Consolidated, EU Consolidated, UK OFSI and UN Consolidated sanctions and watchlists, and returns a deterministic fuzzy-match score for every hit instead of a black-box yes/no. It pulls directly from primary government sources — never OpenSanctions or any other aggregated/commercially-licensed dataset — so every match traces back to an official list, with the programme, entity type and record it came from.

**Who it's for:** compliance and onboarding teams running AML/KYC checks, payments and marketplace platforms screening counterparties, and AI agents that need a screening step inside a larger workflow.

## Why it's built this way

- **Official sources only** — OFAC SDN, OFAC Consolidated, EU Consolidated, UK OFSI and UN Consolidated. No third-party aggregation, no commercially-licensed feeds.
- **Scored, not just flagged** — every match includes a 0-100 deterministic score plus the list, programme and entity it came from, so nothing is a black-box yes/no.
- **Bulk-ready** — screen one name or a batch of names in the same call.
- **Fast repeat checks** — the 5 lists are cached in memory and refreshed on a daily schedule, so a screening call never pays the cost of re-downloading ~70MB of government data.

## Tools

### `screen_entity`

Screen names against official OFAC/EU/UK/UN sanctions lists; returns scored matches.

| Input | Type | Description |
| --- | --- | --- |
| `names` | `string[]` (required) | One or more names or companies to screen. |
| `entityType` | `"any" \| "person" \| "org"` | Narrow to persons or organizations. Defaults to `any`. |
| `country` | `string` | Narrow matching to entries tagged with this country. Optional. |
| `threshold` | `integer 0-100` | Minimum fuzzy-match score to return. Defaults to `85`. |

Output: one result per requested name — `{ query, isMatch, topScore, matches: [{ matchedName, list, program, entityType, score, entityId, details }] }`.

Example call:

```json
{ "names": ["AeroCaribbean Airlines"], "threshold": 85 }
```

### `list_status`

Report each official sanctions list's cached record count and last-refresh time, so you can confirm data freshness before relying on a result. Takes no input.

## Trust & compliance

Screens against official government sources only. Nothing is stored beyond the in-memory list cache used to keep screening fast — screened names are never logged or retained. This is a screening aid, not legal advice: the compliance decision is yours.

## Local development

```bash
npm install
npm run dev     # http://localhost:8080/mcp, hot reload
npm test        # vitest
npm run build   # tsc
```

## Deployment

```bash
mcpize login
mcpize deploy
mcpize publish --show
```

## License

MIT
