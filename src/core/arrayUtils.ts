// Safe helpers for operations on arrays whose size is not bounded to a small
// constant (a parsed list can hold well over 100,000 records). Spreading a
// large array into function-call arguments (`fn(...arr)`) hits the JS
// engine's argument-count limit and throws "Maximum call stack size
// exceeded" once the array is large enough - this took the Actor down in
// production the first time a real run pulled OpenSanctions' 150,000-record
// PEP collection into `allRecords.push(...cached.records)`. Every helper
// here is a plain O(n) loop instead, with no ceiling on array size.

export function pushAll<T>(target: T[], source: readonly T[]): void {
    for (const item of source) target.push(item);
}

export function maxOf(values: readonly number[]): number {
    let max = -Infinity;
    for (const v of values) if (v > max) max = v;
    return max;
}
