import { useRef, type ChangeEvent } from 'react';
import './Topbar.css';
import LogoSvg from './assets/PURPL_wordmark_white.svg';
import { useData } from './useData';

type TopbarProps = {
  // Present on the graph page only; navigates back to the Timeline.
  onBack?: () => void;
};

// Top bar shown above the main content: logo plus csv load button
const Topbar = ({ onBack }: TopbarProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { loadCsvText, loadError, testFire } = useData();

  // simplification of current test fire on chart to display in the topbar
  // loaded csv shows no simplification
  const testFireSummary = testFire
    ? [
        testFire.name,
        testFire.project,
        testFire.dateTime !== undefined
          ? new Date(testFire.dateTime).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' })
          : undefined,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  const handleLoadClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        loadCsvText(reader.result);
      }
    };
    reader.readAsText(file);

    e.target.value = ''; // allow re-selecting the same file later
  };

  return (
    <div className="topbar">
      <div className="topbar-brand">
        {onBack && (
          <button type="button" className="topbar-back-button" onClick={onBack}>
            ← Back
          </button>
        )}
        <img src={LogoSvg} alt="Logo" className="topbar-logo" />
        <p className="topbar-title">SPYGLASS</p>
        {testFireSummary && (
          <span className="topbar-test-fire" title={testFireSummary}>
            {testFireSummary}
          </span>
        )}
      </div>

      <div className="topbar-actions">
        {loadError && <span className="topbar-error">{loadError}</span>}
        <button type="button" className="topbar-load-button" onClick={handleLoadClick}>
          Load CSV
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="topbar-file-input"
          onChange={handleFileChange}
        />
      </div>
    </div>
  );
};

export default Topbar;
