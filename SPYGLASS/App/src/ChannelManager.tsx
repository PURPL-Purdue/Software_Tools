import Channel from './Channel';
import { useData } from './useData';
import './ChannelManager.css';

// Shows every data set/line loaded from the CSV (or the placeholder demo
// data) with on/off, color, and axis controls per channel.
const ChannelManager = () => {
  const {
    channels,
    axes,
    toggleChannelVisible,
    setAllChannelsVisible,
    invertChannelVisibility,
    setChannelColor,
    setChannelAxis,
  } = useData();

  const axisOptions = axes.map((a) => ({ id: a.id, name: a.name }));

  return (
    <div className="channel-manager manager">
      <p className="manager-title">Channel Manager</p>
      <div className="channel-bulk-actions">
        <button
          type="button"
          className="ei-button channel-bulk-button"
          onClick={() => setAllChannelsVisible(true)}
          disabled={channels.length === 0}
        >
          All On
        </button>
        <button
          type="button"
          className="ei-button channel-bulk-button"
          onClick={() => setAllChannelsVisible(false)}
          disabled={channels.length === 0}
        >
          All Off
        </button>
        <button
          type="button"
          className="ei-button channel-bulk-button channel-bulk-button--wide"
          onClick={invertChannelVisibility}
          disabled={channels.length === 0}
        >
          Invert
        </button>
      </div>

      
      <div className="channel-list">
        {channels.length === 0 && <p className="channel-list-empty">No channels loaded</p>}
        {channels.map((channel) => (
          <Channel
            key={channel.id}
            id={channel.id}
            label={channel.label}
            checked={channel.visible}
            visible={channel.visible}
            color={channel.color}
            kind={channel.kind}
            unit={channel.unit}
            axes={axisOptions}
            selectedAxisId={channel.axisId}
            onToggleVisible={toggleChannelVisible}
            onColorChange={setChannelColor}
            onAxisChange={setChannelAxis}
          />
        ))}
      </div>
    </div>
  );
};

export default ChannelManager;
