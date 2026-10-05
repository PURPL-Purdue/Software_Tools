import { useEffect, useRef, type ReactNode } from 'react';
import './SettingsDialog.css';

// the settings that opens in a modal-style setup
type SettingsDialogProps = {
  open: boolean;
  title?: string; // defaults to "Settings"; lets other modals reuse this shell
  onClose: () => void;
  children: ReactNode;
};

export const SettingsDialog = ({ open, title = 'Settings', onClose, children }: SettingsDialogProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Keep the native dialog's open state in step with the `open` prop.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="settings-dialog"
      aria-labelledby="settings-dialog-title"
      // Fires for Esc and for dialog.close() alike
      onClose={onClose}
      // only clicks outside panel will close the dialog
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="settings-panel">
        <header className="settings-header">
          <h2 id="settings-dialog-title" className="settings-title">
            {title}
          </h2>
          <button type="button" className="settings-close" onClick={onClose} aria-label={`Close ${title.toLowerCase()}`}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="settings-body">{children}</div>
      </div>
    </dialog>
  );
};

// A titled group of related settings inside the Settings window.
export const SettingsSection = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="settings-section">
    <h3 className="settings-section-title">{title}</h3>
    {children}
  </section>
);

// the content setup for a single row in settings
export const SettingsRow = ({
  label,
  htmlFor,
  description,
  children,
}: {
  label: string;
  htmlFor: string;
  description?: string;
  children: ReactNode;
}) => (
  <div className="settings-row">
    <div className="settings-row-text">
      <label className="settings-row-label" htmlFor={htmlFor}>
        {label}
      </label>
      {description && <p className="settings-row-description">{description}</p>}
    </div>
    <div className="settings-row-control">{children}</div>
  </div>
);
