import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import './ExportImport.css';
import { useData } from './useData';
import { buildPlottedCsv, buildViewExport, parseViewJson } from './dataStore';
import ConstantsReport, { type ConstantsReportData } from './ConstantsReport';

type Kind = 'success' | 'error';
type ButtonKey = 'exportView' | 'importView' | 'exportCsv' | 'importConstants';

// How long a button's success/failure outline lasts before fading back
const FLASH_DURATION_MS = 2200;

// triggers the download box of a txt file
function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// A filesystem-safe timestamp for default export filenames.
function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

// Export/import panel:
//  - Export View JSON: channel colors/visibility/axis assignment, plus
//    axis names/colors/range, plus the navigator's selected time window
//    (timeRange, in seconds from the first sample) - everything a user
//    has customized, without the underlying data.
//  - Import View JSON: re-applies a previously-exported view onto
//    whatever data is currently loaded, matched by channel/axis id (so it
//    round-trips cleanly when re-loading the same CSV).
//  - Export Plotted CSV: the currently-visible channels' data, in the same
//    shape the CSV loader expects.
//  - Import Constants: reads a constants .yaml (e.g. Maelstrom.yaml) and
//    adds calculated traces (mdot, density, c*, O/F...) built from it and
//    the loaded pressure traces - see constantsCalc.ts.
const ExportImport = () => {
  const importInputRef = useRef<HTMLInputElement>(null);
  const constantsInputRef = useRef<HTMLInputElement>(null);
  const { channels, axes, timestamps, importView, importConstants, getViewTimeRange } = useData();
  const [message, setMessage] = useState<{ kind: Kind; text: string } | null>(null);
  const [constantsReport, setConstantsReport] = useState<ConstantsReportData | null>(null);
  const [buttonFlash, setButtonFlash] = useState<Partial<Record<ButtonKey, Kind>>>({});
  const flashTimeouts = useRef<Partial<Record<ButtonKey, ReturnType<typeof setTimeout>>>>({});

  useEffect(() => {
    const timeouts = flashTimeouts.current;
    return () => {
      Object.values(timeouts).forEach((t) => t && clearTimeout(t));
    };
  }, []);

  // outline a button green/red for a moment
  const flashButton = (key: ButtonKey, kind: Kind) => {
    setButtonFlash((prev) => ({ ...prev, [key]: kind }));

    const existing = flashTimeouts.current[key];
    if (existing) clearTimeout(existing);
    flashTimeouts.current[key] = setTimeout(() => {
      setButtonFlash((prev) => ({ ...prev, [key]: undefined }));
    }, FLASH_DURATION_MS);
  };

  // flash a button and show a status line under the buttons
  const flash = (key: ButtonKey, kind: Kind, text: string) => {
    setMessage({ kind, text });
    flashButton(key, kind);
  };

  const handleImportClick = () => {
    importInputRef.current?.click();
  };

  const handleExportView = () => {
    const view = buildViewExport({ timestamps, channels, axes }, getViewTimeRange());
    downloadTextFile(`spyglass-view-${timestampSlug()}.json`, JSON.stringify(view, null, 2), 'application/json');
    flash('exportView', 'success', 'View JSON exported.');
  };

  const handleExportCsv = () => {
    try {
      const csv = buildPlottedCsv({ timestamps, channels, axes });
      downloadTextFile(`spyglass-plotted-${timestampSlug()}.csv`, csv, 'text/csv');
      flash('exportCsv', 'success', 'Plotted CSV exported.');
    } catch (err) {
      flash('exportCsv', 'error', err instanceof Error ? err.message : 'Could not export plotted data.');
    }
  };

  const handleImportFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      try {
        const view = parseViewJson(reader.result);
        const { matchedAxes, matchedChannels, appliedTimeRange } = importView(view);
        if (matchedAxes === 0 && matchedChannels === 0 && !appliedTimeRange) {
          flash(
            'importView',
            'error',
            "That view didn't match anything in the current data - load the same CSV first."
          );
        } else {
          flash(
            'importView',
            'success',
            `Applied view: ${matchedChannels} channel${matchedChannels === 1 ? '' : 's'}, ${matchedAxes} ${matchedAxes === 1 ? 'axis' : 'axes'} updated${appliedTimeRange ? ', time range set' : ''}.`
          );
        }
      } catch (err) {
        flash('importView', 'error', err instanceof Error ? err.message : 'Could not read that view file.');
      }
    };
    reader.readAsText(file);

    e.target.value = ''; // allow re-selecting the same file later
  };

  const handleConstantsFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      try {
        const { added, skipped } = importConstants(reader.result);
        setConstantsReport({ fileName: file.name, added, skipped });
        flashButton('importConstants', added.length > 0 ? 'success' : 'error');
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Could not read that constants file.';
        setConstantsReport({ fileName: file.name, error });
        flashButton('importConstants', 'error');
      }
    };
    reader.readAsText(file);

    e.target.value = ''; // allow re-selecting the same file later
  };

  const buttonClass = (key: ButtonKey) => {
    const kind = buttonFlash[key];
    return kind ? `ei-button ei-button--${kind}` : 'ei-button';
  };

  return (
    <div className="export-import manager">
      <p className="manager-title">Export / Import</p>
      <div className="export-import-buttons">
        <button type="button" className={buttonClass('exportView')} onClick={handleExportView}>
          Export View JSON
        </button>
        <button type="button" className={buttonClass('importView')} onClick={handleImportClick}>
          Import View JSON
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json"
          className="ei-file-input"
          onChange={handleImportFileChange}
        />
        <button type="button" className={buttonClass('exportCsv')} onClick={handleExportCsv}>
          Export Plotted CSV
        </button>
        <button
          type="button"
          className={buttonClass('importConstants')}
          onClick={() => constantsInputRef.current?.click()}
        >
          Import Constants
        </button>
        <input
          ref={constantsInputRef}
          type="file"
          accept=".yaml,.yml"
          className="ei-file-input"
          onChange={handleConstantsFileChange}
        />
      </div>
      {message && <p className={`ei-status ei-status--${message.kind}`}>{message.text}</p>}
      <ConstantsReport report={constantsReport} onClose={() => setConstantsReport(null)} />
    </div>
  );
};

export default ExportImport;
