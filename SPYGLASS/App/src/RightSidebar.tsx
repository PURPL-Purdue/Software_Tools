import YAxisManager from './YAxisManager';
import './Sidebar.css';

interface RightSidebarProps {
  open: boolean;
  onToggle: () => void;
}

// Right sidebar: just the y-axis manager for now. Collapsible the same
// way as the left sidebar - see LeftSidebar for the thought process.
const RightSidebar = ({ open, onToggle }: RightSidebarProps) => {
  if (!open) {
    return (
      <div className="sidebar-rail">
        <button
          type="button"
          className="sidebar-rail-toggle"
          onClick={onToggle}
          aria-label="Show Y-Axis Manager sidebar"
          title="Show Y-Axis Manager"
        >
          ‹
        </button>
      </div>
    );
  }

  return (
    <div className="right-content content">
      <button
        type="button"
        className="sidebar-collapse-toggle sidebar-collapse-toggle--right"
        onClick={onToggle}
        aria-label="Hide Y-Axis Manager sidebar"
        title="Hide Y-Axis Manager"
      >
        Collapse ›
      </button>
      <YAxisManager />
    </div>
  );
};

export default RightSidebar;
