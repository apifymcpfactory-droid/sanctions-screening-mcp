# Sanctions Screening: Check Names Against OFAC, EU, UK & UN

Sanctions Screening checks names, companies and crypto addresses against official OFAC, EU, UK and UN sanctions data in one call, and returns a plain-English decision your team can act on instead of a pile of raw rows to interpret yourselves.

## 1. Why use Sanctions Screening

AML and KYC teams doing this by hand open the OFAC SDN list, the EU Consolidated list, the UK OFSI list and the UN Consolidated list separately, download different file formats, and manually cross-check every name against each one. Versus the OFAC website by hand, that is minutes per name that should take seconds.

Enterprise AML/KYC screening platforms solve the coverage problem, but typically cost $5,000 to $100,000+ a year in licensing before you screen a single name. Most low-cost screening tools sit in between: they fetch one or two lists and hand you a flat list of fuzzy-match rows, leaving you to work out whether three "matches" are actually the same sanctioned person listed three times.

Sanctions Screening is built to close that gap: official government sources, cross-list identity consolidation, a documented CLEAR/REVIEW/ESCALATE decision instead of a bare score, and change monitoring, callable directly by an AI agent or from any MCP client.

## 2. Key features

- **OFAC SDN screening**: the US Treasury's Specially Designated Nationals list, matched with typo and word-order tolerance.
- **OFAC Consolidated screening**: the US Treasury's non-SDN consolidated list, covering additional sanctions programmes.
- **EU Consolidated Financial Sanctions**: the European Commission's official financial sanctions database.
- **UK OFSI Consolidated List**: the UK Office of Financial Sanctions Implementation's targets list.
- **UN Security Council Consolidated List**: the UN's official sanctions list.
- **AML/KYC risk-programme flags**: matches tagged IRAN, RUSSIA-EO14024, DPRK, CYBER, TERRORISM, PROLIFERATION, GLOBAL-MAGNITSKY and more.
- **Cross-list identity consolidation**: the same person listed by OFAC, the EU, the UK and the UN comes back as one match, not four rows to reconcile by hand.
- **False-positive analysis**: date of birth, country, nationality or identifier mismatches are surfaced explicitly against every match.
- **Denied party crypto address screening**: BTC, ETH and similar wallet addresses checked against OFAC's published digital currency address list.
- **Whitelist memory**: names or list IDs already cleared are suppressed with a documented reason instead of re-flagging every call.
- **Change monitoring**: re-screen the same subjects and get back only what changed since your last check.
- **PDF audit certificates**: an optional screening certificate documenting subject, lists, versions, method, threshold and verdict.

## 3. Who it's for

**For compliance and risk teams.** Screen a new counterparty at onboarding and get a documented CLEAR / REVIEW / ESCALATE verdict with false-positive analysis, instead of four separate list lookups reconciled by hand.

**For finance and accounts payable.** Check a payee before releasing a wire, including the crypto wallet address when that is the payment rail, so a blocked party is caught before funds move.

**For operations and procurement.** Screen a supplier list before a contract round, then use `monitor_changes` on a schedule so a supplier who becomes listed after onboarding surfaces on the next check.

**For developers and AI agents.** Call `screen_entity` inside a KYC intake or payment-release flow, branch on `verdict`, and escalate only REVIEW and ESCALATE to a human.

### When to use it, and when not to

**Use it** for AML/KYC screening, denied-party and export-control checks, payment and payee screening, periodic re-screening, and pulling clean structured list data into your own systems.

**Do not use it** as your compliance programme. It is a screening input, not a determination: it does not decide whether to onboard, block or file a report, it does not replace analyst judgement, and it is not legal advice. **This server screens five official government lists only** — it does not include OpenSanctions or any politically exposed persons collection; that coverage runs on a separate deployment sized for its larger memory footprint. It also does not do adverse-media screening or full beneficial-ownership tracing.

## 4. Built for AI agents, callable by humans too

This is an MCP server: an AI agent (Claude, Cursor, or any MCP-compatible client) can call its tools directly as one step inside a larger workflow, such as KYC intake, vendor onboarding, or payment release, without a human copying names between systems. A person can call the same tools through any MCP client, or directly over HTTP JSON-RPC for testing.

