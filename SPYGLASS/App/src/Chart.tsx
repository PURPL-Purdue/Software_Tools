import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as Highcharts from 'highcharts'
import 'highcharts/modules/stock'
import { HighchartsReact } from 'highcharts-react-official'
import './Chart.css'
import { useData } from './useData'

// All the visual preferences for the chart theme
Highcharts.setOptions({
    // color options for chart
    palette: {
        // data series colors (lines)
        colors: [
            '#e32412',
            '#fadb8b',
            '#2364b9',
            '#059649',
            '#4A192C',
            '#A0522D',
            '#FF6347',
            '#9966CC',
            '#556B2F',
            '#87CEFA',
            '#F5DEB3',
            '#483D8B',
            '#DB7093',
            '#008B8B',
        ],
        // light mode color prefs
        light: {
            backgroundColor: '#f6f5f4',
            neutralColor: '#1b1918',
            highlightColor: '#e32412'
            // can add custom override colors here
        },
        // dark mode color prefs
        dark: {
            backgroundColor: '#1b1918',
            neutralColor: '#f6f5f4',
            highlightColor: '#fadb8b'
            // can add custom override colors here
        },
        // dark or light mode chosen (currently system pref)
        colorScheme: 'light dark',
    },
    // bottom right credit text + link
    credits: {
        text: 'purpl.space',
        href: 'https://purpl.space'
    },
    // remove legend to place on left side
    legend: {
        enabled: false,
    },
    xAxis: {
        // date/time formatting for the axis
        dateTimeLabelFormats: {
            millisecond: { main: '%H:%M:%S.%L' },
            second: { main: '%H:%M:%S' },
            minute: { main: '%H:%M' },
            hour: { main: '%H:%M' },
            day: { main: '%e %b' },
            week: { main: '%e %b' },
            month: { main: '%b %Y' },
            year: { main: '%Y' },
        },
    },
    tooltip: {
        dateTimeLabelFormats: {
            millisecond: '%A %e %b, %H:%M:%S.%L',
            second: '%A %e %b, %H:%M:%S',
            minute: '%A %e %b, %H:%M',
            hour: '%A %e %b, %H:%M',
            day: '%A %e %b %Y',
            week: '%A %e %b %Y',
            month: '%B %Y',
            year: '%Y',
        },
    },
    // turn off mousewheel zooming + range selector on top
    chart: {
        zooming: {
            mouseWheel: {
                enabled: false,
            },
        },
    },
    rangeSelector: {
        enabled: false,
    },
});

// create internal nav setup since it doesn't exist
interface NavigatorInternal {
    xAxis?: {
        options: { left?: number; width?: number };
        left: number;
        len: number;
        setAxisSize: () => void;
        setAxisTranslation: () => void;
    };
    // Live geometry Highcharts itself computes on every navigator.render():
    // left/top/height/size are the navigator strip's box in chart pixels,
    // zoomedMin/zoomedMax are where the two handles sit, relative to `left`.
    left: number;
    top: number;
    height: number;
    size: number;
    zoomedMin: number;
    zoomedMax: number;
    scrollbarHeight: number;
    scrollButtonSize: number;
    navigatorGroup?: Highcharts.SVGElement;
}

const getNavigator = (chart: Highcharts.Chart) =>
    (chart as unknown as { navigator?: NavigatorInternal }).navigator;

// inset the handles to not be overwritten by the nav's own outline
const HANDLE_MARGIN = 8;

// make bottom nav bar go full width of chart *including y-axes*
// rather than just plot area
const syncNavigatorAxis = (chart: Highcharts.Chart) => {
    const navigator = getNavigator(chart);
    const axis = navigator?.xAxis;
    if (!navigator || !axis) return;
    const targetLeft = HANDLE_MARGIN;
    const targetWidth = Math.max(chart.chartWidth - HANDLE_MARGIN * 2, 0);
    if (
        axis.options.left !== targetLeft ||
        axis.options.width !== targetWidth ||
        axis.len !== targetWidth
    ) {
        axis.options.left = targetLeft;
        axis.options.width = targetWidth;
        axis.setAxisSize();
        // make sure a react update keeps the handles in the same long-form place
        axis.setAxisTranslation();
    }
    // The navigator module copies axis.left into navigator.left in its own
    // afterSetChartSize handler, which ran before ours - keep it in step.
    navigator.left = axis.left;
};

