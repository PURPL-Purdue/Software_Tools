import AxisRow from './AxisRow';
import { useData } from './useData';
import './YAxisManager.css';

// lists all y-axes in use and allows addition, removal, and mutation
const YAxisManager = () => {
  const { axes, renameAxis, setAxisColor, setAxisMin, setAxisMax, toggleAxisAuto, deleteAxis, addAxis } = useData();

  return (
    <div className="y-axis-manager manager">
      <p className="manager-title">Y-Axis Manager</p>
      <div className="axis-list">
        {axes.map((axis) => (
          <AxisRow
            key={axis.id}
            id={axis.id}
            name={axis.name}
            color={axis.color}
            min={axis.min}
            max={axis.max}
            auto={axis.auto}
            onRename={renameAxis}
            onColorChange={setAxisColor}
            onMinChange={setAxisMin}
            onMaxChange={setAxisMax}
            onAutoToggle={toggleAxisAuto}
            onDelete={deleteAxis}
          />
        ))}
        {axes.length === 0 && <p className="axis-list-empty">No axes yet</p>}
      </div>
      <button type="button" className="axis-add-button" onClick={addAxis}>
        + Add Axis
      </button>
    </div>
  );
};

export default YAxisManager;
