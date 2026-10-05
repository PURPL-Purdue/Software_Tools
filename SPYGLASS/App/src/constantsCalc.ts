import { parse as parseYaml } from 'yaml';
import { PALETTE, type AxisConfig, type ChannelConfig, type DataState } from './dataStore';

// ---------------------------------------------------------------------------
// calculated traces built from a constants .yaml file + the
// pressure traces already on the chart. Formulas follow Dominik's Input.
// Output units: rho kg/m^3, mdot lbm/s,
// O/F dimensionless, c* m/s, stiffness dimensionless, regen dP psi.
// ---------------------------------------------------------------------------

const PSI_TO_PA = 6894.757;
const IN2_TO_M2 = 0.00064516;
const KG_TO_LBM = 2.20462;

// Prefix for every calculated channel's id, so a re-import can replace them.
export const CALC_ID_PREFIX = 'calc-';

export type Constants = Record<string, unknown>;

// ---------- Scalar calculations (one per formula in the doc) ----------

// Injector stiffness: (feed - chamber) / chamber. Undefined with no chamber pressure.
export function stiffness(feedPsi: number, chamberPsi: number): number {
  return chamberPsi > 0 ? (feedPsi - chamberPsi) / chamberPsi : NaN;
}

// Ideal-gas density (kg/m^3) from a pressure in psi.
export function idealGasDensity(pressPsi: number, R: number, tempK: number): number {
  return (pressPsi * PSI_TO_PA) / (R * tempK);
}

// Incompressible orifice/venturi mass flow (lbm/s). No flow when feed <= chamber.
export function incompressibleMdot(CdA: number, rho: number, feedPsi: number, chamberPsi: number): number {
  if (feedPsi <= chamberPsi) return 0;
  return CdA * IN2_TO_M2 * KG_TO_LBM * Math.sqrt(2 * rho * (feedPsi - chamberPsi) * PSI_TO_PA);
}

// Critical pressure ratio below which the orifice is choked.
export function criticalPressureRatio(gamma: number): number {
  return (2 / (gamma + 1)) ** (gamma / (gamma - 1));
}

// Compressible orifice mass flow (lbm/s): choked or subsonic depending on
// chamber/feed pressure ratio. rho is the upstream (feed) gas density.
export function compressibleMdot(
  CdA: number,
  gamma: number,
  rho: number,
  feedPsi: number,
  chamberPsi: number
): number {
  if (feedPsi <= chamberPsi) return 0;
  const k = CdA * IN2_TO_M2 * KG_TO_LBM;
  const feedPa = feedPsi * PSI_TO_PA;
  const pr = chamberPsi / feedPsi;

  if (pr <= criticalPressureRatio(gamma)) {
    // Choked (sonic)
    return k * Math.sqrt(gamma * rho * feedPa * (2 / (gamma + 1)) ** ((gamma + 1) / (gamma - 1)));
  }
  // Subsonic compressible
  const term = pr ** (2 / gamma) - pr ** ((gamma + 1) / gamma);
  if (term <= 0) return 0;
  return k * Math.sqrt(2 * rho * feedPa * (gamma / (gamma - 1)) * term);
}

// Characteristic velocity c* (m/s) from chamber pressure, throat area and total mdot (lbm/s).
export function cStar(chamberPsi: number, throatAreaIn2: number, oxMdot: number, fuelMdot: number): number {
  const total = oxMdot + fuelMdot;
  return total > 0 ? (chamberPsi * PSI_TO_PA * throatAreaIn2 * IN2_TO_M2 * KG_TO_LBM) / total : NaN;
}

// Oxidizer-to-fuel mixture ratio.
export function mixtureRatio(oxMdot: number, fuelMdot: number): number {
  return fuelMdot > 0 ? oxMdot / fuelMdot : NaN;
}

// Simple pressure difference (psi).
export function pressureDrop(inletPsi: number, outletPsi: number): number {
  return inletPsi - outletPsi;
}

// ---------- Trace definitions ----------