// turn the tick time shown into an *elapsed* time since first sample
const formatElapsedTick = (ms: number, tickIntervalMs: number) => {
    const stepSeconds = tickIntervalMs / 1000;
    const decimals = stepSeconds > 0 ? Math.min(6, Math.max(0, Math.ceil(-Math.log10(stepSeconds) - 1e-9))) : 3;
    // Number(...) drops trailing zeros ("1.50" -> "1.5"); the `+ 0`
    // turns a stray -0 into 0.
    return `${Number((ms / 1000).toFixed(decimals)) + 0} s`;
};

// Hover tooltip header: always to the millisecond, trailing zeros dropped.
const formatElapsedTooltip = (ms: number) => `${Number((ms / 1000).toFixed(3)) + 0} s`;

// Label formatter shared by the main x-axis and the navigator's axis.
function elapsedAxisLabel(this: unknown) {
    const ctx = this as { value: number | string; axis: { tickInterval?: number } };
    return formatElapsedTick(Number(ctx.value), ctx.axis.tickInterval ?? 1000);
}

// Chart is just the Highcharts time chart itself.
// Everything else is in App.tsx
const Chart = () => {
    const { timestamps, channels, axes, reportViewTimeRange, requestedTimeRange } = useData();
    const chartComponentRef = useRef<HighchartsReact.RefObject>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    // setup to properly budget the axis space
    const [chartWidth, setChartWidth] = useState(0);
    // performance increase by not redrawing the navigator frame every render
    const navigatorFrameRef = useRef<Highcharts.SVGElement | null>(null);

    // the navigator doesn't actually render an outline around the WHOLE thing,
    // so lets make it ourself :-)
    const drawNavigatorFrame = useCallback((chart: Highcharts.Chart) => {
        const navigator = getNavigator(chart);
        const group = navigator?.navigatorGroup;
        if (!navigator || !group || !navigator.xAxis) {
            navigatorFrameRef.current?.destroy();
            navigatorFrameRef.current = null;
            return;
        }
        // +0.5 keeps a 1px stroke crisp instead of smeared across 2px.
        const crisp = (value: number) => Math.round(value) + 0.5;
        const left = crisp(navigator.left - navigator.scrollButtonSize);
        const right = crisp(navigator.left + navigator.size + navigator.scrollButtonSize) - 1;
        const top = crisp(navigator.top);
        // The scrollbar sits directly under the navigator strip.
        const bottom = crisp(navigator.top + navigator.height + navigator.scrollbarHeight) - 1;
        const path: Highcharts.SVGPathArray = [
            ['M', left, top], ['L', right, top],
            ['M', left, bottom], ['L', right, bottom],
            ['M', left, top], ['L', left, bottom],
            ['M', right, top], ['L', right, bottom],
        ];
        // Same rounding Highcharts' own drawHandle() uses, so the ticks
        // line up with the handles' centers exactly.
        [navigator.zoomedMin, navigator.zoomedMax].forEach((zoomed) => {
            if (!Number.isFinite(zoomed)) return;
            const x = crisp(navigator.left + zoomed);
            path.push(['M', x, top], ['L', x, bottom]);
        });
        // fix a nav re-init destroying the DOM
        const frame = navigatorFrameRef.current;
        if (frame && frame.element.parentNode === group.element) {
            frame.attr({ d: path });
        } else {
            frame?.destroy();
            navigatorFrameRef.current = chart.renderer.path(path)
                .attr({
                    'stroke-width': 1,
                    stroke: 'var(--text)',
                    zIndex: 5,
                    // Purely decorative - never swallow the mouse events
                    // meant for the mask/handles underneath or around it.
                    'pointer-events': 'none',
                })
                .add(group);
        }
    }, []);

    // counteracts some Highcharts behavior that would make the height kinda messy
    // or not properly fill the container
    useEffect(() => {
        const node = containerRef.current;
        const chart = chartComponentRef.current?.chart;
        if (!node || !chart) return;
        const removeSizeHook = Highcharts.addEvent(chart, 'afterSetChartSize', function (this: Highcharts.Chart) {
            syncNavigatorAxis(this);
        });
        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry) {
                node.style.height = `${entry.contentRect.height}px`;
                setChartWidth(entry.contentRect.width);
            }
            chart.setSize(undefined, undefined, false);
            // reveals the chart once it actually has a size so it doesn't flash incorrectly for a moment
            node.dataset.chartReady = 'true';
        });
        observer.observe(node);
        return () => {
            observer.disconnect();
            removeSizeHook();
        };
    }, []);

    // time range set in the nav
    const viewRangeRef = useRef<{ min?: number; max?: number }>({});
    // dataset last showed to see if it needs to reload the data
    const shownTimestampsRef = useRef<number[] | null>(null);
    // Token of the last imported time range (see requestedTimeRange in
    // DataContext) the chart has applied, so each import is applied once.
    const appliedTimeRangeTokenRef = useRef<number | null>(null);

    const options = useMemo(() => {
        // Shift every x value so the first sample sits at 0 (see
        // formatElapsedTick above).
        const startTime = timestamps[0] ?? 0;

        const visibleNumeric = channels.filter((c) => c.kind === 'numeric' && c.visible);
        const visibleSolenoids = channels.filter((c) => c.kind === 'solenoid' && c.visible);

        // consts for distances between axis labels so
        // so they don't collide
        const LABEL_DISTANCE = 15;
        const AXIS_BUFFER = 8;
        const estimateLabelWidth = (channel?: { values: number[] }) => {
            if (!channel || channel.values.length === 0) return 40;
            const finiteValues = channel.values.filter((v) => Number.isFinite(v));
            if (finiteValues.length === 0) return 40;
            const maxAbs = Math.max(...finiteValues.map((v) => Math.abs(v)));
            const hasNegative = finiteValues.some((v) => v < 0);
            const intDigits = Math.max(1, Math.floor(Math.log10(maxAbs + 1)) + 1);
            // + a decimal point and one decimal place, since Highcharts'
            // default tick formatting usually shows one, + a minus sign
            // when needed.
            const charCount = intDigits + 2 + (hasNegative ? 1 : 0);
            return charCount * 6.5;
        };

        // set up all axes, alternate on either side, and organize their locations by space budget
        const axisSpaceBudget = (chartWidth > 0 ? chartWidth : 800) * 0.2; // per side
        const visibleAxisIds = new Set(visibleNumeric.map((c) => c.axisId).filter((id): id is string => !!id));
        const axisIndexById = new Map<string, number>();
        let leftOffset = 0;
        let rightOffset = 0;
        let shownCount = 0;
        const yAxis = axes.length > 0
            ? axes.map((axis, index) => {
                axisIndexById.set(axis.id, index);
                const channelForAxis =
                    visibleNumeric.find((c) => c.axisId === axis.id) ?? channels.find((c) => c.axisId === axis.id);
                const reserve = estimateLabelWidth(channelForAxis) + LABEL_DISTANCE + AXIS_BUFFER;
                // Alternate sides among the axes actually shown, so they
                // stay balanced no matter which ones are hidden.
                const opposite = shownCount % 2 === 1;
                const sideOffset = opposite ? rightOffset : leftOffset;
                const shown = visibleAxisIds.has(axis.id) && sideOffset + reserve <= axisSpaceBudget;
                const offset = shown ? sideOffset : 0;
                if (shown) {
                    shownCount += 1;
                    if (opposite) {
                        rightOffset += reserve;
                    } else {
                        leftOffset += reserve;
                    }
                }
                // manually place ticks so that Highcharts doesn't mess it up
                // with its multiple different tick placement options
                const TICK_COUNT = 6;
                const hasExplicitMin = !axis.auto && axis.min !== '';
                const hasExplicitMax = !axis.auto && axis.max !== '';
                const dataValues = (channelForAxis?.values ?? []).filter((v) => Number.isFinite(v));
                const dataMin = dataValues.length > 0 ? Math.min(...dataValues) : 0;
                const dataMax = dataValues.length > 0 ? Math.max(...dataValues) : 1;
                const dataPad = dataMax > dataMin ? (dataMax - dataMin) * 0.05 : 1;
                const resolvedMin = hasExplicitMin ? (axis.min as number) : dataMin - dataPad;
                let resolvedMax = hasExplicitMax ? (axis.max as number) : dataMax + dataPad;
                if (resolvedMax <= resolvedMin) {
                    resolvedMax = resolvedMin + 1;
                }
                const step = (resolvedMax - resolvedMin) / (TICK_COUNT - 1);
                // Kill floating point noise (e.g. 1.2000000000000002) from
                // the repeated addition below.
                const tickPositions = Array.from({ length: TICK_COUNT }, (_, i) =>
                    Math.round((resolvedMin + step * i) * 1e6) / 1e6
                );
                // Decimal places needed to tell consecutive ticks apart,
                // capped so a tiny step doesn't produce absurd labels.
                const decimals = step > 0 ? Math.min(4, Math.max(0, Math.ceil(-Math.log10(step)) + 1)) : 0;
                return {
                    visible: shown,
                    title: { text: undefined },
                    labels: {
                        style: { fontSize: '10px' },
                        distance: LABEL_DISTANCE,
                        formatter() {
                            const value = Number((this as unknown as { value: number }).value);
                            return Number(value.toFixed(decimals)).toString();
                        },
                    },
                    lineColor: axis.color,
                    lineWidth: 2,
                    tickLength: 4,
                    offset,
                    opposite,
                    min: resolvedMin,
                    max: resolvedMax,
                    tickPositions,
                };
            })
            : [{ title: { text: '' } }];

        const series = visibleNumeric.map((channel) => ({
            name: channel.label,
            type: 'line',
            color: channel.color,
            yAxis: channel.axisId !== undefined ? (axisIndexById.get(channel.axisId) ?? 0) : 0,
            data: timestamps.map((t, i) => [t - startTime, channel.values[i]]),
        }));

        // make the solenoid lines since they aren't a normal data series
        const plotLines = visibleSolenoids.flatMap((channel, channelIndex) => {
            const lines: Array<Record<string, unknown>> = [];
            for (let i = 1; i < channel.values.length; i++) {
                const prev = channel.values[i - 1];
                const curr = channel.values[i];
                if (curr === prev) continue;
                lines.push({
                    value: timestamps[i] - startTime,
                    color: channel.color,
                    width: 2,
                    dashStyle: curr === 1 ? 'Solid' : 'ShortDash',
                    zIndex: 5 + channelIndex,
                    className: 'solenoid-plot-line',
                });
            }
            return lines;
        });

        return {
            // make the chart bg transparent so the page bg is the bg
            chart: {
                backgroundColor: 'transparent',
                events: {
                    // make sure the nav is redrawn after every chart render
                    render(this: Highcharts.Chart) {
                        drawNavigatorFrame(this);
                    },
                },
            },
            title: { text: '' },
            xAxis: {
                // Elapsed seconds since the first sample, not dates.
                type: 'linear',
                title: { text: 'Time (s)', style: { fontSize: '11px' } },
                labels: { formatter: elapsedAxisLabel },
                plotLines,
                ordinal: false,
                events: {
                    // Remember where the user has scrubbed to (see
                    // viewRangeRef / the effect after this useMemo).
                    afterSetExtremes(this: Highcharts.Axis) {
                        const axis = this as Highcharts.Axis & { userMin?: number; userMax?: number };
                        viewRangeRef.current = { min: axis.userMin, max: axis.userMax };
                        // Also hand it to DataContext (in seconds) so
                        // Export View can save it.
                        reportViewTimeRange({
                            start: axis.userMin !== undefined ? axis.userMin / 1000 : null,
                            end: axis.userMax !== undefined ? axis.userMax / 1000 : null,
                        });
                    },
                },
            },
            yAxis,
            series,
            tooltip: {
                // Keep Highcharts' normal tooltip (one row per series),
                // only swapping its header (normally a date) for the
                // elapsed time.
                formatter(this: unknown, tooltip: Highcharts.Tooltip) {
                    const parts = tooltip.defaultFormatter.call(this as never, tooltip);
                    const x = Number((this as { x?: number }).x ?? 0);
                    const header = `<span style="font-size: 0.8em">${formatElapsedTooltip(x)}</span><br/>`;
                    if (Array.isArray(parts)) {
                        parts[0] = header;
                        return parts;
                    }
                    return parts;
                },
            },
            // navbar is the scrubber on the bottom under the graph
            navigator: {
                enabled: true,
                xAxis: {
                    type: 'linear',
                    labels: { formatter: elapsedAxisLabel },
                },
                maskFill: 'var(--accent-bg)',
                outlineWidth: 0,
                handles: {
                    borderColor: 'var(--accent)',
                    borderRadius: 3,
                },
                series: {
                    type: 'line',
                    color: 'var(--accent)',
                    lineWidth: 2.5,
                },
            },
            scrollbar: {
                enabled: true,
                barBorderColor: 'var(--accent)',
                barBorderWidth: 1,
                barBackgroundColor: 'var(--accent-bg)',
                rifleColor: 'var(--accent)',
                trackBackgroundColor: 'var(--accent-border)',
                trackBorderWidth: 0,
            },
            plotOptions: {
                series: {
                    events: {
                        // make sure the solenoid lines gray out like the series lines
                        mouseOver(this: Highcharts.Series) {
                            this.chart.container
                                .querySelectorAll<SVGElement>('.solenoid-plot-line')
                                .forEach((el) => { el.style.opacity = '0.25'; });
                        },
                        mouseOut(this: Highcharts.Series) {
                            this.chart.container
                                .querySelectorAll<SVGElement>('.solenoid-plot-line')
                                .forEach((el) => { el.style.opacity = ''; });
                        },
                    },
                },
            },
        };
    }, [timestamps, channels, axes, chartWidth, drawNavigatorFrame, reportViewTimeRange]);

    // time range on the chart is updated properly on changes
    useLayoutEffect(() => {
        const chart = chartComponentRef.current?.chart;
        const xAxis = chart?.xAxis[0];
        if (!xAxis) return;

        if (shownTimestampsRef.current !== timestamps) {
            shownTimestampsRef.current = timestamps;
            viewRangeRef.current = {};
            // Any time range imported for the PREVIOUS dataset doesn't
            // carry over to this one.
            appliedTimeRangeTokenRef.current = requestedTimeRange?.token ?? null;
            xAxis.setExtremes(undefined, undefined, true, false);
            return;
        }

        // A time range just came in from Import View: jump the navigator
        // to it (seconds -> the chart's elapsed ms; null = data edge).
        if (requestedTimeRange && requestedTimeRange.token !== appliedTimeRangeTokenRef.current) {
            appliedTimeRangeTokenRef.current = requestedTimeRange.token;
            const { start, end } = requestedTimeRange.range;
            const min = start !== null ? start * 1000 : undefined;
            const max = end !== null ? end * 1000 : undefined;
            viewRangeRef.current = { min, max };
            xAxis.setExtremes(min, max, true, false);
            return;
        }

        const { min, max } = viewRangeRef.current;
        const current = xAxis as Highcharts.Axis & { userMin?: number; userMax?: number };
        const hasRange = min !== undefined || max !== undefined;
        if (hasRange && (current.userMin !== min || current.userMax !== max)) {
            xAxis.setExtremes(min, max, true, false);
        }
    }, [options, timestamps, requestedTimeRange]);

    return (
        <div className="chart-container" ref={containerRef}>
            <HighchartsReact
                ref={chartComponentRef}
                highcharts={Highcharts}
                options={options}
                containerProps={{ style: { height: '100%', width: '100%' } }}
            />
        </div>
    );
}

export default Chart;