One example agent call:

```
Tool: screen_entity

Input:
{
    "subjects": [{ "name": "Jane Doe", "country": "Cuba" }],
    "threshold": 85
}

Result (one item in "results"):
{
    "subject": "Jane Doe",
    "verdict": "REVIEW",
    "recommendedAction": "Route to a compliance analyst for manual review before proceeding.",
    "matchCount": 1,
    "highestConfidence": 91
}
```

## 5. How to use Sanctions Screening

**From an AI agent**: connect any MCP-compatible client to this server's endpoint and call `screen_entity`, `monitor_changes`, `export_list` or `list_status` directly.

**Python** (direct HTTP call to the MCP endpoint):

```python
import requests

response = requests.post("https://your-deployment-url/mcp", json={
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
        "name": "screen_entity",
        "arguments": {"subjects": ["AeroCaribbean Airlines", {"name": "Jane Doe", "country": "Cuba"}], "threshold": 85},
    },
})
print(response.json())
```

**JavaScript**:

```javascript
const response = await fetch('https://your-deployment-url/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'screen_entity', arguments: { subjects: ['AeroCaribbean Airlines', { name: 'Jane Doe', country: 'Cuba' }], threshold: 85 } },
    }),
});
console.log(await response.json());
```

**cURL**:

```bash
curl -X POST "https://your-deployment-url/mcp" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"screen_entity","arguments":{"subjects":["AeroCaribbean Airlines","Acme Test Company"],"threshold":85}}}'
```

## 6. Input parameters

### `screen_entity`

| Field | Type | Description |
|---|---|---|
| `subjects` | array (required) | Names as plain strings, or objects: `{name, entityType, yearOfBirth, dob, country, nationality, idNumber, passport, regNumber, lei, program}`. |
| `entityType` | string | `any` (default), `person`, or `org`. A per-subject `entityType` overrides this. |
| `threshold` | integer | Minimum fuzzy-match score, 0 to 100. Default 85. |
| `fuzzy` | boolean | Typo/word-order/transliteration-tolerant matching. Default true. |
| `lists` | array | Restrict screening to specific lists. Default: all five (OFAC SDN, OFAC Consolidated, EU Consolidated, UK OFSI, UN Consolidated). |
| `whitelist` | array | Names or list entityIds from prior decisions to suppress. |
| `generateCertificate` | boolean | Return a base64 PDF audit certificate alongside the results. Default false. |

### `monitor_changes`

| Field | Type | Description |
|---|---|---|
| `subjects` | array (required) | Same shape as `screen_entity`. |
| `previousResults` | array (required) | The `results` array from a prior `screen_entity` or `monitor_changes` call, for the same subjects. |
| (all `screen_entity` options except `generateCertificate`) | | Same defaults apply. |

### `export_list`

| Field | Type | Description |
|---|---|---|
| `list` | string (required) | One of OFAC SDN, OFAC Consolidated, EU Consolidated, UK OFSI, UN Consolidated. |
| `format` | string | `csv` (default), `json`, or `xlsx`. XLSX is returned base64-encoded. |

### `list_status`

No input. Returns each list's cached record count and last-refresh time.

## 7. Output

One entry per screened subject in the `results` array from `screen_entity`:

