import { createContext } from 'react';

export type ChannelKind = 'numeric' | 'solenoid';

export interface ChannelConfig {
  id: string;
  label: string;
  kind: ChannelKind;
  unit?: string;
  color: string;
  visible: boolean;
  axisId?: string;
  values: number[]; // aligned 1:1 with DataState.timestamps
}

export interface AxisConfig {
  id: string;
  name: string;
  color: string;
  min: number | '';
  max: number | '';
  auto: boolean;
}

export interface DataState {
  timestamps: number[]; // epoch ms, shared x-values for every channel
  channels: ChannelConfig[];
  axes: AxisConfig[];
}

export interface DataContextValue extends DataState {
  // if there is an error loading it gives the error.
  // only a null will let the program continue
  loadCsvText: (text: string) => string | null;
  // set the chart metadata and date to chosen test fire
  loadTestFire: (testFire: LoadedTestFire) => void;
  // Metadata of the test fire currently on the chart - null for a CSV
  // loaded by hand or the placeholder demo data.
  testFire: TestFireMetadata | null;
  loadError: string | null;
  toggleChannelVisible: (id: string) => void;
  setAllChannelsVisible: (visible: boolean) => void;
  invertChannelVisibility: () => void;
  setChannelColor: (id: string, color: string) => void;
  setChannelAxis: (id: string, axisId: string) => void;
  renameAxis: (id: string, name: string) => void;
  setAxisColor: (id: string, color: string) => void;
  setAxisMin: (id: string, min: number | '') => void;
  setAxisMax: (id: string, max: number | '') => void;
  toggleAxisAuto: (id: string) => void;
  deleteAxis: (id: string) => void;
  addAxis: () => void;
  importView: (view: ViewExport) => { matchedAxes: number; matchedChannels: number; appliedTimeRange: boolean };
  // charts current view time range
  reportViewTimeRange: (range: ViewTimeRange) => void;
  getViewTimeRange: () => ViewTimeRange;
  // set by importView if it carries a time range so graph adjusts timeframe
  requestedTimeRange: { range: ViewTimeRange; token: number } | null;
}

// interfaces for viewing export JSON
export interface ViewAxisExport {
  id: string;
  name: string;
  color: string;
  min: number | '';
  max: number | '';
  auto: boolean;
}

export interface ViewChannelExport {
  id: string;
  color: string;
  visible: boolean;
  axisId?: string;
}

// navigators time selected window (primarily used for export/import views)
export interface ViewTimeRange {
  start: number | null;
  end: number | null;
}

export interface ViewExport {
  version: 1;
  axes: ViewAxisExport[];
  channels: ViewChannelExport[];
  // Optional so view files exported before this existed still import.
  timeRange?: ViewTimeRange;
}

export const DataContext = createContext<DataContextValue | null>(null);

// Cycled through as new channels are discovered in an imported CSV, and
// when a new axis is added manually from the Y-Axis Manager.
export const PALETTE = ['#e32412', '#fadb8b', '#2364b9', '#059649', '#8b5cf6', '#f97316', '#14b8a6', '#ec4899'];

const now = Date.now();

// Placeholder demo data shown before any CSV has been loaded.
export const DEFAULT_STATE: DataState = {
  timestamps: [now - 120000, now - 60000, now],
  channels: [
    { id: 'ch-sample', label: 'Sample', kind: 'numeric', unit: 'PSA', color: '#e32412', visible: true, axisId: 'axis-psa', values: [5, 10, 5] },
    { id: 'ch-sample2', label: 'Sample2', kind: 'numeric', unit: 'PSI', color: '#2364b9', visible: true, axisId: 'axis-psi', values: [10, 20, 30] },
  ],
  axes: [
    { id: 'axis-psa', name: 'PSA', color: '#e32412', min: '', max: '', auto: true },
    { id: 'axis-psi', name: 'PSI', color: '#2364b9', min: '', max: '', auto: true },
  ],
};

