// TraceMenu.tsx
import { type RefObject } from 'react';
import './TraceMenu.css';

export interface AxisOption {
  id: string;
  name: string;
}

// props for menu component
interface TraceMenuProps {
  menuRef: RefObject<HTMLDivElement | null>;
  position: { top: number; left: number };
  color: string;
  onColorChange: (color: string) => void;
  kind: 'numeric' | 'solenoid';
  unit?: string;
  axes: AxisOption[];
  selectedAxisId?: string;
  onAxisChange: (axisId: string) => void;
}

const TraceMenu = ({
  menuRef,          // position/parent ref
  position,         // position of menu relative to parent (guessing)
  color,            // color of marker/line trace
  onColorChange,    // callback for color pallette change
  kind,             // solenoid/numeric distinction
  unit,             // measurement unit for channel
  axes,             // list of available axes from right content/graph
  selectedAxisId,   // currently selected axis for this channel
  onAxisChange,     // callback for axis selection change
}: TraceMenuProps) => {

    return (
        <div
            ref={menuRef}
            className='trace-menu'
            style={{ top: position.top, left: position.left }}
        >
            
            { /* color selection option */}
            <div className='trace-menu-row'>
                <span className='trace-menu-label'>Color</span>
                <div className='trace-menu-content'>
                    <input
                        type="color"
                        className='color-picker'
                        value={color}
                        onChange={(e) => onColorChange(e.currentTarget.value)}
                    />
                </div>
            </div>

            { /* axis selection option only for numeric channels */ }
            {kind === 'numeric' && (
            <div className='trace-menu-row'>
                <span className='trace-menu-label'>Y-Axis</span>
                <div className='trace-menu-content'>
                <select
                    className='axis-select'
                    value={selectedAxisId ?? ''}
                    onChange={(e) => onAxisChange(e.currentTarget.value)}
                >
                    {axes.map((axis) => (
                    <option key={axis.id} value={axis.id}>
                        {axis.name}
                    </option>
                    ))}
                </select>
                </div>
            </div>
            )}

            { /* display of solenoid/numeric in text */ }
            <div className='trace-menu-row'>
                <span className='trace-menu-label'>Type</span>
                <div className='trace-menu-content'>
                    <span className='hint'>{kind === 'solenoid' ? 'State' : unit}</span>
                </div>
            </div>
        </div>
  );
};

export default TraceMenu;