```json
{
    "subject": "Jane Doe",
    "verdict": "REVIEW",
    "recommendedAction": "Route to a compliance analyst for manual review before proceeding.",
    "priorityScore": 78,
    "matchCount": 1,
    "highestConfidence": 91,
    "narrative": "\"Jane Doe\" matched \"Jane A. Doe\" (91/100, strong-fuzzy) on OFAC SDN, EU Consolidated. This match requires analyst review before any decision is made.",
    "matches": [
        {
            "matchedName": "Jane A. Doe",
            "confidence": 91,
            "matchType": "strong-fuzzy",
            "sources": [
                { "list": "OFAC SDN", "entityId": "OFAC SDN-12345", "program": "CUBA", "listVersion": "2026-01-01T00:00:00.000Z", "sourceUrl": "https://sanctionslistservice.ofac.treas.gov/..." },
                { "list": "EU Consolidated", "entityId": "EU Consolidated-987", "program": "Cuba", "listVersion": "2026-01-01T00:00:00.000Z", "sourceUrl": "https://webgate.ec.europa.eu/..." }
            ],
            "riskIndicators": [{ "code": "CYBER", "label": "Cyber-related sanctions programme" }],
            "falsePositiveAnalysis": { "mismatchSignals": [], "likelyFalsePositive": false, "reason": "No contradicting attributes found; name match alone should not be dismissed without analyst review." },
            "autoCleared": false,
            "ownershipRisk": { "flagged": false, "linkedEntities": [], "note": "No ownership/linkage signal found in the source list data for this entry. This is not a full 50%-rule check; beneficial-ownership tracing requires external corporate-registry data this tool does not have." }
        }
    ],
    "whitelisted": false
}
```

### Field definitions

| Field | Meaning |
|---|---|
| `verdict` | `CLEAR`, `REVIEW`, or `ESCALATE`. |
| `recommendedAction` | Plain-English next step and escalation routing. |
| `priorityScore` | 0 to 100, weighted by confidence, ownership signal, and high-risk programme flags. |
| `matchCount` | Number of consolidated (not raw per-list) matches above threshold, excluding auto-cleared. |
| `highestConfidence` | Highest score among all matches, including auto-cleared ones. |
| `narrative` | Reasoning in plain English, including for a clean result. |
| `matches[].sources` | Every list this consolidated identity appears on. |
| `matches[].riskIndicators` | Programme-category tags parsed from the matched list entries. |
| `matches[].falsePositiveAnalysis` | Concrete attribute mismatches (DOB, country, identifier) versus the subject's own stated data. |
| `matches[].autoCleared` | True when a low-confidence match is contradicted by two or more subject attributes. |
| `matches[].ownershipRisk` | 50 percent rule linkage signal from the source list data, with an explicit non-overclaim note. |

## 8. Use cases

- **Onboarding screening**: check a new customer or counterparty before opening an account.
- **KYC intake**: run an AML watchlist check as part of a standard know-your-customer flow.
- **Payment screening**: check a payee before a wire, including a crypto wallet address if that is the payment rail.
- **Vendor and supplier due diligence**: screen a supplier list before signing a contract.
- **Denied party screening for export control**: check a buyer or intermediary against sanctions lists before shipping.
- **Periodic re-screening**: call `monitor_changes` on a schedule to catch subjects who become newly listed after onboarding.
- **Marketplace and platform trust and safety**: screen sellers or partners before activating an account.
- **Agent-driven compliance workflows**: an AI agent handling intake or payment approval calls this tool directly as one step in a larger flow.
- **Building your own compliance tooling**: use `export_list` to pull clean, structured list data into your own systems.

## 9. How it works

```
subjects (names / crypto addresses)
        |
        v
 parse & normalize
        |
        v
 fetch + cache lists  ----  OFAC SDN/Consolidated, EU, UK OFSI, UN
        |                   (streamed + parsed incrementally, cached in memory, refreshed daily)
        v
 fuzzy match  ----  deterministic, transliteration-aware, per list
        |
        v
 cross-list consolidation  ----  same identity across lists becomes one match
        |
        v
 risk flags + false-positive analysis + ownership signal
        |
        v
 whitelist suppression
        |
        v
 verdict + narrative (+ optional PDF certificate)
```

## 10. Performance and cost

| Item | Typical |
|---|---|
| Screening | Sub-second per subject; lists are held in memory, not re-fetched per call. |
| List refresh | Runs once daily in the background; a call never pays the cost of re-downloading government data. |
| `screen_entity` | Priced per call. |
| `monitor_changes` | Priced per call. |
| `export_list` | Priced per call, regardless of list size or format. |
| `list_status` | Lowest-cost call, for confirming data freshness. |
| Memory | This server runs in a fixed container size; its list registry is deliberately kept to 5 sources to stay well inside that budget. |

## 11. Limitations