// Existing sensor traces the YAML maps onto instrumentation names (all psi).
const MEASURED_KEYS = [
  'm_ox_press',
  'm_fuel_press',
  'm_chamber_press',
  't_ox_press',
  't_fuel_press',
  't_chamber_press',
  'inlet_press',
  'outlet_press',
] as const;

interface DerivedTrace {
  key: string;
  unit?: string;
  inputs: string[]; // measured keys or earlier derived keys, element-wise
  constants: string[]; // numeric constants pulled from the YAML
  calc: (inputs: number[], c: number[]) => number;
}

// Order matters: a trace can only use derived traces defined above it.
const DERIVED_TRACES: DerivedTrace[] = [
  { key: 'm_ox_stiff', inputs: ['m_ox_press', 'm_chamber_press'], constants: [], calc: ([f, ch]) => stiffness(f, ch) },
  { key: 'm_fuel_stiff', inputs: ['m_fuel_press', 'm_chamber_press'], constants: [], calc: ([f, ch]) => stiffness(f, ch) },

  { key: 'm_ox_rho', unit: 'kg/m^3', inputs: ['m_ox_press'], constants: ['m_ox_R', 'm_ox_temp'], calc: ([p], [R, T]) => idealGasDensity(p, R, T) },
  { key: 't_ox_rho', unit: 'kg/m^3', inputs: ['t_ox_press'], constants: ['t_ox_R', 't_ox_temp'], calc: ([p], [R, T]) => idealGasDensity(p, R, T) },
  { key: 't_fuel_rho', unit: 'kg/m^3', inputs: ['t_fuel_press'], constants: ['t_fuel_R', 't_fuel_temp'], calc: ([p], [R, T]) => idealGasDensity(p, R, T) },

  {
    key: 'm_fuel_mdot',
    unit: 'lbm/s',
    inputs: ['m_fuel_press', 'm_chamber_press'],
    constants: ['venturi_CdA', 'm_fuel_rho'],
    calc: ([f, ch], [CdA, rho]) => incompressibleMdot(CdA, rho, f, ch),
  },
  {
    key: 'm_ox_mdot',
    unit: 'lbm/s',
    inputs: ['m_ox_press', 'm_chamber_press', 'm_ox_rho'],
    constants: ['m_ox_CdA', 'm_ox_gamma'],
    calc: ([f, ch, rho], [CdA, g]) => compressibleMdot(CdA, g, rho, f, ch),
  },
  {
    key: 't_fuel_mdot',
    unit: 'lbm/s',
    inputs: ['t_fuel_press', 't_chamber_press', 't_fuel_rho'],
    constants: ['t_fuel_CdA', 't_fuel_gamma'],
    calc: ([f, ch, rho], [CdA, g]) => compressibleMdot(CdA, g, rho, f, ch),
  },
  {
    key: 't_ox_mdot',
    unit: 'lbm/s',
    inputs: ['t_ox_press', 't_chamber_press', 't_ox_rho'],
    constants: ['t_ox_CdA', 't_ox_gamma'],
    calc: ([f, ch, rho], [CdA, g]) => compressibleMdot(CdA, g, rho, f, ch),
  },

  {
    key: 'm_c_star',
    unit: 'm/s',
    inputs: ['m_chamber_press', 'm_ox_mdot', 'm_fuel_mdot'],
    constants: ['m_throat_area'],
    calc: ([ch, ox, fu], [At]) => cStar(ch, At, ox, fu),
  },
  {
    key: 't_c_star',
    unit: 'm/s',
    inputs: ['t_chamber_press', 't_ox_mdot', 't_fuel_mdot'],
    constants: ['t_throat_area'],
    calc: ([ch, ox, fu], [At]) => cStar(ch, At, ox, fu),
  },

  { key: 't_OF', inputs: ['t_ox_mdot', 't_fuel_mdot'], constants: [], calc: ([ox, fu]) => mixtureRatio(ox, fu) },
  { key: 'm_OF', inputs: ['m_ox_mdot', 'm_fuel_mdot'], constants: [], calc: ([ox, fu]) => mixtureRatio(ox, fu) },
  { key: 'dp_regen', unit: 'psi', inputs: ['inlet_press', 'outlet_press'], constants: [], calc: ([i, o]) => pressureDrop(i, o) },
];

