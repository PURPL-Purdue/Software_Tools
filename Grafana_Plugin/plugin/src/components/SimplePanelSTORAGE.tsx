import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import { PanelProps, FieldType, Field } from '@grafana/data';
import { useTheme2 } from '@grafana/ui';
import { css } from '@emotion/css';
import { SimpleOptions } from 'types';

// preset constants about GUI so i don't have to search through this trash
const LINE_WIDTH = 3;
const GRAPH_VERTICAL_PADDING = 5;

const SOLENOID_MARKER_TRUE_LIFT = 0;
const SOLENOID_MARKER_FALSE_LIFT = 0;
const SOLENOID_MARKER_TRUE_LINE_STYLE = 'dashed';
const SOLENOID_MARKER_FALSE_LINE_STYLE = 'dotted';
const LINE_AXIS_SPACING = 48;

const debug=true;


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

function removeEndWord(label: string)
{
  return label.split(" ").slice(0,-1).join(" ");
}

// Class for actual panel being displayed
export const SimplePanel: React.FC<Props> = ({ data, width, height }) => {
  // get color values and such from Grafana
  const theme = useTheme2();

  const chartRef = useRef<ReactECharts>(null);

  const getChart = useCallback(() => {
    const inst = chartRef.current?.getEchartsInstance?.();
    // getDom() is the best “is it alive?” check
    if (!inst || !inst.getDom?.()) return null;
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
  const { xValuesMs, allSeries, uniqueUnits } = useMemo(() => {

    // check if data actually exists
    const frame = data.series[0];
    if (!frame)
    {
      if (debug) console.log("DEBUG: NO DATA");
      return { xValuesMs: [] as number[], allSeries: [] as SeriesData[], uniqueUnits: [] as string[] };
    }

    // check if time field (x-axis) actually exists
    const timeField = frame.fields.find((f) => f.type === FieldType.time);
    if (!timeField)
    {
      if (debug) console.log("DEBUG: NO TIME FIELD");
      return { xValuesMs: [] as number[], allSeries: [] as SeriesData[], uniqueUnits: [] as string[] };
    }

    // convert time to ms time value
    const xValuesMs = timeField.values.toArray().map((v) => Number(v));

    // create series to store all parsed info
    const series: SeriesData[] = [];
    const unitsSet = new Set<string>();

    // color index to make each line a different color
    // set to 18 because theme2 starts using hex values on index 18
    // starting at 0 has some color values that don't work and accidentally interlink checkboxes / colors
    let colorIndex = 18;

    // map all number and boolean fields to series data
    frame.fields.forEach((field) => {
      // skip over all non-number and non-boolean fields
      if (field.type === FieldType.time) return;
      if (field.type !== FieldType.number && field.type !== FieldType.boolean) return;

      // choose unit based off being boolean or number
      const isBool = field.type === FieldType.boolean;
      const unit = field.config?.unit || (isBool ? 'State' : 'PSI');

      // only add numeric units to unit set
      if (!isBool) unitsSet.add(unit);

      // take frame values and turn into series data  
      const rawValues = field.values.toArray();
      const numericValues = rawValues.map((v) => {
        if (v === null || v === undefined) return null;
        // Grafana booleans often come through as true/false; Number(true)=1, Number(false)=0
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
      uniqueUnits: Array.from(unitsSet),
    };
  }, [data.series, theme]);

  // Add toggles / checkboxes
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setVisibleKeys((prev) => {
      const next = { ...prev };
      allSeries.forEach((s) => {
        if (next[s.key] === undefined) next[s.key] = true;
      });
      return next;
    });
  }, [allSeries]);

  // --- 3) Build ECharts option ---
  const option = useMemo(() => {
    const activeSeries = allSeries.filter((s) => visibleKeys[s.key]);
    const numericActive = activeSeries.filter((s) => s.kind === 'numeric');
    const solenoidActive = activeSeries.filter((s) => s.kind === 'solenoid');

    // Map unit groups (all psi) -> yAxisIndex
    /*const unitToIndex = new Map<string, number>();
    uniqueUnits.forEach((u, idx) => unitToIndex.set(u, idx));

    // Build y-axes (one per unit), alternating sides, offset to avoid overlap
    const yAxis = uniqueUnits.map((unit, i) => {
      const position = i % 2 === 0 ? 'left' : 'right';
      const offset = Math.floor(i / 2) * 55; // spacing between stacked axes on the same side

      return {
        type: 'value',
        name: unit,
        position,
        offset,
        axisLine: { lineStyle: { color: theme.colors.text.primary } },
        axisLabel: { color: theme.colors.text.primary },
        nameTextStyle: { color: theme.colors.text.primary },
        splitLine: {
          // only show grid lines for the first axis to reduce clutter
          show: i === 0,
          lineStyle: { color: theme.colors.border.weak },
        },
      };
    });*/

    // create y-axis config
    const yAxis = numericActive.map((s, i) => {
      const position = i % 2 === 0 ? 'left' : 'right';
      const raiseLabel = i % 4 > 1; // if it is every third or fourth axis, raise the label a bit
      const offset = Math.floor(i / 2) * LINE_AXIS_SPACING;
      
      const values = s.data.filter((v): v is number => v != null);

      // If all values are null, fall back to a safe range
      const min = values.length ? Math.min(...values) : 0;
      const max = values.length ? Math.max(...values) : 1;

      const safeMin = min === max ? min - 1 : min;
      const safeMax = min === max ? max + 1 : max;

      return {
        type: 'value',
        min: roundBy({value: safeMin, roundBy: GRAPH_VERTICAL_PADDING}),
        max: roundBy({value: safeMax, roundBy: -GRAPH_VERTICAL_PADDING}),
        name: s.label,          // or `${s.label} (PSI)` if you want
        position,
        offset,
        splitLine: { show: i === 0 },
        axisLine: { show: true, lineStyle: { color: s.color } },
        axisLabel: { color: '#fff' },
        nameTextStyle: {
          padding: raiseLabel ? [0, 0, 20, 0] : [0, 0, 0, 0],
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
    const echartsSeries: any[] = numericActive.map((s, i) => {
      //const yAxisIndex = unitToIndex.get(s.unit) ?? 0;  used with mapping units in groups
      const yAxisIndex = i;

      const points = xValuesMs.map((t, idx) => {
        const v = s.data[idx];
        return v === null ? [t, null] : [t, v];
      });

      return {
        name: s.label,
        type: 'line',   
        yAxisIndex,
        showSymbol: false,
        lineStyle: { width: LINE_WIDTH, color: s.color },
        itemStyle: { color: s.color },
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

        if (prev === curr) continue;

        const isRising = prev === 0 && curr === 1;
        markLines.push({
          xAxis: xValuesMs[i],
          lineStyle: {
            color: echarts.color.lift(sol.color, isRising ? SOLENOID_MARKER_TRUE_LIFT : SOLENOID_MARKER_FALSE_LIFT),
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
        lineStyle: { opacity: 100, type: 'dashed', color: sol.color },
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


    /*// Attach solenoid markLines to the first numeric series (if it exists)
    if (echartsSeries.length > 0 && solenoidMarkLines.length > 0) {
      echartsSeries[0] = {
        ...echartsSeries[0],
        markLine: {
          symbol: 'none',
          data: solenoidMarkLines,
          silent: false, // prevents hover interference
        },
      };
    }

    console.log(echartsSeries);*/

    return {
      backgroundColor: 'transparent',
      animation: false,
      animationDurationUpdate: 0,
      animationEasingUpdate: 'linear',
      grid: {
        left: 60 + Math.floor((numericActive.length + 1) / 2) * LINE_AXIS_SPACING/3,
        right: 60 + Math.floor(numericActive.length / 2) * LINE_AXIS_SPACING/3,
        padding: ['20%', 0, 0, '5%'],
        height: '45%',
        containLabel: true,
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
      },
      legend: {
        show: true,
        width: '60%',
        top: '65%',
        height: '10%',
        textStyle: {
          color: '#fff'
        }
      },
      xAxis: {
        type: 'time',
        axisLine: { lineStyle: { color: theme.colors.text.secondary } },
        axisLabel: { color: theme.colors.text.secondary },
        splitLine: { show: true, lineStyle: { color: theme.colors.border.weak } },
      },
      yAxis: yAxisFinal,
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: 0
        },
        { // slider on bottom of screen 
          type: 'slider',
          xAxisIndex: 0,
          height:'7%',
          top: '90%',
          width: '40%',
          left: 'center',
          fillerColor: "rgba(111, 0, 255, 0.3)",
          borderColor: "rgba(199, 178, 237, 1)",
          moveHandleStyle: {
            color: "rgb(147, 76, 255)"
          }, 
        },
      ],
      series: echartsSeries,
    };
  }, [allSeries, visibleKeys, uniqueUnits, xValuesMs, theme]);

  if (debug) console.log(option); 

  // --- 4) Styles & Layout (keeps your existing UI layout) ---
  const styles = {
    container: css`
      display: flex;
      flex-direction: column;
      height: 100%;
      width: 100%;
    `,
    graphArea: css`
      flex-grow: 1;
      overflow: hidden;
      min-height: 0;
    `,
    controlsArea: css`
      height: 80px;
      padding: 10px;
      background: ${theme.colors.background.secondary};
      border-top: 1px solid ${theme.colors.border.weak};
      display: flex;
      flex-wrap: wrap;
      gap: 15px;
      overflow-y: auto;
    `,
    legendItem: css`
      display: flex;
      align-items: center;
      font-size: 12px;
      color: ${theme.colors.text.primary};
    `,
    colorDot: (color: string) => css`
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background-color: ${color};
      margin-right: 8px;
    `,
  };

  return (
    <div className={styles.container}>
      <div className={styles.graphArea}>
        <ReactECharts
          ref={chartRef}
          echarts={echarts}
          option={option}
          style={{ width, height: height - 80 }}
          notMerge={true}
          lazyUpdate={true}
        />
      </div>
    </div>
  );
};
