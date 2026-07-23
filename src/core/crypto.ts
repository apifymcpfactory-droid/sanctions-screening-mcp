// Detects whether a subject's input value looks like a cryptocurrency
// address, and screens it against the OFAC SDN "Digital Currency Address"
// identifiers collected during list parsing (see sources/ofac.ts). Pattern
// detection is format-only (regex), not checksum-validated against each
// chain's real address-derivation rules - a string that merely looks like an
// address of a given shape is treated as one for screening purposes.

export interface CryptoPattern {
    currency: string;
    re: RegExp;
}

const CRYPTO_PATTERNS: CryptoPattern[] = [
    { currency: 'BTC', re: /^(1[a-km-zA-HJ-NP-Z1-9]{25,34}|3[a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-z0-9]{25,59})$/ },
    { currency: 'ETH', re: /^0x[a-fA-F0-9]{40}$/ },
    { currency: 'LTC', re: /^(L|M)[a-km-zA-HJ-NP-Z1-9]{26,33}$|^ltc1[a-z0-9]{25,59}$/ },
    { currency: 'XMR', re: /^4[0-9AB][1-9A-HJ-NP-Za-km-z]{93}$/ },
    { currency: 'TRX', re: /^T[a-zA-Z0-9]{33}$/ },
];

export function detectCryptoAddress(value: string): string | null {
    const trimmed = value.trim();
    for (const { currency, re } of CRYPTO_PATTERNS) {
        if (re.test(trimmed)) return currency;
    }
    return null;
}

export interface CryptoMatch {
    address: string;
    currency: string;
    entityName: string;
    entityId: string;
}

// `addressIndex` maps "CURRENCY:address" -> the owning entity's name/id, built
// once per screening run from every parsed OFAC entity's
// digitalCurrencyAddresses field (see merge.ts / screening.ts).
export function screenCryptoAddress(
    value: string,
    addressIndex: Map<string, { name: string; entityId: string }>,
): CryptoMatch | null {
    const currency = detectCryptoAddress(value);
    if (!currency) return null;
    const key = `${currency}:${value.trim()}`;
    const owner = addressIndex.get(key);
    if (!owner) return null;
    return { address: value.trim(), currency, entityName: owner.name, entityId: owner.entityId };
}