// ---------- YAML + channel lookup ----------

export function parseConstantsYaml(text: string): Constants {
  let parsed: unknown;
  try {
    parsed = parseYaml(text);
  } catch (err) {
    throw new Error(`That file is not valid YAML${err instanceof Error ? `: ${err.message}` : '.'}`, { cause: err });
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error("That YAML doesn't contain any key: value constants.");
  }
  return parsed as Constants;
}

const normalizeName = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

// Finds the loaded numeric channel for an instrumentation name like
// "PT_GO2_06", matching on label (case/punctuation-insensitive).
function findChannelValues(state: DataState, instrumentName: string): number[] | undefined {
  const target = normalizeName(instrumentName);
  const channel = state.channels.find(
    (c) => c.kind === 'numeric' && !c.id.startsWith(CALC_ID_PREFIX) && normalizeName(c.label) === target
  );
  return channel?.values;
}

// ---------- Orchestration ----------

export interface AddedTrace {
  key: string;
  unit?: string;
}

export interface SkippedTrace {
  key: string;
  reason: string;
}

export interface DerivedTracesResult {
  state: DataState;
  added: AddedTrace[];
  skipped: SkippedTrace[];
}

// Computes every derived trace it can from the constants + current data,
// replaces any previously calculated traces, and gives each new trace its
// own axis. Traces whose inputs/constants are missing are skipped.
export function addDerivedTraces(state: DataState, constants: Constants): DerivedTracesResult {
  const series = new Map<string, number[]>();
  const missing = new Map<string, string>(); // key -> why it's unavailable

  for (const key of MEASURED_KEYS) {
    const name = constants[key];
    if (typeof name !== 'string') {
      missing.set(key, `"${key}" not in YAML`);
      continue;
    }
    const values = findChannelValues(state, name);
    if (values) series.set(key, values);
    else missing.set(key, `channel ${name} not loaded`);
  }

  const baseChannels = state.channels.filter((c) => !c.id.startsWith(CALC_ID_PREFIX));
  const baseAxes = state.axes.filter((a) => !a.id.startsWith(`axis-${CALC_ID_PREFIX}`));
  const newChannels: ChannelConfig[] = [];
  const newAxes: AxisConfig[] = [];
  const added: AddedTrace[] = [];
  const skipped: DerivedTracesResult['skipped'] = [];

  for (const trace of DERIVED_TRACES) {
    const reasons = [
      ...trace.inputs.filter((k) => !series.has(k)).map((k) => missing.get(k) ?? `${k} unavailable`),
      ...trace.constants.filter((k) => typeof constants[k] !== 'number').map((k) => `"${k}" not a number in YAML`),
    ];
    if (reasons.length > 0) {
      const reason = [...new Set(reasons)].join(', ');
      missing.set(trace.key, reason);
      skipped.push({ key: trace.key, reason });
      continue;
    }

    const inputArrays = trace.inputs.map((k) => series.get(k)!);
    const constantValues = trace.constants.map((k) => constants[k] as number);
    const values = state.timestamps.map((_, i) => {
      const v = trace.calc(inputArrays.map((arr) => arr[i]), constantValues);
      return Number.isFinite(v) ? v : NaN;
    });
    series.set(trace.key, values);

    const id = `${CALC_ID_PREFIX}${trace.key.toLowerCase().replace(/_/g, '-')}`;
    const axisId = `axis-${id}`;
    const color = PALETTE[(baseChannels.length + newChannels.length) % PALETTE.length];
    newAxes.push({
      id: axisId,
      name: trace.unit ? `${trace.key} (${trace.unit})` : trace.key,
      color,
      min: '',
      max: '',
      auto: true,
    });
    newChannels.push({ id, label: trace.key, kind: 'numeric', unit: trace.unit, color, visible: true, axisId, values });
    added.push({ key: trace.key, unit: trace.unit });
  }

  return {
    state: { ...state, channels: [...baseChannels, ...newChannels], axes: [...baseAxes, ...newAxes] },
    added,
    skipped,
  };
}
