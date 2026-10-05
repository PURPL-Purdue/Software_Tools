import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import './TimelinePage.css';
import { useProjects } from './useProjects';
import { useData } from './useData';
import type { Project, TestFire } from './projectsStore';
import { useElementWidth } from './useElementWidth';
import { layoutTimelineEntries } from './timelineLayout';
import { fetchTestFire } from './projectsApi';
import { SettingsDialog, SettingsRow, SettingsSection } from './SettingsDialog';

// Starting page of the app that pulls test fires from server
// to display on a timeline that can then be selected to open
// the data in the chart/graph view.
type TimelinePageProps = {
  onOpenChart: (testFire?: TestFire) => void;
};

// Keeps the first/last tick off the line's rounded caps.
const EDGE_MARGIN_FRACTION = 0.04;
// max distance to start clustering data together.
const CLUSTER_GAP_PX = 26;
// Makes sure clusters don't cluster and make a fat cluster.
const CLUSTER_MAX_SPAN_PX = 90;

// Test fires from the real server don't carry a date yet, so this returns
// null (and no date line is rendered) when there isn't one.
const formatTestFireDate = (timestamp?: number) =>
  timestamp === undefined
    ? null
    : new Date(timestamp).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

// options for visual themes; so far only classic and smoke.
type TimelineTheme = 'classic' | 'smoke';
const TIMELINE_THEMES: { id: TimelineTheme; label: string }[] = [
  { id: 'classic', label: 'Classic' },
  { id: 'smoke', label: 'Smoke' },
];
const THEME_STORAGE_KEY = 'spyglass.timelineTheme';

// optional image for smoke on timeline, otherwise defaults to .css implementation.
const SMOKE_IMAGE_URL =
  (import.meta.env.VITE_TIMELINE_SMOKE_IMAGE as string | undefined)?.trim() || undefined;

// any protected themes from stupid site perms makes it default.
const isTimelineTheme = (value: unknown): value is TimelineTheme =>
  TIMELINE_THEMES.some((t) => t.id === value);

const readStoredTheme = (): TimelineTheme => {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isTimelineTheme(stored) ? stored : 'classic';
  } catch {
    return 'classic';
  }
};

// background clouds for smoke theme.
const SKY_CLOUDS = [
  { top: '6%', left: '3%', scale: 1.15, duration: 38, delay: 0 },
  { top: '14%', left: '58%', scale: 0.8, duration: 46, delay: -12 },
  { top: '34%', left: '6%', scale: 0.6, duration: 52, delay: -30 },
  { top: '64%', left: '8%', scale: 0.75, duration: 44, delay: -8 },
  { top: '72%', left: '66%', scale: 1.05, duration: 40, delay: -20 },
  { top: '44%', left: '84%', scale: 0.55, duration: 56, delay: -4 },
  { top: '84%', left: '38%', scale: 0.65, duration: 48, delay: -26 },
];

