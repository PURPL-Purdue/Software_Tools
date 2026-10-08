// Point reduction ("decimation") for the chart.
//
// A line can't show more detail than the plot has pixels, so instead of
// handing Highcharts every sample we hand it, per pixel-wide bucket, just
// the lowest and highest sample in that bucket. The drawn line looks the
// same (every spike and dip survives), but Highcharts only ever deals with
// a few thousand points per trace no matter how big the test fire is.
//
// Everything here is cached against the arrays it was computed from, so a
// re-render that hands in the same timestamps/values costs nothing.

export type PlotPoint = [number, number];

export interface ViewRange {
    min?: number;
    max?: number;
}

// Default resolution of the zoomed-out "overview" of each trace: what the
// chart starts with before it knows its plot width, and what's used outside
// the zoomed window (the parts you only see as a sliver in the navigator).
const OVERVIEW_BUCKETS = 1024;

// ---------------------------------------------------------------------------
// Shared x values
// ---------------------------------------------------------------------------

const elapsedCache = new WeakMap<number[], number[]>();

// Timestamps shifted so the first sample sits at 0 (the chart's x axis is
// elapsed time). Cached per timestamps array.
export function elapsedTimes(timestamps: number[]): number[] {
    let xs = elapsedCache.get(timestamps);
    if (!xs) {
        const start = timestamps[0] ?? 0;
        xs = new Array<number>(timestamps.length);
        for (let i = 0; i < timestamps.length; i++) xs[i] = timestamps[i] - start;
        elapsedCache.set(timestamps, xs);
    }
    return xs;
}

// ---------------------------------------------------------------------------
// Per-trace value stats (replaces Math.min(...values) etc, which both
// re-scanned every render and overflow the call stack on big arrays)
// ---------------------------------------------------------------------------

export interface ValueStats {
    count: number; // finite values
    min: number;
    max: number;
    maxAbs: number;
    hasNegative: boolean;
}

const statsCache = new WeakMap<number[], ValueStats>();

export function valueStats(values: number[]): ValueStats {
    let stats = statsCache.get(values);
    if (!stats) {
        let count = 0;
        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < values.length; i++) {
            const v = values[i];
            if (!Number.isFinite(v)) continue;
            count++;
            if (v < min) min = v;
            if (v > max) max = v;
        }
        stats = count === 0
            ? { count, min: 0, max: 0, maxAbs: 0, hasNegative: false }
            : { count, min, max, maxAbs: Math.max(Math.abs(min), Math.abs(max)), hasNegative: min < 0 };
        statsCache.set(values, stats);
    }
    return stats;
}

// ---------------------------------------------------------------------------
// Decimation
// ---------------------------------------------------------------------------

// First index whose x is >= target.
function lowerBound(xs: ArrayLike<number>, target: number): number {
    let lo = 0;
    let hi = xs.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (xs[mid] < target) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

// First index whose x is > target.
function upperBound(xs: ArrayLike<number>, target: number): number {
    let lo = 0;
    let hi = xs.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (xs[mid] <= target) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

// Appends the min/max-per-bucket reduction of samples [start, end) to `out`.
// Non-finite values are skipped (the chart's gap-bridge zones are worked out
// from the full data separately, so gaps still draw as dotted bridges).
function decimateInto(
    out: PlotPoint[],
    xs: number[],
    values: number[],
    start: number,
    end: number,
    buckets: number
): void {
    // Few enough samples to just draw them all.
    if (end - start <= buckets * 2) {
        for (let i = start; i < end; i++) {
            const v = values[i];
            if (Number.isFinite(v)) out.push([xs[i], v]);
        }
        return;
    }

    const x0 = xs[start];
    const span = xs[end - 1] - x0;
    const scale = span > 0 ? buckets / span : 0;
    let bucket = -1;
    let minI = -1;
    let maxI = -1;

    const flush = () => {
        if (minI < 0) return;
        if (minI === maxI) {
            out.push([xs[minI], values[minI]]);
        } else if (minI < maxI) {
            // keep them in time order so the line doesn't double back
            out.push([xs[minI], values[minI]], [xs[maxI], values[maxI]]);
        } else {
            out.push([xs[maxI], values[maxI]], [xs[minI], values[minI]]);
        }
    };

    for (let i = start; i < end; i++) {
        const v = values[i];
        if (!Number.isFinite(v)) continue;
        let b = Math.floor((xs[i] - x0) * scale);
        if (b >= buckets) b = buckets - 1;
        if (b !== bucket) {
            flush();
            bucket = b;
            minI = i;
            maxI = i;
        } else if (v < values[minI]) {
            minI = i;
        } else if (v > values[maxI]) {
            maxI = i;
        }
    }
    flush();
}

interface OverviewEntry {
    xs: number[];
    byBuckets: Map<number, PlotPoint[]>;
}

const overviewCache = new WeakMap<number[], OverviewEntry>();

// The whole trace reduced to `buckets` buckets. Cached per values array +
// bucket count (a handful of plot widths at most).
export function overviewData(xs: number[], values: number[], buckets = OVERVIEW_BUCKETS): PlotPoint[] {
    buckets = Math.max(1, Math.round(buckets));
    let entry = overviewCache.get(values);
    if (!entry || entry.xs !== xs) {
        entry = { xs, byBuckets: new Map() };
        overviewCache.set(values, entry);
    }
    let data = entry.byBuckets.get(buckets);
    if (!data) {
        data = [];
        decimateInto(data, xs, values, 0, Math.min(xs.length, values.length), buckets);
        // window resizes produce new widths; don't hoard every one
        if (entry.byBuckets.size >= 4) entry.byBuckets.clear();
        entry.byBuckets.set(buckets, data);
    }
    return data;
}

// What the chart should actually plot for one trace: full pixel-level
// detail inside the visible window (`view`, in elapsed ms; undefined edges
// mean "edge of the data"), and the cached overview outside it so the
// series always spans the whole test fire (keeps the navigator and the
// axis extremes stable while you scrub around).
export function plotData(xs: number[], values: number[], view: ViewRange, buckets: number): PlotPoint[] {
    buckets = Math.max(1, Math.round(buckets));
    // Whole test fire in view: one bucket per pixel across all of it.
    if (view.min === undefined && view.max === undefined) return overviewData(xs, values, buckets);

    const overview = overviewData(xs, values);
    const n = Math.min(xs.length, values.length);
    if (n === 0) return overview;

    // One sample of margin either side so the line runs right off the
    // edges of the plot instead of stopping short of them.
    const start = Math.max(0, (view.min === undefined ? 0 : lowerBound(xs, view.min)) - 1);
    const end = Math.min(n, (view.max === undefined ? n : upperBound(xs, view.max)) + 1);
    if (end <= start) return overview;

    const lo = xs[start];
    const hi = xs[end - 1];
    const out: PlotPoint[] = [];
    let k = 0;
    while (k < overview.length && overview[k][0] < lo) out.push(overview[k++]);
    decimateInto(out, xs, values, start, end, buckets);
    while (k < overview.length && overview[k][0] <= hi) k++;
    while (k < overview.length) out.push(overview[k++]);
    return out;
}
