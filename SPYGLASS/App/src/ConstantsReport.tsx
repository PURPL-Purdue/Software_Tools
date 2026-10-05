import { SettingsDialog } from './SettingsDialog';
import type { AddedTrace, SkippedTrace } from './constantsCalc';
import './ConstantsReport.css';

// Outcome of an "Import Constants" run; either the traces it added/skipped,
// or an error if the file couldn't be read at all
export type ConstantsReportData =
  | { fileName: string; added: AddedTrace[]; skipped: SkippedTrace[] }
  | { fileName: string; error: string };

type ConstantsReportProps = {
  report: ConstantsReportData | null;
  onClose: () => void;
};

// Modal summarizing an import - added traces in green,
// skipped traces w/ reason in red.
const ConstantsReport = ({ report, onClose }: ConstantsReportProps) => (
  <SettingsDialog open={report !== null} title="Import Constants" onClose={onClose}>
    {report && (
      <div className="cr">
        <p className="cr-file">{report.fileName}</p>

        {'error' in report ? (
          <p className="cr-error">{report.error}</p>
        ) : (
          <>
            <p className="cr-summary">
              Added <strong>{report.added.length}</strong> of {report.added.length + report.skipped.length} calculated
              traces.
            </p>
            <TraceList title="Added" kind="added" items={report.added.map((t) => ({ key: t.key, detail: t.unit }))} />
            <TraceList title="Skipped" kind="skipped" items={report.skipped.map((t) => ({ key: t.key, detail: t.reason }))} />
          </>
        )}

        <div className="cr-actions">
          <button type="button" className="ei-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    )}
  </SettingsDialog>
);

// One colored section of the report (hidden when empty).
const TraceList = ({
  title,
  kind,
  items,
}: {
  title: string;
  kind: 'added' | 'skipped';
  items: { key: string; detail?: string }[];
}) => {
  if (items.length === 0) return null;
  return (
    <section className={`cr-section cr-section--${kind}`}>
      <h3 className="cr-section-title">
        {title} ({items.length})
      </h3>
      <ul className="cr-list">
        {items.map((item) => (
          <li key={item.key} className="cr-item">
            <span className="cr-icon" aria-hidden="true">
              {kind === 'added' ? '✓' : '✕'}
            </span>
            <span className="cr-key">{item.key}</span>
            {item.detail && <span className="cr-detail">{item.detail}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
};

export default ConstantsReport;