const TimelinePage = ({ onOpenChart }: TimelinePageProps) => {
  const {
    projects,
    selectedProject,
    selectProject,
    testFires,
    testFiresLoading,
    testFiresError,
    reloadTestFires,
  } = useProjects();

  const { loadTestFire, loadCsvText } = useData();

  // skip server polling and upload a csv file to chart/graph
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [csvError, setCsvError] = useState<string | null>(null);

  const handleLoadCsvClick = () => csvInputRef.current?.click();

  const handleCsvFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      const error = loadCsvText(reader.result);
      setCsvError(error);
      if (!error) onOpenChart();
    };
    reader.onerror = () => setCsvError(`Could not read "${file.name}".`);
    reader.readAsText(file);
  };

  const [marksRef, marksWidth] = useElementWidth<HTMLDivElement>();
  const [openingTestFireId, setOpeningTestFireId] = useState<string | null>(null);
  const [openTestFireError, setOpenTestFireError] = useState<string | null>(null);

  const [theme, setTheme] = useState<TimelineTheme>(readStoredTheme);
  const [smokeImageFailed, setSmokeImageFailed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleThemeChange = (next: TimelineTheme) => {
    setTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Not persisted this time - the new theme still applies for this visit.
    }
  };

  const handleProjectChange = (e: ChangeEvent<HTMLSelectElement>) => {
    // Option values are exactly the PROJECTS entries (or '' for none).
    selectProject((e.target.value || null) as Project | null);
  };

  // loads the grabbed test fire into the chart
  const handleOpenTestFire = async (testFire: TestFire) => {
    if (!selectedProject || openingTestFireId) return;

    setOpeningTestFireId(testFire.id);
    setOpenTestFireError(null);
    try {
      const loaded = await fetchTestFire(selectedProject, testFire.id, testFire.name);
      loadTestFire(loaded);
      onOpenChart(testFire);
    } catch (err) {
      setOpenTestFireError(err instanceof Error ? err.message : `Could not load "${testFire.name}".`);
    } finally {
      setOpeningTestFireId(null);
    }
  };

  // works to sort by time if possible, otherwise by index
  const byTime = testFires.length > 0 && testFires.every((tf) => tf.timestamp !== undefined);
  const minValue = byTime ? (testFires[0].timestamp ?? 0) : 0;
  const maxValue = byTime ? (testFires[testFires.length - 1].timestamp ?? 0) : Math.max(testFires.length - 1, 0);
  const valueSpan = maxValue - minValue;

  const edgeMarginPx = marksWidth * EDGE_MARGIN_FRACTION;
  const usableWidth = Math.max(marksWidth - edgeMarginPx * 2, 0);

  const entries = useMemo(
    () =>
      layoutTimelineEntries(
        testFires,
        { minValue, valueSpan, edgeMarginPx, usableWidth },
        CLUSTER_GAP_PX,
        CLUSTER_MAX_SPAN_PX,
        (testFire, index) => (byTime ? (testFire.timestamp ?? 0) : index)
      ),
    [testFires, byTime, minValue, valueSpan, edgeMarginPx, usableWidth]
  );

  return (
    <div className={`timeline-page timeline-page--${theme}`}>
      {theme === 'smoke' && (
        <div className="timeline-sky" aria-hidden="true">
          {SKY_CLOUDS.map((cloud, index) => (
            <span
              key={index}
              className="timeline-sky-cloud"
              style={{
                top: cloud.top,
                left: cloud.left,
                ['--cloud-scale' as string]: cloud.scale,
                animationDuration: `${cloud.duration}s`,
                animationDelay: `${cloud.delay}s`,
              }}
            />
          ))}
        </div>
      )}

      <div className="timeline-hidden-topbar">
        <button
          type="button"
          className="timeline-settings-button"
          aria-label="Settings"
          title="Settings"
          aria-haspopup="dialog"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen(true)}
        >
          {/* Gear icon */}
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)}>
        <SettingsSection title="Appearance">
          <SettingsRow label="Theme" htmlFor="settings-theme-select" description="How the timeline is drawn.">
            <select
              id="settings-theme-select"
              className="settings-select"
              value={theme}
              onChange={(e) => {
                if (isTimelineTheme(e.target.value)) handleThemeChange(e.target.value);
              }}
            >
              {TIMELINE_THEMES.map(({ id, label }) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </SettingsRow>
        </SettingsSection>
      </SettingsDialog>

      {/* Everything under the top bar: the project picker and the
          timeline, centered together in the remaining space. */}
      <main className="timeline-main">
        <div className="timeline-project-picker">
          {/* Row 1: the controls. Row 2 (below): whatever status/error
              applies, centered under them. */}
          <div className="timeline-picker-controls">
            <label className="timeline-project-label" htmlFor="timeline-project-select">
              Project
            </label>
            <select
              id="timeline-project-select"
              className="timeline-project-select"
              value={selectedProject ?? ''}
              onChange={handleProjectChange}
            >
              <option value="">Select a project…</option>
              {projects.map((project) => (
                <option key={project} value={project}>
                  {project}
                </option>
              ))}
            </select>

            <span className="timeline-or">or</span>

            <button type="button" className="timeline-load-csv-button" onClick={handleLoadCsvClick}>
              Load CSV
            </button>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              className="timeline-file-input"
              onChange={handleCsvFileChange}
            />
          </div>

          <div className="timeline-picker-status" aria-live="polite">
            {csvError && (
              <span className="timeline-status timeline-status--error">
                {csvError}
                <button type="button" className="timeline-retry-button" onClick={() => setCsvError(null)}>
                  Dismiss
                </button>
              </span>
            )}

            {selectedProject && testFiresLoading && (
              <span className="timeline-status">Loading test fires…</span>
            )}

            {selectedProject && testFiresError && (
              <span className="timeline-status timeline-status--error">
                {testFiresError}
                <button type="button" className="timeline-retry-button" onClick={reloadTestFires}>
                  Retry
                </button>
              </span>
            )}

            {selectedProject && !testFiresLoading && !testFiresError && testFires.length === 0 && (
              <span className="timeline-status">No test fires for this project yet.</span>
            )}

            {theme === 'smoke' && smokeImageFailed && (
              <span className="timeline-status">
                Smoke image couldn't be loaded - check VITE_TIMELINE_SMOKE_IMAGE is a URL or a path under public/, not a C:\ path.
              </span>
            )}

            {openingTestFireId && <span className="timeline-status">Loading test fire data…</span>}

            {openTestFireError && (
              <span className="timeline-status timeline-status--error">
                {openTestFireError}
                <button type="button" className="timeline-retry-button" onClick={() => setOpenTestFireError(null)}>
                  Dismiss
                </button>
              </span>
            )}
          </div>
        </div>

        <div className="timeline-track">
          <button
            type="button"
            className="timeline-line"
            onClick={() => onOpenChart()}
            aria-label="Open chart view"
          >
            {theme === 'smoke' &&
              (!SMOKE_IMAGE_URL || smokeImageFailed ? (
                <span className="timeline-smoke-fallback" />
              ) : (
                <img
                  className="timeline-smoke-image"
                  src={SMOKE_IMAGE_URL}
                  alt=""
                  draggable={false}
                  onError={() => setSmokeImageFailed(true)}
                />
              ))}
          </button>

          {/* using measure pixels instead of percents to keep accurate
              not matter the sizing */}
          <div className="timeline-marks" ref={marksRef}>
            {marksWidth > 0 &&
              entries.map((entry, index) => {
                // alternate side of timeline to space-maxx
                const side = index % 2 === 0 ? 'above' : 'below';
                const anchorClass = `timeline-anchor timeline-anchor--${side} timeline-stack--${side}`;

                if (entry.kind === 'single') {
                  const testFire = entry.testFire;
                  return (
                    <button
                      key={testFire.id}
                      type="button"
                      className={`${anchorClass} timeline-tick`}
                      style={{ left: `${entry.x}px` }}
                      onClick={() => handleOpenTestFire(testFire)}
                      disabled={openingTestFireId !== null}
                    >
                      <span className="timeline-tick-label">
                        <span className="timeline-tick-label-name">{testFire.name}</span>
                        {testFire.timestamp !== undefined && (
                          <span className="timeline-tick-label-date">{formatTestFireDate(testFire.timestamp)}</span>
                        )}
                      </span>
                      <span className="timeline-tick-mark" />
                    </button>
                  );
                }

                const key = entry.testFires.map((tf) => tf.id).join('+');
                return (
                  <div
                    key={key}
                    className={`timeline-anchor timeline-anchor--${side} timeline-cluster`}
                    style={{ left: `${entry.x}px` }}
                  >
                    <button
                      type="button"
                      className={`timeline-cluster-badge timeline-stack--${side}`}
                      aria-label={`${entry.testFires.length} test fires - open list`}
                    >
                      <span className="timeline-cluster-count">{entry.testFires.length}</span>
                      <span className="timeline-tick-mark" />
                    </button>

                    {/* positioned absolute to ensure proper spacing at all times */}
                    <div className={`timeline-cluster-popover timeline-cluster-popover--${side}`} role="menu">
                      {entry.testFires.map((testFire) => (
                        <button
                          key={testFire.id}
                          type="button"
                          role="menuitem"
                          className="timeline-cluster-item"
                          onClick={() => handleOpenTestFire(testFire)}
                          disabled={openingTestFireId !== null}
                        >
                          <span className="timeline-cluster-item-name">{testFire.name}</span>
                          {testFire.timestamp !== undefined && (
                            <span className="timeline-cluster-item-date">{formatTestFireDate(testFire.timestamp)}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </main>
    </div>
  );
};

export default TimelinePage;
