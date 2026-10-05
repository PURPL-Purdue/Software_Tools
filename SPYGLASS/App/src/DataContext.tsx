import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  applyViewToState,
  DataContext,
  DEFAULT_STATE,
  generateManualAxisId,
  PALETTE,
  parseCsv,
  type AxisConfig,
  type DataContextValue,
  type DataState,
  type LoadedTestFire,
  type TestFireMetadata,
  type ViewExport,
  type ViewTimeRange,
} from './dataStore';

// Owns the loaded dataset (timestamps, channels, axes) and every mutation
// on it, and makes it available to the chart + both sidebars via context.
export const DataProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<DataState>(DEFAULT_STATE);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [testFire, setTestFire] = useState<TestFireMetadata | null>(null);

  // charts current scrubbed time range
  const viewTimeRangeRef = useRef<ViewTimeRange>({ start: null, end: null });
  const reportViewTimeRange = useCallback((range: ViewTimeRange) => {
    viewTimeRangeRef.current = range;
  }, []);
  const getViewTimeRange = useCallback(() => viewTimeRangeRef.current, []);
  const [requestedTimeRange, setRequestedTimeRange] = useState<{ range: ViewTimeRange; token: number } | null>(null);

  const loadCsvText = (text: string): string | null => {
    try {
      setState(parseCsv(text));
      setTestFire(null);
      setLoadError(null);
      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not parse that CSV.';
      setLoadError(message);
      return message;
    }
  };

  const loadTestFire = (loaded: LoadedTestFire) => {
    setState(loaded.state);
    setTestFire(loaded.metadata);
    setLoadError(null);
  };

  const toggleChannelVisible = (id: string) =>
    setState((prev) => ({
      ...prev,
      channels: prev.channels.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c)),
    }));

  const setAllChannelsVisible = (visible: boolean) =>
    setState((prev) => ({
      ...prev,
      channels: prev.channels.map((c) => ({ ...c, visible })),
    }));

  const invertChannelVisibility = () =>
    setState((prev) => ({
      ...prev,
      channels: prev.channels.map((c) => ({ ...c, visible: !c.visible })),
    }));

  const setChannelColor = (id: string, color: string) =>
    setState((prev) => ({
      ...prev,
      channels: prev.channels.map((c) => (c.id === id ? { ...c, color } : c)),
    }));

  const setChannelAxis = (id: string, axisId: string) =>
    setState((prev) => ({
      ...prev,
      channels: prev.channels.map((c) => (c.id === id ? { ...c, axisId } : c)),
    }));

  const renameAxis = (id: string, name: string) =>
    setState((prev) => ({ ...prev, axes: prev.axes.map((a) => (a.id === id ? { ...a, name } : a)) }));

  const setAxisColor = (id: string, color: string) =>
    setState((prev) => ({ ...prev, axes: prev.axes.map((a) => (a.id === id ? { ...a, color } : a)) }));

  const setAxisMin = (id: string, min: number | '') =>
    setState((prev) => ({ ...prev, axes: prev.axes.map((a) => (a.id === id ? { ...a, min } : a)) }));

  const setAxisMax = (id: string, max: number | '') =>
    setState((prev) => ({ ...prev, axes: prev.axes.map((a) => (a.id === id ? { ...a, max } : a)) }));

  const toggleAxisAuto = (id: string) =>
    setState((prev) => ({ ...prev, axes: prev.axes.map((a) => (a.id === id ? { ...a, auto: !a.auto } : a)) }));

  const deleteAxis = (id: string) =>
    setState((prev) => ({
      ...prev,
      axes: prev.axes.filter((a) => a.id !== id),
      channels: prev.channels.map((c) => (c.axisId === id ? { ...c, axisId: undefined } : c)),
    }));

  const addAxis = () =>
    setState((prev) => {
      const id = generateManualAxisId(prev.axes.map((a) => a.id));
      const newAxis: AxisConfig = {
        id,
        name: `Axis ${prev.axes.length + 1}`,
        color: PALETTE[prev.axes.length % PALETTE.length],
        min: '',
        max: '',
        auto: true,
      };
      return { ...prev, axes: [...prev.axes, newAxis] };
    });

  // apply an imported view setting to the current state
  const importView = useCallback(
    (view: ViewExport) => {
      const { state: nextState, matchedAxes, matchedChannels } = applyViewToState(state, view);
      setState(nextState);
      const timeRange = view.timeRange;
      if (timeRange) {
        setRequestedTimeRange((prev) => ({ range: timeRange, token: (prev?.token ?? 0) + 1 }));
      }
      return { matchedAxes, matchedChannels, appliedTimeRange: !!timeRange };
    },
    [state]
  );

  const value = useMemo<DataContextValue>(
    () => ({
      ...state,
      loadCsvText,
      loadTestFire,
      testFire,
      loadError,
      toggleChannelVisible,
      setAllChannelsVisible,
      invertChannelVisibility,
      setChannelColor,
      setChannelAxis,
      renameAxis,
      setAxisColor,
      setAxisMin,
      setAxisMax,
      toggleAxisAuto,
      deleteAxis,
      addAxis,
      importView,
      reportViewTimeRange,
      getViewTimeRange,
      requestedTimeRange,
    }),
    [state, testFire, loadError, importView, reportViewTimeRange, getViewTimeRange, requestedTimeRange]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};
