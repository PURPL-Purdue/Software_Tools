import type { Project, TestFire } from './projectsStore';
import {
  buildStateFromDataset,
  isValidTestFireDataset,
  parseServerDate,
  parseTestFireResponse,
  type LoadedTestFire,
} from './dataStore';

// caps how many entries can be shown for a proj on the timeline
const MAX_ENTRIES = 20;

// base URL for SPYGLASS server
const CONFIGURED_API_BASE_URL =
  (import.meta.env.VITE_SPYGLASS_API_BASE_URL as string | undefined)?.trim().replace(/\/+$/, '') || undefined;

// ensures that even thru build it calls the proper url
const API_BASE_URL = CONFIGURED_API_BASE_URL && import.meta.env.DEV ? '/api' : CONFIGURED_API_BASE_URL;

async function fetchJsonList<T>(url: string, what: string): Promise<T[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${what} (${res.status})`);
  // show that any 200 errors are displayed rather than just 400 errors
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error(`No ${what} found (the server didn't return JSON).`);
  }
  if (!Array.isArray(data)) throw new Error(`Expected ${what} to be a JSON list.`);
  return data as T[];
}

// converts Spyglass server test fire responses each into a testfire object
function toTestFire(item: unknown): TestFire | null {
  if (typeof item === 'string') return item.trim() ? { id: '', name: item } : null;

  if (Array.isArray(item)) {
    const [name, when] = item as unknown[];
    if (typeof name !== 'string' || !name.trim()) return null;
    return { id: '', name, timestamp: parseServerDate(when) };
  }

  if (!item || typeof item !== 'object') return null;
  const raw = item as Record<string, unknown>;

  if (typeof raw.name === 'string') {
    if (!raw.name.trim()) return null;
    return {
      id: typeof raw.id === 'string' || typeof raw.id === 'number' ? String(raw.id) : '',
      name: raw.name,
      timestamp: parseServerDate(raw.timestamp ?? raw.date ?? raw.datetime),
    };
  }

  // { "<test name>": "<date>" }
  const entries = Object.entries(raw);
  if (entries.length !== 1) return null;
  const [name, when] = entries[0];
  if (!name.trim()) return null;
  return { id: '', name, timestamp: parseServerDate(when) };
}

function toTestFires(items: unknown[]): TestFire[] {
  const testFires = items.map(toTestFire).filter((tf): tf is TestFire => tf !== null);
  return withUniqueIds(testFires);
}

// ensure all test fires have unique ids even w/ dupes
function withUniqueIds(testFires: TestFire[]): TestFire[] {
  const seen = new Map<string, number>();
  return testFires.map((testFire) => {
    const base = testFire.id || testFire.name;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return { ...testFire, id: count === 1 ? base : `${base}#${count}` };
  });
}

// add the project chosen to the url for the first poll to the server
export async function fetchTestFires(project: Project): Promise<TestFire[]> {
  const url = API_BASE_URL
    ? `${API_BASE_URL}/get_test_list/${encodeURIComponent(project)}`
    : `/mock-api/test-fires/${encodeURIComponent(project)}.json`;

  const testFires = toTestFires(await fetchJsonList<unknown>(url, 'test fires'));
  // order all tests by timestamp if possible
  const ordered = testFires.every((tf) => tf.timestamp !== undefined)
    ? [...testFires].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
    : testFires;
  return ordered.length > MAX_ENTRIES ? ordered.slice(-MAX_ENTRIES) : ordered;
}

// function to fetch a test fire from the Spyglass server
export async function fetchTestFire(project: Project, testFireId: string, testFireName: string): Promise<LoadedTestFire> {
  if (API_BASE_URL) {
    const res = await fetch(`${API_BASE_URL}/get_test/${encodeURIComponent(testFireName)}`);
    if (!res.ok) throw new Error(`Failed to load test fire data (${res.status})`);
    return parseTestFireResponse(await res.text(), res.headers.get('content-type'));
  }

  const res = await fetch(`/mock-api/test-fires/${encodeURIComponent(project)}/${encodeURIComponent(testFireId)}.json`);
  if (!res.ok) throw new Error(`Failed to load test fire data (${res.status})`);
  const data = (await res.json()) as unknown;
  if (!isValidTestFireDataset(data)) throw new Error('Test fire data was not in the expected shape.');
  return { state: buildStateFromDataset(data), metadata: null };
}