function slugify(header: string, fallback: string) {
  const slug = header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return slug || fallback;
}

// Minimal CSV line splitter; handles simple quoted fields, good enough for
// the plain timestamp/numeric exports this app deals with.
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

// Converts one cell of a CSV's first (time) column to epoch ms. Accepts:
//  - date/time strings Date.parse understands ("2026-04-22T14:26:00Z")
//  - numeric epoch times in any common unit, told apart by magnitude:
//    nanoseconds (the test stand's own format, e.g. 1.776824760946079e+18),
//    microseconds, milliseconds or seconds
//  - small numbers (under ~3 years' worth of seconds) as seconds RELATIVE
//    to the start of the test, offset by baseTime (epoch ms) - which comes
//    from the test fire's metadata when there is one, see parseCsv options
// Returns NaN for anything unparseable, so the row gets skipped.
export function parseTimeCell(cell: string, baseTime = 0): number {
  const trimmed = cell.trim();
  if (trimmed === '') return NaN;
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) return Date.parse(trimmed);
  const magnitude = Math.abs(numeric);
  if (magnitude >= 1e17) return numeric / 1e6; // ns -> ms
  if (magnitude >= 1e14) return numeric / 1e3; // us -> ms
  if (magnitude >= 1e11) return numeric; // already ms
  if (magnitude >= 1e8) return numeric * 1e3; // epoch s -> ms
  return baseTime + numeric * 1e3; // relative s -> ms
}

// ensure all solenoid numbers/values are 0 or 1
function normalizeState(value: number): number {
  return Number.isFinite(value) && value >= 0.5 ? 1 : 0;
}

export interface ParseCsvOptions {
  // Epoch ms that RELATIVE time values (seconds since the start of the
  // test) are offset from - typically the test fire's metadata date/time.
  // Ignored when the time column already holds absolute times.
  baseTime?: number;
}

// parses a CSV in the format of timestamps, columns
// chunks out solenoids and data sets
export function parseCsv(text: string, options: ParseCsvOptions = {}): DataState {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('CSV needs a header row plus at least one data row.');
  }

  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  const columnHeaders = headers.slice(1); // first column is the timestamp

  const timestamps: number[] = [];
  const rawColumns: string[][] = columnHeaders.map(() => []);

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const time = parseTimeCell(cells[0] ?? '', options.baseTime);
    if (Number.isNaN(time)) continue;
    timestamps.push(time);
    for (let c = 0; c < columnHeaders.length; c++) {
      rawColumns[c].push(cells[c + 1] ?? '');
    }
  }

  if (timestamps.length === 0) {
    throw new Error('No rows with a parseable timestamp were found.');
  }

  const axes: AxisConfig[] = [];

  const channels: ChannelConfig[] = columnHeaders.map((header, index) => {
    const values = rawColumns[index].map((v) => Number(v));
    const color = PALETTE[index % PALETTE.length];
    const isState = /state$/i.test(header);

    if (isState) {
      return {
        id: slugify(header, `channel-${index}`),
        // "PV_N2_17_state" / "Valve 3 State" -> "PV_N2_17" / "Valve 3"
        label: header.replace(/[\s_-]*state$/i, '').trim() || header,
        kind: 'solenoid',
        color,
        visible: true,
        values: values.map(normalizeState),
      };
    }

    const match = header.match(/^(.*?)\s+([A-Za-z]+)$/);
    const label = match ? match[1].trim() : header;
    const unit = match ? match[2].trim() : undefined;

    const axisId = `axis-${slugify(header, `channel-${index}`)}`;
    axes.push({
      id: axisId,
      name: unit ? `${label} (${unit})` : label,
      color,
      min: '',
      max: '',
      auto: true,
    });

    return {
      id: slugify(header, `channel-${index}`),
      label,
      kind: 'numeric',
      unit,
      color,
      visible: true,
      axisId,
      values,
    };
  });

  return {
    timestamps,
    channels,
    axes,
  };
}

