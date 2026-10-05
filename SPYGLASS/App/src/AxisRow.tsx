import './AxisRow.css';

interface AxisRowProps {
  id: string;
  name: string;
  color: string;
  min: number | '';
  max: number | '';
  auto: boolean;
  onRename: (id: string, name: string) => void;
  onColorChange: (id: string, color: string) => void;
  onMinChange: (id: string, min: number | '') => void;
  onMaxChange: (id: string, max: number | '') => void;
  onAutoToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

// A single y-axis's controls: color, rename, min/max (or auto), delete.
const AxisRow = ({
  id,
  name,
  color,
  min,
  max,
  auto,
  onRename,
  onColorChange,
  onMinChange,
  onMaxChange,
  onAutoToggle,
  onDelete,
}: AxisRowProps) => {
  const parseRangeValue = (raw: string): number | '' => (raw === '' ? '' : Number(raw));

  return (
    <div className="axis-row">
      {/* color picker input option */}
      <input
        type="color"
        className="axis-color-picker"
        value={color}
        onChange={(e) => onColorChange(id, e.currentTarget.value)}
        aria-label="Axis color"
      />

      {/* Rename input for axis */}
      <input
        type="text"
        className="axis-name-input"
        value={name}
        onChange={(e) => onRename(id, e.currentTarget.value)}
        aria-label="Axis name"
      />

      {/* section to choose auto axis range or manual inputs */}
      <div className="axis-range">
        <input
          type="number"
          className="axis-range-input"
          placeholder="min"
          value={min}
          disabled={auto}
          onChange={(e) => onMinChange(id, parseRangeValue(e.currentTarget.value))}
          aria-label="Axis minimum"
        />
        <span className="axis-range-sep">–</span>
        <input
          type="number"
          className="axis-range-input"
          placeholder="max"
          value={max}
          disabled={auto}
          onChange={(e) => onMaxChange(id, parseRangeValue(e.currentTarget.value))}
          aria-label="Axis maximum"
        />
      </div>

      {/* checkbox to choose if auto or manual axis range */}
      <label className="axis-auto-toggle">
        <input type="checkbox" checked={auto} onChange={() => onAutoToggle(id)} />
        Auto
      </label>

      {/* button for deleting axis */}
      <button
        type="button"
        className="axis-delete"
        onClick={() => onDelete(id)}
        aria-label="Delete axis"
      >
        ×
      </button>
    </div>
  );
};

export default AxisRow;
