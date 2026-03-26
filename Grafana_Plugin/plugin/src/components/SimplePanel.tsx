import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import { PanelProps, FieldType, Field } from '@grafana/data';
import { useTheme2 } from '@grafana/ui';
import { css } from '@emotion/css';
import { SimpleOptions } from 'types';
import LogoSvg from '../img/PURPL_wordmark_white.svg';

// preset constants about GUI so i don't have to search through this trash
const LINE_WIDTH = 3;
const GRAPH_VERTICAL_PADDING = 5;

const SOLENOID_MARKER_TRUE_LIFT = 0;
const SOLENOID_MARKER_FALSE_LIFT = 0;
const SOLENOID_MARKER_TRUE_LINE_STYLE = 'dashed';
const SOLENOID_MARKER_FALSE_LINE_STYLE = 'dotted';
const LINE_AXIS_SPACING = 48;

const LINE_COLOR_START_INDEX = 18;


type Props = PanelProps<SimpleOptions>; // args from Grafana

// series = whole table of values given in frames
// frame = collection of fields in series
// field = columns of table containing actual info
type SeriesData = {
  key: string;
  label: string;
  unit: string;
  field: Field;
  kind: 'numeric' | 'solenoid';
  color: string;
  data: Array<number | null>; // keep nulls
};

type AxisConfig = {
  id: string;
  name: string;
  side: 'left' | 'right';
  minMode: 'auto' | 'manual';
  maxMode: 'auto' | 'manual';
  min?: number;
  max?: number;
};

//type ChannelAxisMap = Record<string, string>; // channel key -> axis id

// this function will round a number value by every roundBy values.
// For example roundBy(33, 10) will return 40 because it rounds by +10
// on the other hand, roundBy(33, -10) will return 30 because it rounds by -10
// Implementation: Primarily used to make chart y-axis bounds round numbers
const roundBy = (
  { value, roundBy }: { value: number; roundBy: number }
): number => {
  // round by 0 = same value
  if (roundBy === 0) {
    return value;
  }

  // how much to step by
  const step = Math.abs(roundBy);

  // positive value -> round up; negative value -> round down
  return roundBy > 0
    ? Math.ceil(value / step) * step
    : Math.floor(value / step) * step;
}

function removeEndWord(label: string) {
  const parts = label.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(0, -1).join(' ') : label;
}