// all the graph data without the visual parts
export interface TestFireDatasetChannel {
  label: string;
  kind: ChannelKind;
  unit?: string;
  values: number[]; // aligned 1:1 with TestFireDataset.timestamps
}

export interface TestFireDataset {
  timestamps: number[]; // epoch ms
  channels: TestFireDatasetChannel[];
}

function isTestFireDatasetChannel(value: unknown): value is TestFireDatasetChannel {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.label === 'string' &&
    (c.kind === 'numeric' || c.kind === 'solenoid') &&
    (c.unit === undefined || typeof c.unit === 'string') &&
    Array.isArray(c.values) &&
    c.values.every((v) => typeof v === 'number')
  );
}

// Sanity-checks a test fire dataset fetched from the server - enough to
// fail with a clear message (surfaced as loadError) instead of crashing
// later when it gets plotted.
export function isValidTestFireDataset(value: unknown): value is TestFireDataset {
  if (!value || typeof value !== 'object') return false;
  const d = value as Record<string, unknown>;

  const timestamps = d.timestamps;
  if (!Array.isArray(timestamps) || !timestamps.every((t) => typeof t === 'number')) return false;

  const channels = d.channels;
  if (!Array.isArray(channels) || !channels.every(isTestFireDatasetChannel)) return false;

  return (channels as TestFireDatasetChannel[]).every((c) => c.values.length === timestamps.length);
}

// metadata that comes from the first poll to the server
export interface TestFireMetadata {
  name?: string;
  project?: string;
  dateTime?: number;
}

// A test fire ready to go on the chart: its data plus whatever metadata
// came with it.
export interface LoadedTestFire {
  state: DataState;
  metadata: TestFireMetadata | null;
}

export function parseTestFireMetadata(value: unknown): TestFireMetadata {
  if (!value || typeof value !== 'object') return {};
  const raw = value as Record<string, unknown>;
  const metadata: TestFireMetadata = {};
  if (typeof raw.name === 'string') metadata.name = raw.name;
  if (typeof raw.project === 'string') metadata.project = raw.project;
  const ms = parseServerDate(raw.date ?? raw.datetime ?? raw.date_time ?? raw.timestamp);
  if (ms !== undefined) metadata.dateTime = ms;
  return metadata;
}

// converts timestamps to epoch ms
export function parseServerDate(value: unknown): number | undefined {
  if (typeof value === 'number') {
    const ms = parseTimeCell(String(value));
    return Number.isFinite(ms) ? ms : undefined;
  }
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const normalized = value
    .trim()
    .replace(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)(?:\.(\d+))?/, (_, date: string, time: string, frac?: string) =>
      frac ? `${date}T${time}.${frac.slice(0, 3).padEnd(3, '0')}` : `${date}T${time}`
    );
  const ms = parseTimeCell(normalized);
  return Number.isFinite(ms) ? ms : undefined;
}

interface ResponsePart {
  headers: Record<string, string>; // lower-cased header names
  body: string;
}

// splits the second server poll into its different parts
function splitMultipart(text: string, contentType: string | null): ResponsePart[] {
  const fromHeader = contentType?.match(/boundary="?([^";]+)"?/i)?.[1];
  const fromBody = text.match(/^\s*--(\S+)/)?.[1];
  const boundary = fromHeader ?? fromBody;
  if (!boundary) return [];

  const delimiter = `--${boundary}`;
  return text
    .split(delimiter)
    .slice(1) // anything before the first boundary is preamble
    .filter((chunk) => !chunk.startsWith('--')) // closing "--BOUNDARY--"
    .map((chunk) => {
      const normalized = chunk.replace(/^\r?\n/, '');
      const splitAt = normalized.search(/\r?\n\r?\n/);
      const headerBlock = splitAt === -1 ? '' : normalized.slice(0, splitAt);
      const body = splitAt === -1 ? normalized : normalized.slice(splitAt).replace(/^\r?\n\r?\n/, '');
      const headers: Record<string, string> = {};
      for (const line of headerBlock.split(/\r?\n/)) {
        const colon = line.indexOf(':');
        if (colon > 0) headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
      }
      return { headers, body: body.replace(/\r?\n$/, '') };
    });
}

