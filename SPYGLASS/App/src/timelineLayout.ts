import type { TestFire } from './projectsStore';

export type TimelineEntry =
  | { kind: 'single'; x: number; testFire: TestFire }
  | { kind: 'cluster'; x: number; testFires: TestFire[] };

// interface to easily store the timeline's range and info
export interface TimelineRange {
  minValue: number;
  valueSpan: number;
  edgeMarginPx: number;
  usableWidth: number;
}

function xForValue(value: number, range: TimelineRange): number {
  if (range.valueSpan === 0) return range.edgeMarginPx + range.usableWidth / 2;
  return range.edgeMarginPx + ((value - range.minValue) / range.valueSpan) * range.usableWidth;
}

// groups and places test fires on the timeline so that
// they don't overlap, clustering only if too close
export function layoutTimelineEntries(
  testFires: TestFire[],
  range: TimelineRange,
  gapPx: number,
  maxSpanPx: number,
  positionOf: (testFire: TestFire, index: number) => number
): TimelineEntry[] {
  if (testFires.length === 0) return [];

  const xs = testFires.map((testFire, index) => xForValue(positionOf(testFire, index), range));
  const groups: TestFire[][] = [];
  const groupXs: number[][] = [];
  let currentGroup: TestFire[] = [testFires[0]];
  let currentXs: number[] = [xs[0]];
  let groupStartX = xs[0];
  let lastX = groupStartX;

  for (let i = 1; i < testFires.length; i++) {
    const testFire = testFires[i];
    const x = xs[i];
    const withinGap = x - lastX < gapPx;
    const withinSpan = x - groupStartX <= maxSpanPx;

    if (withinGap && withinSpan) {
      currentGroup.push(testFire);
      currentXs.push(x);
    } else {
      groups.push(currentGroup);
      groupXs.push(currentXs);
      currentGroup = [testFire];
      currentXs = [x];
      groupStartX = x;
    }
    lastX = x;
  }
  groups.push(currentGroup);
  groupXs.push(currentXs);

  return groups.map((group, groupIndex) => {
    const memberXs = groupXs[groupIndex];
    const avgX = memberXs.reduce((sum, x) => sum + x, 0) / memberXs.length;
    return group.length === 1
      ? { kind: 'single', x: avgX, testFire: group[0] }
      : { kind: 'cluster', x: avgX, testFires: group };
  });
}
