// Maps free-text programme/regime names (as published by each list) to a
// short set of well-known risk-category tags. Pattern-matched against
// program text because every source spells the same programme differently
// (e.g. OFAC's "IRAN", the EU's "Iran (Nuclear)", UK's "Iran (Nuclear)") -
// there is no shared machine-readable programme taxonomy across these
// five-plus sources to key off instead.

import type { RiskIndicator } from './types.js';

const PATTERNS: Array<{ code: string; label: string; re: RegExp }> = [
    { code: 'IRAN', label: 'Iran-related sanctions programme', re: /\biran\b/i },
    { code: 'RUSSIA-EO14024', label: 'Russia-related sanctions (incl. EO 14024)', re: /\brussia|eo\s*14024|ukraine\b/i },
    { code: 'DPRK', label: 'North Korea (DPRK) sanctions programme', re: /\bdprk|north korea\b/i },
    { code: 'CYBER', label: 'Cyber-related sanctions programme', re: /\bcyber\b/i },
    { code: 'TERRORISM', label: 'Terrorism-related designation', re: /\bterroris(m|t)|sdgt\b/i },
    { code: 'NARCOTICS', label: 'Narcotics-trafficking designation', re: /\bnarcotic|drug traffick/i },
    { code: 'PROLIFERATION', label: 'WMD / proliferation-related sanctions', re: /\bproliferation|wmd\b/i },
    { code: 'SYRIA', label: 'Syria-related sanctions programme', re: /\bsyria\b/i },
    { code: 'VENEZUELA', label: 'Venezuela-related sanctions programme', re: /\bvenezuela\b/i },
    { code: 'BELARUS', label: 'Belarus-related sanctions programme', re: /\bbelarus\b/i },
    { code: 'MYANMAR', label: 'Myanmar-related sanctions programme', re: /\bmyanmar|burma\b/i },
    { code: 'GLOBAL-MAGNITSKY', label: 'Global Magnitsky human-rights/corruption sanctions', re: /\bmagnitsky\b/i },
    { code: 'TRANSNATIONAL-CRIME', label: 'Transnational criminal organisation designation', re: /\btco\b|transnational crim/i },
    { code: 'ARMS-EMBARGO', label: 'Arms embargo', re: /\barms embargo\b/i },
];

export function riskIndicatorsForPrograms(programs: string[]): RiskIndicator[] {
    const text = programs.join(' | ');
    const found: RiskIndicator[] = [];
    for (const { code, label, re } of PATTERNS) {
        if (re.test(text)) found.push({ code, label });
    }
    return found;
}

// Set explicitly by callers for OpenSanctions PEP-collection hits - PEP
// status is a property of the source list itself, not something to
// pattern-match out of programme text.

export const PEP_INDICATOR: RiskIndicator = { code: 'PEP', label: 'Politically exposed person' };