// Unpacks a test fire as the server sends it from get_test/<name>: a
// multipart response made of
//   1. a JSON part - the test fire's metadata (name, project, date/time)
//   2. a CSV part named data.csv - the recorded channel data
//   3. a CSV part named test.csv - the test's limits and valve
//      sequences, not used by the chart, so it's ignored
// The data CSV is FOUND rather than assumed to be the second part
export function parseTestFireResponse(text: string, contentType: string | null): LoadedTestFire {
  const parts = splitMultipart(text, contentType);
  if (parts.length === 0) throw new Error("Test fire data wasn't in the expected multipart format.");

  const typeOf = (part: ResponsePart) => (part.headers['content-type'] ?? '').toLowerCase();
  const filenameOf = (part: ResponsePart) =>
    part.headers['content-disposition']?.match(/filename="?([^";]+)"?/i)?.[1]?.toLowerCase() ?? '';

  const jsonPart = parts.find((part) => typeOf(part).includes('json'));
  let metadata: TestFireMetadata | null = null;
  if (jsonPart) {
    try {
      metadata = parseTestFireMetadata(JSON.parse(jsonPart.body));
    } catch {
      metadata = null; // bad metadata shouldn't stop the data from loading
    }
  }

  const csvParts = parts.filter((part) => typeOf(part).includes('csv') || filenameOf(part).endsWith('.csv'));
  if (csvParts.length === 0) throw new Error('Test fire response had no data CSV in it.');

  let best: DataState | null = null;
  for (const part of csvParts) {
    try {
      const candidate = parseCsv(part.body, { baseTime: metadata?.dateTime });
      if (!best || candidate.timestamps.length > best.timestamps.length) best = candidate;
    } catch {
      // Not a parseable time-series CSV (e.g. the sequence file) - skip it.
    }
  }
  if (!best) throw new Error('None of the CSV files in the test fire response had readable time-series data.');

  return { state: best, metadata };
}

// set the colors and axes to the data series
export function buildStateFromDataset(dataset: TestFireDataset): DataState {
  const axes: AxisConfig[] = [];

  const channels: ChannelConfig[] = dataset.channels.map((channel, index) => {
    const id = slugify(channel.label, `channel-${index}`);
    const color = PALETTE[index % PALETTE.length];

    if (channel.kind === 'solenoid') {
      return { id, label: channel.label, kind: 'solenoid', color, visible: true, values: channel.values };
    }

    const axisId = `axis-${id}`;
    axes.push({
      id: axisId,
      name: channel.unit ? `${channel.label} (${channel.unit})` : channel.label,
      color,
      min: '',
      max: '',
      auto: true,
    });

    return { id, label: channel.label, kind: 'numeric', unit: channel.unit, color, visible: true, axisId, values: channel.values };
  });

  return { timestamps: dataset.timestamps, channels, axes };
}

// Pulls just the view-relevant fields out of the current state, ready to
// serialize to JSON.
export function buildViewExport(state: DataState, timeRange?: ViewTimeRange): ViewExport {
  return {
    version: 1,
    axes: state.axes.map(({ id, name, color, min, max, auto }) => ({ id, name, color, min, max, auto })),
    channels: state.channels.map(({ id, color, visible, axisId }) => ({ id, color, visible, axisId })),
    ...(timeRange ? { timeRange } : {}),
  };
}

