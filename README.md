# Sanctions Screening: Check Names Against OFAC, EU, UK & UN

Sanctions Screening checks names, companies and crypto addresses against official OFAC, EU, UK and UN sanctions lists in one call: cross-list identity consolidation, risk flags, false-positive analysis, and a plain-English verdict, not just a pile of scored rows. For AML, KYC and denied-party screening. Nothing stored.

An MCP server hosted on [MCPize](https://mcpize.com). Shares its screening core with the [Sanctions Screening Apify Actor](https://apify.com/apifmcpfactory/sanctions-screening), which additionally screens OpenSanctions' PEP and aggregated-watchlist data under a larger memory allocation than this server's container allows.

## What it does

Doing this by hand means checking several separate government sources and manually working out whether three "hits" are actually the same sanctioned person listed three times. This server does that consolidation for you: the same identity across OFAC, the EU, the UK and the UN comes back as one match with every source listed, tagged with risk-programme flags (IRAN, RUSSIA-EO14024, DPRK, CYBER, TERRORISM and more), a false-positive check against any date of birth, country, nationality or identifier you provide, and an OFAC 50%-Rule ownership-linkage signal where the source list data itself names one.

**Who it's for:** compliance and onboarding teams running AML/KYC and denied-party checks, payments and marketplace platforms screening counterparties or payout wallets, and AI agents that need a screening step inside a larger workflow.

## Why it's built this way

- **Official sources only.** OFAC SDN, OFAC Consolidated, EU Consolidated, UK OFSI and UN Consolidated. No commercially-licensed feeds.
- **A decision, not just a score.** Every subject gets a verdict (CLEAR, REVIEW or ESCALATE), a recommended action, and a plain-English narrative, including for clean results, so a negative screening outcome is documented, not silent.
- **Consolidated, not duplicated.** The same identity across multiple lists is one match with a `sources` array, not one row per list.
- **Honest about false positives.** A low-confidence match contradicted by the subject's own stated attributes is flagged `autoCleared` so it does not eat analyst time.
- **Deterministic and transliteration-aware.** Token-aligned Jaro-Winkler fuzzy matching, plus Cyrillic and Greek to Latin transliteration. No LLM, no black box, the same input always scores the same.
- **Fast repeat checks.** The 5 lists are cached in memory and refreshed on a daily schedule, so a screening call never pays the cost of re-downloading the underlying government data.

## Tools

### `screen_entity`

Screen names, companies or crypto addresses against official OFAC/EU/UK/UN sanctions lists; returns consolidated matches with risk flags and false-positive analysis.

| Input | Type | Description |
| --- | --- | --- |
| `subjects` | array (required) | Plain names, or objects: `{name, entityType, yearOfBirth, dob, country, nationality, idNumber, passport, regNumber, lei, program}`. |
| `entityType` | `"any" \| "person" \| "org"` | Narrow to persons or organizations. Defaults to `any`. |
| `threshold` | `integer 0-100` | Minimum fuzzy-match score to return. Defaults to `85`. |
| `fuzzy` | `boolean` | Typo/word-order/transliteration-tolerant matching. Defaults to `true`. |
| `lists` | array | Restrict to specific lists. Defaults to all 5. |
| `whitelist` | array | Names or list entityIds from prior decisions to suppress. |
| `generateCertificate` | `boolean` | Return a base64 PDF audit certificate alongside the results. |

Example call:

```json
{ "subjects": ["AeroCaribbean Airlines", { "name": "Jane Doe", "country": "Cuba" }], "threshold": 85 }
```

### `monitor_changes`

Re-screens subjects against the freshly-cached lists and reports only what changed against a prior result set you supply back.

| Input | Type | Description |
| --- | --- | --- |
| `subjects` | array (required) | Same shape as `screen_entity`. |
| `previousResults` | array (required) | The `results` array from a prior `screen_entity` or `monitor_changes` call, for the same subjects. |
| (all `screen_entity` options) | | Same defaults apply. |

Example call:

```json
{ "subjects": ["Jane Doe"], "previousResults": [ /* prior screen_entity results */ ] }
```

### `export_list`

Dumps one official sanctions list as clean structured data. Commodity mode, no screening.

| Input | Type | Description |
| --- | --- | --- |
| `list` | string (required) | One of OFAC SDN, OFAC Consolidated, EU Consolidated, UK OFSI, UN Consolidated. |
| `format` | `"csv" \| "json" \| "xlsx"` | Defaults to `csv`. XLSX is returned base64-encoded. |

### `list_status`

Report each official sanctions list's cached record count and last-refresh time, so you can confirm data freshness before relying on a result. Takes no input.

## FAQ

**What is a denied-party or watchlist check?** Screening a name or company against government-published sanctions and denied-party lists before doing business with them, to avoid transacting with a sanctioned entity.

**Does this cover PEPs?** Not on this server; OpenSanctions' PEP collection is memory-heavy enough that it runs on the sibling Apify Actor instead, which allocates more memory for exactly that dataset.

**Why does the same name sometimes return one match instead of several?** The same real-world person or company is often listed independently by more than one source. This tool consolidates those into one match with every source listed, instead of one row per list.

**What does `autoCleared` mean?** A match scored below strong-confidence and contradicted by two or more of the subject's own stated attributes (date of birth, country, or identifier). It is still returned, just flagged so it can be deprioritized.

**Is a CLEAR result guaranteed accurate?** No. It means no match was found above your chosen threshold, across the lists screened, as of the check date. It is not legal advice.

## Trust & compliance

Screens against official government sources only. Nothing is stored beyond the in-memory list cache used to keep screening fast; screened subjects are never logged or retained. This is a screening aid, not legal advice: the compliance decision is yours.

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

## Related products

- **[IBAN Validator](https://mcpize.com/mcp/iban-validator-mcp)**, offline ISO 13616 IBAN checksum and structure validation.
- **[Email & Domain Auth Checker](https://mcpize.com/mcp/email-domain-checker-mcp)**, MX, SPF, DKIM and DMARC checks from DNS alone.
- **[PDF Toolkit](https://mcpize.com/mcp/pdf-toolkit-mcp)**, merge, split, compress, convert, rotate and watermark PDFs.

## License

MIT

— A Howth Technology Factory tool. Official sources, nothing stored.
