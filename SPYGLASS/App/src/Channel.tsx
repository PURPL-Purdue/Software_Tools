import "./Channel.css";
import TraceMenu, { type AxisOption } from "./TraceMenu";
import { useFloatingMenu } from "./useFloatingMenu";

interface ChannelProps {
  id: string;
  label: string;
  checked: boolean;
  visible: boolean;
  color: string;
  kind: 'numeric' | 'solenoid';
  unit?: string;
  axes: AxisOption[];
  selectedAxisId?: string;
  onToggleVisible: (id: string) => void;
  onColorChange: (id: string, color: string) => void;
  onAxisChange: (id: string, axisId: string) => void;
}

const Channel = ({
  id,
  label,
  checked,
  visible,
  color,
  kind,
  unit,
  axes,
  selectedAxisId,
  onToggleVisible,
  onColorChange,
  onAxisChange,
}: ChannelProps) => {
  const { isOpen, position, triggerRef, menuRef, open } = useFloatingMenu();

  return (
    <div className="channel-container">
      {/** Checkbox for visibility toggle */}
      <div className="channel-checkbox">
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onToggleVisible(id)}
          aria-label={visible ? 'Hide channel' : 'Show channel'}
        />
      </div>

      {/** Marker: solid circle for numeric channels, solid square for
          solenoids, so the two channel kinds are distinguishable at a glance */}
      <button
        className={`channel-marker channel-marker--${kind === 'solenoid' ? 'square' : 'circle'}`}
        onClick={() => onToggleVisible(id)}
        style={{ borderColor: color, backgroundColor: color, opacity: visible ? 1 : 0.3 }}
        aria-label={kind === 'solenoid' ? 'Solenoid channel marker' : 'Numeric channel marker'}
      >
        
      </button>

      <div className="channel-label">{label}</div>

      {/** Button for opening the settings */}
      <button
        ref={triggerRef}
        className="channel-settings"
        onClick={open}
        aria-label="Channel settings"
      >
        . . .
      </button>

      {/** Floating menu used for settings menu */}
      {isOpen && (
        <TraceMenu
          menuRef={menuRef}
          position={position}
          color={color}
          onColorChange={(c) => onColorChange(id, c)}
          kind={kind}
          unit={unit}
          axes={axes}
          selectedAxisId={selectedAxisId}
          onAxisChange={(axisId) => onAxisChange(id, axisId)}
        />
      )}
    </div>
  );
};

export default Channel;