function isTimeRangeEdge(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

// loosely validates a JSON as a view export to reduce failed view imports
export function parseViewJson(text: string): ViewExport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !Array.isArray((parsed as { axes?: unknown }).axes) ||
    !Array.isArray((parsed as { channels?: unknown }).channels)
  ) {
    throw new Error("That JSON doesn't look like a Spyglass view export.");
  }

  const candidate = parsed as ViewExport;
  const axesValid = candidate.axes.every((a) => a && typeof a.id === 'string');
  const channelsValid = candidate.channels.every((c) => c && typeof c.id === 'string');
  if (!axesValid || !channelsValid) {
    throw new Error("That JSON doesn't look like a Spyglass view export.");
  }

  if (candidate.timeRange !== undefined) {
    const range = candidate.timeRange as unknown as Record<string, unknown> | null;
    if (!range || typeof range !== 'object' || !isTimeRangeEdge(range.start ?? null) || !isTimeRangeEdge(range.end ?? null)) {
      throw new Error('That view\'s timeRange should look like { "start": 1.2, "end": 3.5 } (seconds, or null for the edge of the data).');
    }
    candidate.timeRange = { start: (range.start as number | null) ?? null, end: (range.end as number | null) ?? null };
  }

  return candidate;
}

// applies a view export to the current graph state
export function applyViewToState(
  state: DataState,
  view: ViewExport
): { state: DataState; matchedAxes: number; matchedChannels: number } {
  const axisById = new Map(view.axes.map((a) => [a.id, a]));
  const channelById = new Map(view.channels.map((c) => [c.id, c]));
  let matchedAxes = 0;
  let matchedChannels = 0;

  const existingAxisIds = new Set(state.axes.map((a) => a.id));

  // decides what must happen to the axes (add them or cull them)
  const keptAxes = state.axes
    .filter((axis) => axisById.has(axis.id))
    .map((axis) => {
      const match = axisById.get(axis.id)!;
      matchedAxes += 1;
      return { ...axis, name: match.name, color: match.color, min: match.min, max: match.max, auto: match.auto };
    });

  const recreatedAxes = view.axes
    .filter((axis) => !existingAxisIds.has(axis.id))
    .map((axis) => ({ id: axis.id, name: axis.name, color: axis.color, min: axis.min, max: axis.max, auto: axis.auto }));
  matchedAxes += recreatedAxes.length;

  const axes = [...keptAxes, ...recreatedAxes];
  const survivingAxisIds = new Set(axes.map((a) => a.id));

  const channels = state.channels.map((channel) => {
    const match = channelById.get(channel.id);
    if (match) {
      matchedChannels += 1;
      return { ...channel, color: match.color, visible: match.visible, axisId: match.axisId };
    }
    // remove any axisId that got yoinked
    if (channel.axisId && !survivingAxisIds.has(channel.axisId)) {
      return { ...channel, axisId: undefined };
    }
    return channel;
  });

  return { state: { ...state, axes, channels }, matchedAxes, matchedChannels };
}

// sets up a CSV export of current plotted data
export function buildPlottedCsv(state: DataState): string {
  const visibleChannels = state.channels.filter((c) => c.visible);
  if (visibleChannels.length === 0) {
    throw new Error('No visible channels to export - toggle at least one on first.');
  }

  const headerNames = visibleChannels.map((c) =>
    c.kind === 'solenoid' ? `${c.label} State` : c.unit ? `${c.label} ${c.unit}` : c.label
  );
  const headerRow = ['timestamp', ...headerNames].join(',');

  const rows = state.timestamps.map((t, i) => {
    const cells = visibleChannels.map((c) => {
      const v = c.values[i];
      return Number.isFinite(v) ? String(v) : '';
    });
    return [new Date(t).toISOString(), ...cells].join(',');
  });

  return [headerRow, ...rows].join('\n');
}

// make new ids for manually added axes
export function generateManualAxisId(existingIds: Iterable<string>): string {
  const existing = new Set(existingIds);
  let n = 1;
  while (existing.has(`axis-manual-${n}`)) {
    n += 1;
  }
  return `axis-manual-${n}`;
}