// Class for actual panel being displayed
export const SimplePanel: React.FC<Props> = ({ data, width, height }) => {
  // get color values and such from Grafana
  const theme = useTheme2();

  const chartRef = useRef<ReactECharts>(null);

  const importViewInputRef = useRef<HTMLInputElement>(null);

  const downloadTextFile = useCallback((filename: string, content: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);
  }, []);

  const getChart = useCallback(() => {
    const inst = chartRef.current?.getEchartsInstance?.();
    // getDom() is the best “is it alive?” check
    if (!inst || !inst.getDom?.()) { return null; }
    return inst;
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const chart = getChart();
      chart?.resize?.();
    });
    return () => cancelAnimationFrame(id);
  }, [width, height, getChart]);

  // Data processing to usable eCharts info
  const { xValuesMs, allSeries } = useMemo(() => {

    // check if data actually exists
    const frame = data.series[0];
    if (!frame)
    {
      return { xValuesMs: [] as number[], allSeries: [] as SeriesData[], };
    }

    // check if time field (x-axis) actually exists
    const timeField = frame.fields.find((f) => f.type === FieldType.time);
    if (!timeField)
    {
      return { xValuesMs: [] as number[], allSeries: [] as SeriesData[], };
    }

    // convert time to ms time value
    const xValuesMs = timeField.values.toArray().map((v) => Number(v));

    // create series to store all parsed info
    const series: SeriesData[] = [];

    // color index to make each line a different color
    // set to 18 because theme2 starts using hex values on index 18
    // starting at 0 has some color values that don't work and accidentally interlink checkboxes / colors
    let colorIndex = LINE_COLOR_START_INDEX;

    // map all number and boolean fields to series data
    frame.fields.forEach((field) => {
      // skip over all non-number and non-boolean fields
      if (field.type === FieldType.time) { return; }
      if (field.type !== FieldType.number && field.type !== FieldType.boolean) { return; }

      // choose unit based off being boolean or number
      const isBool = field.type === FieldType.boolean;
      const unit = field.config?.unit || (isBool ? 'State' : 'PSI');

      // take frame values and turn into series data  
      const rawValues = field.values.toArray();
      const numericValues = rawValues.map((v) => {
        if (v === null || v === undefined) { return null; }
        // Grafana booleans often come through as true/false; Number(v) -> Number(true)=1, Number(false)=0
        return Number(v);
      });

      // add line data to series
      series.push({
        key: field.name,
        label: removeEndWord(field.name),
        unit,
        field,
        kind: isBool ? 'solenoid' : 'numeric',
        color: theme.visualization.palette[colorIndex++ % theme.visualization.palette.length], // cycle through all color options
        data: numericValues,
      });
    });

    return {
      xValuesMs,
      allSeries: series,
    };
  }, [data.series, theme]);

  // Add toggles / checkboxes
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});

  // start with every single graph item on
  useEffect(() => {
  setVisibleKeys((prev) => {
    const next = { ...prev };
    allSeries.forEach((s) => {
      if (next[s.key] === undefined) {
        next[s.key] = true;
      }
    });
    return next;
  });
  }, [allSeries]);

  // set each color to the proper channel
  useEffect(() => {
  setChannelColors((prev) => {
    const next = { ...prev };
    allSeries.forEach((s) => {
      if (next[s.key] === undefined) { next[s.key] = s.color; }
    });
    return next;
  });
  }, [allSeries]);

  // Per-channel color overrides
  const [channelColors, setChannelColors] = useState<Record<string, string>>({});

  // Stable axis model
  const [axes, setAxes] = useState<AxisConfig[]>([]);
  const [channelAxisMap, setChannelAxisMap] = useState<Record<string, string>>({});

  // graph line elipses menu
  const [openTraceMenuKey, setOpenTraceMenuKey] = useState<string | null>(null);

  const channelManagerRef = useRef<HTMLDivElement>(null);
  const traceMenuButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [traceMenuPos, setTraceMenuPos] = useState<{ top: number; left: number } | null>(null);

  const channelScrollAreaRef = useRef<HTMLDivElement>(null);
  const floatingTraceMenuRef = useRef<HTMLDivElement>(null);

  const axisManagerRef = useRef<HTMLDivElement>(null);
  const axisScrollAreaRef = useRef<HTMLDivElement>(null);
  const axisMenuButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const floatingAxisMenuRef = useRef<HTMLDivElement>(null);

  const [openAxisMenuId, setOpenAxisMenuId] = useState<string | null>(null);
  const [axisMenuPos, setAxisMenuPos] = useState<{ top: number; left: number } | null>(null);

  // helper: effective color for a series (override if present)
  const getSeriesColor = useCallback(
    (key: string, fallback: string) => channelColors[key] ?? fallback,
    [channelColors]
  );

  // Build default axes and channel->axis mapping for numeric channels
  useEffect(() => {
    const numericSeries = allSeries.filter((s) => s.kind === 'numeric');

    setChannelAxisMap((prev) => {
      const next: Record<string, string> = {};

      numericSeries.forEach((s) => {
        const existingAxis = prev[s.key];
        next[s.key] = existingAxis || `axis_${s.key}`;
      });

      return next;
    });

    setAxes((prevAxes) => {
      const usedAxisIds = new Set(
        numericSeries.map((s) => `axis_${s.key}`)
      );

      const cleanedAxes = prevAxes.filter((axis) => {
        if (axis.id.startsWith('axis_custom_')) {
          return true;
        }

        return usedAxisIds.has(axis.id);
      });

      const existingIds = new Set(cleanedAxes.map((a) => a.id));

      const newAxes: AxisConfig[] = numericSeries
        .filter((s) => !existingIds.has(`axis_${s.key}`))
        .map((s, i) => ({
          id: `axis_${s.key}`,
          name: s.label,
          side: (i % 2 === 0 ? 'left' : 'right') as 'left' | 'right',
          minMode: 'auto',
          maxMode: 'auto',
        }));

      return [...cleanedAxes, ...newAxes];
    });
  }, [allSeries]);

  // export current view configuration as json
  const handleExportViewJson = useCallback(() => {
    const viewConfig = {
      visibleKeys,
      channelColors,
      axes,
      channelAxisMap,
    };

    downloadTextFile(
      'purpl-view.json',
      JSON.stringify(viewConfig, null, 2),
      'application/json'
    );
  }, [visibleKeys, channelColors, axes, channelAxisMap, downloadTextFile]);

  // import current view configuration from json
  const handleImportViewJson = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) {
        return;
      }

      try {
        const text = await file.text();
        const parsed = JSON.parse(text);

        if (parsed.visibleKeys && typeof parsed.visibleKeys === 'object') {
          setVisibleKeys((prev) => ({ ...prev, ...parsed.visibleKeys }));
        }

        if (parsed.channelColors && typeof parsed.channelColors === 'object') {
          setChannelColors((prev) => ({ ...prev, ...parsed.channelColors }));
        }

        if (Array.isArray(parsed.axes)) {
          setAxes(parsed.axes);
        }

        if (parsed.channelAxisMap && typeof parsed.channelAxisMap === 'object') {
          setChannelAxisMap((prev) => ({ ...prev, ...parsed.channelAxisMap }));
        }
      } catch (err) {
        console.error('Failed to import view json:', err);
      } finally {
        e.target.value = '';
      }
    },
    []
  );

  // export currently plotted data as csv
  const handleExportPlottedCsv = useCallback(() => {
    const activeSeries = allSeries.filter((s) => visibleKeys[s.key]);

    const header = ['timestamp', ...activeSeries.map((s) => s.key)];
    const rows: string[] = [header.join(',')];

    for (let i = 0; i < xValuesMs.length; i++) {
      const row: string[] = [new Date(xValuesMs[i]).toISOString()];

      activeSeries.forEach((s) => {
        const value = s.data[i];
        row.push(value == null ? '' : String(value));
      });

      rows.push(row.join(','));
    }

    downloadTextFile('purpl-plotted-data.csv', rows.join('\n'), 'text/csv');
  }, [allSeries, visibleKeys, xValuesMs, downloadTextFile]);

  const handleAddAxis = useCallback(() => {
    setAxes((prev) => [
      ...prev,
      {
        id: `axis_custom_${Date.now()}`,
        name: `Axis ${prev.length + 1}`,
        side: 'left',
        minMode: 'auto',
        maxMode: 'auto',
      },
    ]);
  }, []);

  const handleDeleteAxis = useCallback((axisId: string) => {
    setAxes((prevAxes) => {
      if (prevAxes.length <= 1) {
        return prevAxes;
      }

      const remainingAxes = prevAxes.filter((a) => a.id !== axisId);
      const fallbackAxis = remainingAxes[0]?.id;

      setChannelAxisMap((prevMap) => {
        if (!fallbackAxis) {
          return prevMap;
        }

        const next = { ...prevMap };
        Object.keys(next).forEach((key) => {
          if (next[key] === axisId) {
            next[key] = fallbackAxis;
          }
        });
        return next;
      });

      return remainingAxes;
    });
  }, []);

  const handleRenameAxis = useCallback((axisId: string, name: string) => {
    setAxes((prev) =>
      prev.map((a) => (a.id === axisId ? { ...a, name } : a))
    );
  }, []);

  const handleSwitchAxisSide = useCallback((axisId: string, side: 'left' | 'right') => {
    setAxes((prev) =>
      prev.map((a) => (a.id === axisId ? { ...a, side } : a))
    );
  }, []);

  const handleAxisMinMode = useCallback((axisId: string, minMode: 'auto' | 'manual') => {
    setAxes((prev) =>
      prev.map((a) => (a.id === axisId ? { ...a, minMode } : a))
    );
  }, []);

  const handleAxisMaxMode = useCallback((axisId: string, maxMode: 'auto' | 'manual') => {
    setAxes((prev) =>
      prev.map((a) => (a.id === axisId ? { ...a, maxMode } : a))
    );
  }, []);

  const handleAxisMinValue = useCallback((axisId: string, min?: number) => {
    setAxes((prev) =>
      prev.map((a) => (a.id === axisId ? { ...a, min } : a))
    );
  }, []);

  const handleAxisMaxValue = useCallback((axisId: string, max?: number) => {
    setAxes((prev) =>
      prev.map((a) => (a.id === axisId ? { ...a, max } : a))
    );
  }, []);

  const toggleTraceMenu = useCallback((key: string) => {
    const btn = traceMenuButtonRefs.current[key];
    const body = channelManagerRef.current;
    const scrollArea = channelScrollAreaRef.current;

    if (!btn || !body || !scrollArea) {
      setOpenTraceMenuKey((prev) => (prev === key ? null : key));
      setTraceMenuPos(null);
      return;
    }

    if (openTraceMenuKey === key) {
      setOpenTraceMenuKey(null);
      setTraceMenuPos(null);
      return;
    }

    const btnRect = btn.getBoundingClientRect();
    const scrollRect = scrollArea.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();

    // button position inside the scrolling content area
    const buttonTopInScrollContent = btnRect.top - scrollRect.top + scrollArea.scrollTop;
    const buttonLeftInBody = btnRect.left - bodyRect.left;

    // convert scroll-content position back into body's visible coordinate system
    const visibleTopInBody = buttonTopInScrollContent - scrollArea.scrollTop;

    const estimatedMenuWidth = 170;
    const estimatedMenuHeight = 130;
    const gap = 6;

    let left = buttonLeftInBody - estimatedMenuWidth + btnRect.width;
    let top = visibleTopInBody + btnRect.height + gap;

    // keep menu inside body horizontally
    left = Math.max(8, Math.min(left, body.clientWidth - estimatedMenuWidth - 8));

    // flip upward if it would overflow below
    if (top + estimatedMenuHeight > body.clientHeight - 8) {
      top = visibleTopInBody - estimatedMenuHeight - gap;
    }

    // clamp top so it always stays visible
    top = Math.max(8, top);

    setTraceMenuPos({ top, left });
    setOpenTraceMenuKey(key);
  }, [openTraceMenuKey]);

  useEffect(() => {
    if (!openTraceMenuKey || !traceMenuPos) {
      return;
    }

    const btn = traceMenuButtonRefs.current[openTraceMenuKey];
    const body = channelManagerRef.current;
    const scrollArea = channelScrollAreaRef.current;
    const menu = floatingTraceMenuRef.current;

    if (!btn || !body || !scrollArea || !menu) {
      return;
    }

    const btnRect = btn.getBoundingClientRect();
    const scrollRect = scrollArea.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();

    const buttonTopInScrollContent = btnRect.top - scrollRect.top + scrollArea.scrollTop;
    const buttonLeftInBody = btnRect.left - bodyRect.left;
    const visibleTopInBody = buttonTopInScrollContent - scrollArea.scrollTop;

    const gap = 6;
    const menuWidth = menu.offsetWidth;
    const menuHeight = menu.offsetHeight;

    let left = buttonLeftInBody - menuWidth + btnRect.width;
    let top = visibleTopInBody + btnRect.height + gap;

    left = Math.max(8, Math.min(left, body.clientWidth - menuWidth - 8));

    if (top + menuHeight > body.clientHeight - 8) {
      top = visibleTopInBody - menuHeight - gap;
    }

    top = Math.max(8, top);

    setTraceMenuPos({ top, left });
  }, [openTraceMenuKey, traceMenuPos]);

  useEffect(() => {
    if (!openTraceMenuKey) {
      return;
    }

    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const container = channelManagerRef.current;
      if (!container) {
        return;
      }

      if (!container.contains(target)) {
        setOpenTraceMenuKey(null);
        setTraceMenuPos(null);
      }
    };

    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [openTraceMenuKey]);

  useEffect(() => {
    const scrollArea = channelScrollAreaRef.current;
    if (!scrollArea) {
      return;
    }

    const handleScroll = () => {
      setOpenTraceMenuKey(null);
      setTraceMenuPos(null);
    };

    scrollArea.addEventListener('scroll', handleScroll);
    return () => scrollArea.removeEventListener('scroll', handleScroll);
  }, []);

  const getAssignedSeriesForAxis = (axisId: string) =>
    allSeries.filter((s) => s.kind === 'numeric' && channelAxisMap[s.key] === axisId);

    const toggleAxisMenu = useCallback((axisId: string) => {
    const btn = axisMenuButtonRefs.current[axisId];
    const body = axisManagerRef.current;
    const scrollArea = axisScrollAreaRef.current;

    if (!btn || !body || !scrollArea) {
      setOpenAxisMenuId((prev) => (prev === axisId ? null : axisId));
      setAxisMenuPos(null);
      return;
    }

    if (openAxisMenuId === axisId) {
      setOpenAxisMenuId(null);
      setAxisMenuPos(null);
      return;
    }

    const btnRect = btn.getBoundingClientRect();
    const scrollRect = scrollArea.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();

    const buttonTopInScrollContent = btnRect.top - scrollRect.top + scrollArea.scrollTop;
    const buttonLeftInBody = btnRect.left - bodyRect.left;
    const visibleTopInBody = buttonTopInScrollContent - scrollArea.scrollTop;

    const estimatedMenuWidth = 180;
    const estimatedMenuHeight = 210;
    const gap = 6;

    let left = buttonLeftInBody - estimatedMenuWidth + btnRect.width;
    let top = visibleTopInBody + btnRect.height + gap;

    left = Math.max(8, Math.min(left, body.clientWidth - estimatedMenuWidth - 8));

    if (top + estimatedMenuHeight > body.clientHeight - 8) {
      top = visibleTopInBody - estimatedMenuHeight - gap;
    }

    top = Math.max(8, top);

    setAxisMenuPos({ top, left });
    setOpenAxisMenuId(axisId);
  }, [openAxisMenuId]);

  useEffect(() => {
    if (!openAxisMenuId || !axisMenuPos) {
      return;
    }

    const btn = axisMenuButtonRefs.current[openAxisMenuId];
    const body = axisManagerRef.current;
    const scrollArea = axisScrollAreaRef.current;
    const menu = floatingAxisMenuRef.current;

    if (!btn || !body || !scrollArea || !menu) {
      return;
    }

    const btnRect = btn.getBoundingClientRect();
    const scrollRect = scrollArea.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();

    const buttonTopInScrollContent = btnRect.top - scrollRect.top + scrollArea.scrollTop;
    const buttonLeftInBody = btnRect.left - bodyRect.left;
    const visibleTopInBody = buttonTopInScrollContent - scrollArea.scrollTop;

    const gap = 6;
    const menuWidth = menu.offsetWidth;
    const menuHeight = menu.offsetHeight;

    let left = buttonLeftInBody - menuWidth + btnRect.width;
    let top = visibleTopInBody + btnRect.height + gap;

    left = Math.max(8, Math.min(left, body.clientWidth - menuWidth - 8));

    if (top + menuHeight > body.clientHeight - 8) {
      top = visibleTopInBody - menuHeight - gap;
    }

    top = Math.max(8, top);

    setAxisMenuPos({ top, left });
  }, [openAxisMenuId, axisMenuPos]);

  useEffect(() => {
    if (!openAxisMenuId) {
      return;
    }

    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const container = axisManagerRef.current;
      if (!container) {
        return;
      }

      if (!container.contains(target)) {
        setOpenAxisMenuId(null);
        setAxisMenuPos(null);
      }
    };

    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [openAxisMenuId]);

  useEffect(() => {
    const scrollArea = axisScrollAreaRef.current;
    if (!scrollArea) {
      return;
    }

    const handleScroll = () => {
      setOpenAxisMenuId(null);
      setAxisMenuPos(null);
    };

    scrollArea.addEventListener('scroll', handleScroll);
    return () => scrollArea.removeEventListener('scroll', handleScroll);
  }, []);

  // --- 3) Build ECharts option ---
  const option = useMemo(() => {
    const activeSeries = allSeries.filter((s) => visibleKeys[s.key]);
    const numericActive = activeSeries.filter((s) => s.kind === 'numeric');
    const solenoidActive = activeSeries.filter((s) => s.kind === 'solenoid');

    // create y-axis config
        // Active numeric axes are the axes referenced by visible numeric channels
    const activeAxisIds = Array.from(
      new Set(
        numericActive
          .map((s) => channelAxisMap[s.key])
          .filter((id): id is string => !!id)
      )
    );

    const activeAxes = activeAxisIds
      .map((id) => axes.find((a) => a.id === id))
      .filter((a): a is AxisConfig => !!a);

    const axisIdToIndex = new Map<string, number>();
    activeAxes.forEach((axis, i) => {
      axisIdToIndex.set(axis.id, i);
    });

    const yAxis = activeAxes.map((axis, i) => {
      const position = axis.side;
      const sameSideIndex = activeAxes
        .slice(0, i)
        .filter((a) => a.side === axis.side).length;
      const nameLocation = sameSideIndex % 2 === 1 ? 'start' : 'end';
      const offset = sameSideIndex * LINE_AXIS_SPACING;

      // all visible numeric series assigned to this axis
      const assignedSeries = numericActive.filter((s) => channelAxisMap[s.key] === axis.id);

      const values = assignedSeries.flatMap((s) =>
        s.data.filter((v): v is number => v != null)
      );

      const min = values.length ? Math.min(...values) : 0;
      const max = values.length ? Math.max(...values) : 1;

      const safeMin = min === max ? min - 1 : min;
      const safeMax = min === max ? max + 1 : max;

      const axisMin =
        axis.minMode === 'manual' && axis.min !== undefined
          ? axis.min
          : roundBy({ value: safeMin, roundBy: -GRAPH_VERTICAL_PADDING });

      const axisMax =
        axis.maxMode === 'manual' && axis.max !== undefined
          ? axis.max
          : roundBy({ value: safeMax, roundBy: GRAPH_VERTICAL_PADDING });

      let finalMin = axisMin;
      let finalMax = axisMax;

      if (finalMin === finalMax) {
        finalMin -= 1;
        finalMax += 1;
      }

      if (finalMin > finalMax) {
        [finalMin, finalMax] = [finalMax, finalMin];
      }

      // pick a representative color from the first assigned series
      const representativeSeries = assignedSeries[0];
      const axisColor = representativeSeries
        ? getSeriesColor(representativeSeries.key, representativeSeries.color)
        : theme.colors.text.primary;

      return {
        type: 'value',
        min: finalMin,
        max: finalMax,
        name: axis.name,
        nameLocation,
        position,
        offset,
        splitLine: { show: i === 0 },
        axisLine: { show: true, lineStyle: { color: axisColor } },
        axisLabel: { color: '#fff' },
        nameTextStyle: {
          align: 'center',
          color: '#fff',
        },
      };
    });

    // If there are no numeric axes, create a dummy y-axis so solenoid markLines
    // (which use yAxisIndex: 0) always have a valid axis to attach to.
    const yAxisFinal = yAxis.length
      ? yAxis
      : [
          {
            type: 'value',
            min: 0,
            max: 1,
            axisLabel: { show: false },
            axisLine: { show: false },
            splitLine: { show: false },
          },
        ];

    // Numeric line series
    const echartsSeries: any[] = numericActive.map((s) => {
      const yAxisIndex = axisIdToIndex.get(channelAxisMap[s.key]) ?? 0;

      const points = xValuesMs.map((t, idx) => {
        const v = s.data[idx];
        return v === null ? [t, null] : [t, v];
      });

      return {
        name: s.label,
        type: 'line',   
        yAxisIndex,
        showSymbol: false,
        lineStyle: { width: LINE_WIDTH, color: getSeriesColor(s.key, s.color) },
        itemStyle: { color: getSeriesColor(s.key, s.color) },
        data: points,
      };
    });

    // Solenoid OFF events: True(1) -> False(0)
    // We render them as markLines on a hidden helper series, so they show up regardless of numeric lines.
    // Build markLine helper series (one per solenoid)
    const solenoidSeries: any[] = solenoidActive.map((sol, solIdx) => {
      const markLines: any[] = [];

      for (let i = 1; i < sol.data.length; i++) {
        const prev = sol.data[i - 1];
        const curr = sol.data[i];

        if (prev === curr) { continue; }

        const isRising = prev === 0 && curr === 1;
        markLines.push({
          xAxis: xValuesMs[i],
          lineStyle: {
            color: echarts.color.lift(
              getSeriesColor(sol.key, sol.color),
              isRising ? SOLENOID_MARKER_TRUE_LIFT : SOLENOID_MARKER_FALSE_LIFT
            ),
            width: 2,
            type: isRising ? SOLENOID_MARKER_TRUE_LINE_STYLE : SOLENOID_MARKER_FALSE_LINE_STYLE,
          },
          label: { show: false },
        });
      }

      // IMPORTANT: keep it on the same x-axis and some y-axis that exists
      // If you have numeric axes, pin to yAxisIndex 0. If none exist, create a dummy yAxis (see below).
      const yAxisIndex = 0;

      return {
        name: sol.label,
        type: 'line',
        xAxisIndex: 0,
        yAxisIndex,
        // hide the actual line; we only want markLines
        data: [],
        showSymbol: false,
        lineStyle: { opacity: 1, type: 'dashed', color: getSeriesColor(sol.key, sol.color) },
        itemStyle: { opacity: 0 },
        tooltip: { show: false },
        legendHoverLink: false,
        silent: true,
        markLine: {
          symbol: 'none',
          data: markLines,
        },
      };
    });

    echartsSeries.push(...solenoidSeries);

    const leftAxisCount = activeAxes.filter((a) => a.side === 'left').length;
    const rightAxisCount = activeAxes.filter((a) => a.side === 'right').length;

    const gridLeft = 48 + Math.max(0, leftAxisCount - 1) * 18;
    const gridRight = 48 + Math.max(0, rightAxisCount - 1) * 18;

    const xMin = xValuesMs.length ? Math.min(...xValuesMs) : undefined;
    const xMax = xValuesMs.length ? Math.max(...xValuesMs) : undefined;
    const xStart = xMin ?? 0;

    return {
      backgroundColor: 'transparent',
      animation: false,
      animationDurationUpdate: 0,
      animationEasingUpdate: 'linear',
      grid: {
        left: gridLeft,
        right: gridRight,
        top: 36,
        bottom: 54,
        containLabel: true,
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        formatter: (params: any) => {
          if (!params || params.length === 0) {
            return '';
          }

          const rawX = Array.isArray(params[0].value)
            ? params[0].value[0]
            : params[0].axisValue;

          const elapsed = Number(rawX) - xStart;

          const totalSeconds = Math.floor(elapsed / 1000);
          const ms = Math.floor(elapsed % 1000);

          const timeStr = `${totalSeconds
            .toString()
            .padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;

          const lines = [timeStr];

          params.forEach((p: any) => {
            const y = Array.isArray(p.value) ? p.value[1] : p.value;
            if (y !== null && y !== undefined) {
              lines.push(`${p.marker} ${p.seriesName}: ${y}`);
            }
          });

          return lines.join('<br/>');
        },
      },
      legend: {
        show: false
      },
      xAxis: {
        type: 'time',
        min: xMin,
        max: xMax,
        boundaryGap: false,
        axisLine: { lineStyle: { color: theme.colors.text.secondary } },
        axisLabel: {
          color: theme.colors.text.secondary,
          formatter: (value: number) => {
            const elapsed = value - xStart;

            const totalSeconds = Math.floor(elapsed / 1000);
            const ms = Math.floor(elapsed % 1000);

            const s = totalSeconds.toString().padStart(2, '0');

            return `${s}.${ms.toString().padStart(3, '0')}`;
          },
        },
        splitLine: { show: true, lineStyle: { color: theme.colors.border.weak } },
      },
      yAxis: yAxisFinal,
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: 0
        },
        {
          type: 'slider',
          xAxisIndex: 0,
          height: 20,
          bottom: 10,
          left: gridLeft,
          right: gridRight,
          fillerColor: 'rgba(111, 0, 255, 0.3)',
          borderColor: 'rgba(199, 178, 237, 1)',
          moveHandleStyle: {
            color: 'rgb(147, 76, 255)',
          },
        }
      ],
      series: echartsSeries,
    };
  }, [allSeries, visibleKeys, xValuesMs, theme, getSeriesColor, axes, channelAxisMap]);

  // --- 4) Styles & Layout ---
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  const TOPBAR_H = 44;
  const SIDEBAR_W = 230;

  const styles = {
    root: css`
      height: 100%;
      width: 100%;
      display: grid;

      /* 3 columns: left | center | right */
      grid-template-columns: ${leftOpen ? `${SIDEBAR_W}px` : `0px`} 1fr ${rightOpen ? `${SIDEBAR_W}px` : `0px`};
      /* 2 rows: topbar | content */
      grid-template-rows: ${TOPBAR_H}px 1fr;

      background: transparent;
      overflow: hidden;
    `,

    // Top bar spans all columns
    topbar: css`
      grid-column: 1 / 4;
      grid-row: 1 / 2;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 10px;

      background: ${theme.colors.background.secondary};
      border-bottom: 1px solid ${theme.colors.border.weak};
      overflow: hidden;
      min-width: 0;
    `,

    topbarLeft: css`
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    `,

    topbarCenter: css`
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      flex: 1;
      min-width: 0;
    `,

    topbarRight: css`
      display: flex;
      align-items: center;
      gap: 8px;
    `,

    // Side panels (left/right)
    sidebar: css`
      grid-row: 2 / 3;
      background: ${theme.colors.background.secondary};
      overflow: auto;
      min-height: 0;
    `,

    leftSidebar: css`
      grid-column: 1 / 2;
      border-right: 1px solid ${theme.colors.border.weak};
    `,

    rightSidebar: css`
      grid-column: 3 / 4;
      border-left: 1px solid ${theme.colors.border.weak};
    `,

    sidebarInner: css`
      height: 100%;
      min-height: 0;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      box-sizing: border-box;
    `,

    sidebarTitle: css`
      font-size: 12px;
      font-weight: 600;
      color: ${theme.colors.text.primary};
      opacity: 0.9;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    `,

    // Center chart cell
    chartCell: css`
      grid-column: 2 / 3;
      grid-row: 2 / 3;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      position: relative;
    `,

    channelContainer: css`
      flex: 1 1 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 10px;
      border-radius: 14px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.75);
      box-sizing: border-box;
      overflow: hidden;
      height: 100%;
    `,

    lineList: css`
      flex-grow: 5;
    `,

    exportImport: css`
      flex-grow: 4;
    `,

    exportButtons: css`
      flex: 1 1 auto;
      flex-grow: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
      justify-content: space-around;
    `,

    channelActions: css`
      display: flex;
      gap: 6px;
      flex-wrap: nowrap;
      flex: 0 0 auto; /* critical: never grows */
      width: 100%;
    `,

    channelList: css`
      display: flex;
      flex-direction: column;
    `,

    channelScrollArea: css`
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding-right: 4px;
    `,

    // A small “ghost” button style for topbar toggles
    ghostBtn: css`
      border: 1px solid ${theme.colors.border.weak};
      background: transparent;
      color: ${theme.colors.text.primary};
      border-radius: 6px;
      padding: 4px 6px;
      font-size: 11px;
      cursor: pointer;
      flex: 1 1 0;
      min-width: 0;
      white-space: nowrap;

      &:hover {
        background: ${theme.colors.action.hover};
      }

      &:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
    `,

    title: css`
      font-size: 12px;
      color: ${theme.colors.text.primary};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 220px;
      opacity: 0.9;

    `,

    topbarLogo: css`
      height: 100%;
      width: auto;
      display: block;
      object-fit: contain;
    `,

    hint: css`
      font-size: 11px;
      color: ${theme.colors.text.secondary};
      opacity: 0.85;
    `,

    channelRow: css`
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 6px;
      border-radius: 6px;

      &:hover {
        background: ${theme.colors.action.hover};
      }
    `,

    channelDot: (color: string) => css`
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: ${color};
      flex: 0 0 auto;
    `,

    channelMarkerWrap: css`
      width: 12px;
      height: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
    `,

    solenoidMarker: (color: string) => css`
      width: 2px;
      height: 12px;
      border-radius: 1px;
      background: ${color};
      opacity: 0.95;

      /* dashed look */
      background: repeating-linear-gradient(
        to bottom,
        ${color},
        ${color} 2px,
        transparent 2px,
        transparent 4px
      );
    `,

    channelLabel: css`
      flex: 1;
      min-width: 0;
      font-size: 12px;
      color: ${theme.colors.text.primary};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: center;
    `,

    channelMeta: css`
      font-size: 11px;
      color: ${theme.colors.text.secondary};
      opacity: 0.85;
      white-space: nowrap;
    `,
    
    channelToggle: css`
      cursor: pointer;
      user-select: none;
    `,

    traceMenuButton: css`
      border: 1px solid ${theme.colors.border.weak};
      background: transparent;
      color: ${theme.colors.text.primary};
      border-radius: 6px;
      width: 24px;
      height: 24px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;

      &:hover {
        background: ${theme.colors.action.hover};
      }
    `,

    traceMenu: css`
      width: 100%;
      margin-top: 6px;
      padding: 8px;
      border: 1px solid rgba(255, 255, 255, 0.6);
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.04);
      display: flex;
      flex-direction: column;
      gap: 8px;
    `,

    traceMenuRow: css`
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    `,

    traceMenuContent: css`
      width: 100%;
      display: flex;
      justify-content: center;
    `,

    traceMenuLabel: css`
      font-size: 11px;
      color: ${theme.colors.text.secondary};
      text-wrap: nowrap;
    `,

    axisSelect: css`
      height: 100%;
      min-height: 26px;
      width: 100%;
      font-size: 11px;
      border-radius: 6px;

      text-align: center;

      border: 1px solid ${theme.colors.border.weak};

      background: transparent;
      color: ${theme.colors.text.primary};

      line-height: 100%;

      padding: 0 6px;
      box-sizing: border-box;

      appearance: none;
      cursor: pointer;

      background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='white' stroke-width='1.5' fill='none'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 6px center;

      &:hover {
        border-color: ${theme.colors.border.medium};
      }
    `,

    axisRow: css`
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    `,

    axisSmallInput: css`
      height: 26px;
      width: 48px;
      font-size: 11px;

      text-align: center;

      border-radius: 6px;
      border: 1px solid ${theme.colors.border.weak};

      background: transparent;
      color: ${theme.colors.text.primary};

      padding: 0 6px;
      box-sizing: border-box;
    `,

    axisScrollArea: css`
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      padding-right: 4px;
    `,

    colorInput: css`
      height: 24px;
      width: 95%;
      margin-left: 4%;
      border: none;
      padding: 0;
      background: transparent;
      cursor: pointer;

      &::-webkit-color-swatch-wrapper {
        padding: 0;
      }

      &::-webkit-color-swatch {
        border: none;
        border-radius: 4px;
      }
    `,

    assignedTraceList: css`
      display: flex;
      flex-direction: column;
      gap: 4px;
    `,

    assignedTraceItem: css`
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      font-size: 11px;
      color: ${theme.colors.text.secondary};
      padding: 3px 6px;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.03);
    `,

    assignedTraceDot: (color: string) => css`
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: ${color};
      flex: 0 0 auto;
    `,

    assignedTraceLabel: css`
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `,

    channelManagerBody: css`
      position: relative;
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
    `,

    floatingTraceMenu: css`
      position: absolute;
      z-index: 20;
      width: 170px;
      padding: 8px;
      border: 1px solid rgba(255, 255, 255, 0.6);
      border-radius: 10px;
      background: ${theme.colors.background.secondary};
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
      display: flex;
      flex-direction: column;
      gap: 8px;
    `,

    axisList: css`
      display: flex;
      flex-direction: column;
      gap: 6px;
    `,

    axisDeleteBtn: css`
      border: 1px solid ${theme.colors.border.weak};
      background: transparent;
      color: ${theme.colors.text.primary};
      border-radius: 6px;
      width: 22px;
      height: 22px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
      font-size: 12px;
      line-height: 1;

      &:hover {
        background: ${theme.colors.action.hover};
      }

      &:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
    `,

    axisMarkerWrap: css`
      width: 12px;
      height: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
    `,

    axisMarker: (color?: string, side?: 'left' | 'right') => css`
      width: 10px;
      height: 10px;
      border-radius: 2px;
      border: 1px solid rgba(255,255,255,0.75);
      background: ${color ?? (side === 'right' ? 'rgba(180,180,255,0.18)' : 'rgba(255,255,255,0.18)')};
      opacity: 0.95;
    `,

    axisLabel: css`
      flex: 1;
      min-width: 0;
      font-size: 12px;
      color: ${theme.colors.text.primary};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `,

    axisMeta: css`
      font-size: 11px;
      color: ${theme.colors.text.secondary};
      white-space: nowrap;
    `,

    axisMenu: css`
      width: 100%;
      margin-top: 6px;
      padding: 8px;
      border: 1px solid rgba(255, 255, 255, 0.6);
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.04);
      display: flex;
      flex-direction: column;
      gap: 8px;
    `,

    axisMenuRow: css`
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    `,

    axisMenuLabel: css`
      font-size: 11px;
      color: ${theme.colors.text.secondary};
      white-space: nowrap;
    `,

    axisMenuContent: css`
      width: 100%;
      display: flex;
      justify-content: center;
    `,

    axisNameInput: css`
      width: 100%;
      height: 26px;
      font-size: 11px;
      text-align: center;
      border-radius: 6px;
      border: 1px solid ${theme.colors.border.weak};
      background: transparent;
      color: ${theme.colors.text.primary};
      padding: 0 6px;
      box-sizing: border-box;
    `,

    axisManagerBody: css`
      position: relative;
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
    `,

    floatingAxisMenu: css`
      position: absolute;
      z-index: 20;
      width: 180px;
      padding: 8px;
      border: 1px solid rgba(255, 255, 255, 0.6);
      border-radius: 10px;
      background: ${theme.colors.background.secondary};
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
      display: flex;
      flex-direction: column;
      gap: 8px;
    `,
  };

  return (
    <div className={styles.root}>
      {/* TOP BAR */}
      <div className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <button className={styles.ghostBtn} onClick={() => setLeftOpen((v) => !v)}>
            {leftOpen ? 'Hide channels' : 'Show channels'}
          </button>
        </div>

        <div className={styles.topbarCenter}>
          {/* big PURPL scg title */}
          <img src={LogoSvg} alt="Logo" className={styles.topbarLogo} />
        </div>

        <div className={styles.topbarRight}>
          <button className={styles.ghostBtn} onClick={() => setRightOpen((v) => !v)}>
            {rightOpen ? 'Hide axes' : 'Show axes'}
          </button>
        </div>
      </div>

      {/* LEFT SIDEBAR */}
      {leftOpen && (
        <div className={`${styles.sidebar} ${styles.leftSidebar}`}>
          <div className={styles.sidebarInner}>
            {/* CHANNEL MANAGER */}
            <div className={`${styles.channelContainer} ${styles.lineList}`} ref={channelManagerRef}>
              {/* Title for channel manager on left sidebar*/}
              <div className={styles.sidebarTitle}>
                <span>Channel manager</span>
                {<span className={styles.hint}>{allSeries.length} Sensors</span>}
              </div>

              <div className={styles.channelManagerBody}>
                <div className={styles.channelScrollArea} ref={channelScrollAreaRef}>
                  {/* Quick action buttons on top of left list */}
                  <div className={styles.channelActions} style={{ justifyContent: 'space-around' }}>
                    {/* Turn all lines on */}
                    <button
                      className={styles.ghostBtn}
                      onClick={() => {
                        setVisibleKeys((prev) => {
                          const next = { ...prev };
                          allSeries.forEach((s) => (next[s.key] = true));
                          return next;
                        });
                      }}
                    >
                      All on
                    </button>

                    {/* Turn all lines off */}
                    <button
                      className={styles.ghostBtn}
                      onClick={() => {
                        setVisibleKeys((prev) => {
                          const next = { ...prev };
                          allSeries.forEach((s) => (next[s.key] = false));
                          return next;
                        });
                      }}
                    >
                      All off
                    </button>

                    {/* Invert all lines (on->off, off->on) */}
                    <button
                      className={styles.ghostBtn}
                      onClick={() => {
                        setVisibleKeys((prev) => {
                          const next = { ...prev };
                          allSeries.forEach((s) => (next[s.key] = !prev[s.key]));
                          return next;
                        });
                      }}
                    >
                      Invert
                    </button>
                  </div>

                  {/* list of all graph lines on left channel */}
                  <div className={styles.channelList}>
                    {allSeries.map((s) => {
                      const on = !!visibleKeys[s.key];
                      const color = getSeriesColor(s.key, s.color);

                      return (
                        <div key={s.key}>
                          <div className={styles.channelRow}>
                            <input
                              className={styles.channelToggle}
                              type="checkbox"
                              checked={on}
                              onChange={(e) => {
                                const checked = e.currentTarget.checked;
                                setVisibleKeys((prev) => ({ ...prev, [s.key]: checked }));
                              }}
                            />

                            <span className={styles.channelMarkerWrap}>
                              {s.kind === 'solenoid' ? (
                                <span className={styles.solenoidMarker(color)} />
                              ) : (
                                <span className={styles.channelDot(color)} />
                              )}
                            </span>

                            <span className={styles.channelLabel} title={s.label}>
                              {s.label}
                            </span>

                            <button
                              ref={(el) => {
                                traceMenuButtonRefs.current[s.key] = el;
                              }}
                              className={styles.traceMenuButton}
                              onClick={() => toggleTraceMenu(s.key)}
                              title="Trace settings"
                            >
                              ...
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {openTraceMenuKey && traceMenuPos && (() => {
                    const s = allSeries.find((series) => series.key === openTraceMenuKey);
                    if (!s) {
                      return null;
                    }

                    const color = getSeriesColor(s.key, s.color);

                    return (
                      <div
                        ref={floatingTraceMenuRef}
                        className={styles.floatingTraceMenu}
                        style={{ top: traceMenuPos.top, left: traceMenuPos.left }}
                      >
                        <div className={styles.traceMenuRow}>
                          <span className={styles.traceMenuLabel}>Color</span>
                          <div className={styles.traceMenuContent}>
                            <input
                              type="color"
                              className={styles.colorInput}
                              value={color}
                              onChange={(e) => {
                                const v = e.currentTarget.value;
                                setChannelColors((prev) => ({ ...prev, [s.key]: v }));
                              }}
                            />
                          </div>
                        </div>

                        {s.kind === 'numeric' && (
                          <div className={styles.traceMenuRow}>
                            <span className={styles.traceMenuLabel}>Y-Axis</span>
                            <div className={styles.traceMenuContent}>
                              <select
                                className={styles.axisSelect}
                                value={channelAxisMap[s.key] ?? ''}
                                onChange={(e) => {
                                  const axisId = e.currentTarget.value;
                                  setChannelAxisMap((prev) => ({
                                    ...prev,
                                    [s.key]: axisId,
                                  }));
                                }}
                              >
                                {axes.map((axis) => (
                                  <option key={axis.id} value={axis.id}>
                                    {axis.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        )}

                        <div className={styles.traceMenuRow}>
                          <span className={styles.traceMenuLabel}>Type</span>
                          <div className={styles.traceMenuContent}>
                            <span className={styles.hint}>{s.kind === 'solenoid' ? 'State' : s.unit}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* EXPORT/IMPORT */}
            <div className={`${styles.channelContainer} ${styles.exportImport}`}>
              {/* Title for export/import on left sidebar*/}
              <div className={styles.sidebarTitle}>
                <span>Export/Import</span>
              </div>

              {/* Quick action buttons on top of left list */}
              <div className={styles.exportButtons}>
                {/* Export current viewing parameters (timeframe, selected lines, etc) */}
                <button
                  className={styles.ghostBtn}
                  onClick={handleExportViewJson}
                >
                  Export view json
                </button>

                {/* Import a file to replace current viewing parameters (timeframe, selected lines, etc) */}
                <button
                  className={styles.ghostBtn}
                  onClick={() => importViewInputRef.current?.click()}
                >
                  Import view json
                </button>

                {/* hidden file input for import */}
                <input
                  ref={importViewInputRef}
                  type="file"
                  accept="application/json,.json"
                  style={{ display: 'none' }}
                  onChange={handleImportViewJson}
                />

                {/* Export middle graph as csv content */}
                <button
                  className={styles.ghostBtn}
                  onClick={handleExportPlottedCsv}
                >
                  Export plotted csv
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CENTER CHART */}
      <div className={styles.chartCell}>
        <ReactECharts
          ref={chartRef}
          echarts={echarts}
          option={option}
          style={{ width: '100%', height: '100%' }}
          notMerge={true}
          lazyUpdate={true}
        />
      </div>

      {/* RIGHT SIDEBAR */}
      {rightOpen && (
        <div className={`${styles.sidebar} ${styles.rightSidebar}`}>
          <div className={styles.sidebarInner} ref={axisManagerRef}>
            <div className={styles.sidebarTitle}>
              <span>Y Axis manager</span>
              <button className={styles.ghostBtn} onClick={handleAddAxis}>
                Add axis
              </button>
            </div>

            <div className={styles.axisManagerBody}>
              <div className={styles.axisScrollArea} ref={axisScrollAreaRef}>
                <div className={styles.axisList}>
                  {axes.map((axis) => {
                    const assignedSeries = getAssignedSeriesForAxis(axis.id);

                    return (
                      <div key={axis.id}>
                        <div className={styles.axisRow}>
                          <button
                            className={styles.axisDeleteBtn}
                            disabled={axes.length <= 1}
                            onClick={() => {
                              if (openAxisMenuId === axis.id) {
                                setOpenAxisMenuId(null);
                                setAxisMenuPos(null);
                              }
                              handleDeleteAxis(axis.id);
                            }}
                            title="Delete axis"
                          >
                            ×
                          </button>

                          <span className={styles.axisMarkerWrap}>
                            <span
                              className={styles.axisMarker(
                                assignedSeries.length > 0
                                  ? getSeriesColor(assignedSeries[0].key, assignedSeries[0].color)
                                  : undefined,
                                axis.side
                              )}
                            />
                          </span>

                          <span className={styles.axisLabel} title={axis.name}>
                            {axis.name}
                          </span>

                          <span className={styles.axisMeta}>
                            {axis.side} · {assignedSeries.length}
                          </span>

                          <button
                            ref={(el) => {
                              axisMenuButtonRefs.current[axis.id] = el;
                            }}
                            className={styles.traceMenuButton}
                            onClick={() => toggleAxisMenu(axis.id)}
                            title="Axis settings"
                          >
                            ...
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {openAxisMenuId && axisMenuPos && (() => {
                const axis = axes.find((a) => a.id === openAxisMenuId);
                if (!axis) {
                  return null;
                }

                const assignedSeries = getAssignedSeriesForAxis(axis.id);

                return (
                  <div
                    ref={floatingAxisMenuRef}
                    className={styles.floatingAxisMenu}
                    style={{ top: axisMenuPos.top, left: axisMenuPos.left }}
                  >
                    <div className={styles.axisMenuRow}>
                      <span className={styles.axisMenuLabel}>Name</span>
                      <div className={styles.axisMenuContent}>
                        <input
                          className={styles.axisNameInput}
                          value={axis.name}
                          onChange={(e) => handleRenameAxis(axis.id, e.currentTarget.value)}
                          placeholder="Axis name"
                        />
                      </div>
                    </div>

                    <div className={styles.axisMenuRow}>
                      <span className={styles.axisMenuLabel}>Side</span>
                      <div className={styles.axisMenuContent}>
                        <select
                          className={styles.axisSelect}
                          value={axis.side}
                          onChange={(e) =>
                            handleSwitchAxisSide(axis.id, e.currentTarget.value as 'left' | 'right')
                          }
                        >
                          <option value="left">Left</option>
                          <option value="right">Right</option>
                        </select>
                      </div>
                    </div>

                    <div className={styles.axisMenuRow}>
                      <span className={styles.axisMenuLabel}>Min</span>
                      <div className={styles.axisMenuContent} style={{ gap: 8 }}>
                        <select
                          className={styles.axisSelect}
                          value={axis.minMode}
                          onChange={(e) =>
                            handleAxisMinMode(axis.id, e.currentTarget.value as 'auto' | 'manual')
                          }
                        >
                          <option value="auto">Auto</option>
                          <option value="manual">Manual</option>
                        </select>

                        <input
                          className={styles.axisSmallInput}
                          type="number"
                          value={axis.min ?? ''}
                          disabled={axis.minMode === 'auto'}
                          onChange={(e) =>
                            handleAxisMinValue(
                              axis.id,
                              e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value)
                            )
                          }
                        />
                      </div>
                    </div>

                    <div className={styles.axisMenuRow}>
                      <span className={styles.axisMenuLabel}>Max</span>
                      <div className={styles.axisMenuContent} style={{ gap: 8 }}>
                        <select
                          className={styles.axisSelect}
                          value={axis.maxMode}
                          onChange={(e) =>
                            handleAxisMaxMode(axis.id, e.currentTarget.value as 'auto' | 'manual')
                          }
                        >
                          <option value="auto">Auto</option>
                          <option value="manual">Manual</option>
                        </select>

                        <input
                          className={styles.axisSmallInput}
                          type="number"
                          value={axis.max ?? ''}
                          disabled={axis.maxMode === 'auto'}
                          onChange={(e) =>
                            handleAxisMaxValue(
                              axis.id,
                              e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value)
                            )
                          }
                        />
                      </div>
                    </div>

                    <div>
                      <div className={styles.hint} style={{ marginBottom: 6 }}>
                        Assigned traces ({assignedSeries.length})
                      </div>

                      <div className={styles.assignedTraceList}>
                        {assignedSeries.length > 0 ? (
                          assignedSeries.map((s) => {
                            const color = getSeriesColor(s.key, s.color);

                            return (
                              <div key={s.key} className={styles.assignedTraceItem}>
                                <span className={styles.assignedTraceDot(color)} />
                                <span className={styles.assignedTraceLabel} title={s.label}>
                                  {s.label}
                                </span>
                              </div>
                            );
                          })
                        ) : (
                          <div className={styles.hint}>No traces assigned</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