- **The OFAC 50 percent rule signal is a signal, not full ownership tracing.** It surfaces only what a source list's own data already states about linked entities. It does not compute beneficial-ownership percentages, and it does not trace ownership through corporate-registry data this tool does not have.
- **No adverse-media data.** This checks structured government sources only. It does not search news, litigation, or adverse-media coverage.
- **UK OFSI and EU date-of-birth mapping is partial.** UK OFSI date-of-birth and identifier fields are not currently mapped, and EU date-of-birth and identifier extraction is a best-effort addition layered on top of the verified name, programme and country fields; treat those two specific fields as lower confidence until validated against your own cases.
- **Decisions need human review.** A REVIEW or ESCALATE verdict is a prioritised starting point for an analyst, not a final compliance decision, and a CLEAR result means no match was found above your chosen threshold across the lists screened as of the date shown, not a guarantee.
- **This server screens five official government lists only.** It does not include OpenSanctions or any politically exposed persons collection; that additional coverage runs on a separate deployment sized for its larger memory footprint.
- **Transliteration covers Cyrillic and Greek only.** Arabic, Hebrew and CJK-script names are matched only against whatever Latin rendering the source list already provides.

## 12. Responsible use

This tool is built for legitimate AML, KYC and denied party screening and compliance workflows. It reads only public, official sources and stores nothing beyond the in-memory list cache used to keep screening fast. It is not a substitute for a qualified compliance programme, and it is not legal advice. A screening result here should be reviewed by a person before any account, payment, or business decision is made on it, particularly for REVIEW and ESCALATE verdicts.

## 13. FAQ

**What is a denied party or watchlist check?** Screening a name or company against government-published sanctions and denied party lists before doing business with them, so you avoid transacting with a sanctioned entity.

**What is the OFAC SDN list?** The US Treasury's Specially Designated Nationals list: individuals and companies US persons are generally prohibited from dealing with.

**What is the difference between OFAC SDN and OFAC Consolidated?** SDN is the primary blocked-persons list. Consolidated covers additional non-SDN sanctions programmes such as sectoral sanctions and other restricted-party lists.

**What is the UK OFSI list?** The UK Office of Financial Sanctions Implementation's Consolidated List of financial sanctions targets, the UK equivalent of the OFAC SDN list.

**Is this an AML screening tool or a KYC tool?** Both. The same check supports AML watchlist screening at onboarding or before a transaction and ongoing KYC due diligence via `monitor_changes`.

**Why does the same name sometimes return one match instead of several?** The same real-world person or company is often listed independently by more than one source. This tool consolidates those into one match with every source listed, instead of one row per list.

**What does autoCleared mean?** A match scored below strong-confidence and contradicted by two or more of the subject's own stated attributes (date of birth, country, or identifier). It is still returned, just flagged so it can be deprioritized.

**Is a CLEAR result guaranteed accurate?** No. It means no match was found above your chosen threshold, across the lists screened, as of the check date. It is not legal advice.

**Can I re-check the same subjects without re-reading everything?** Yes, call `monitor_changes` with `previousResults` set to a prior `screen_entity` call's `results` array; you get back only what changed.

**Does this screen crypto wallet addresses?** Yes. A subject value shaped like a BTC, ETH or similar address is checked against OFAC's published digital currency address list instead of fuzzy name matching.

**Does this store any of my data?** No. Screening reads only the official public sources listed above; nothing beyond the in-memory list cache is retained.

## 14. Related products

| Product | What it does |
|---|---|
| [IBAN Validator](https://mcpize.com/mcp/iban-validator-mcp) | Offline ISO 13616 IBAN checksum and structure validation. |
| [Email & Domain Auth Checker](https://mcpize.com/mcp/email-domain-checker-mcp) | MX, SPF, DKIM and DMARC checks from DNS alone. |
| [PDF Toolkit](https://mcpize.com/mcp/pdf-toolkit-mcp) | Merge, split, compress, convert, rotate and watermark PDFs. |

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

Built by Howth Technology Factory. Precisely engineered tools for teams and AI agents, made in Dublin. Full catalogue: howthtechnologyfactory.pro
