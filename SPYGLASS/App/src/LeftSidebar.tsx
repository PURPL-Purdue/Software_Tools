import ChannelManager from './ChannelManager';
import ExportImport from './ExportImport';
import './Sidebar.css';

interface LeftSidebarProps {
  open: boolean;
  onToggle: () => void;
}

// Left sidebar, containing the channel manager and export/import panel.
// Is collapsible to a toggle button
const LeftSidebar = ({ open, onToggle }: LeftSidebarProps) => {
  if (!open) {
    return (
      <div className="sidebar-rail">
        <button
          type="button"
          className="sidebar-rail-toggle"
          onClick={onToggle}
          aria-label="Show Channel Manager sidebar"
          title="Show Channel Manager"
        >
          ›
        </button>
      </div>
    );
  }

  return (
    <div className="left-content content">
      <button
        type="button"
        className="sidebar-collapse-toggle sidebar-collapse-toggle--left"
        onClick={onToggle}
        aria-label="Hide Channel Manager sidebar"
        title="Hide Channel Manager"
      >
        ‹ Collapse
      </button>
      <ChannelManager />
      <ExportImport />
    </div>
  );
};

export default LeftSidebar;
