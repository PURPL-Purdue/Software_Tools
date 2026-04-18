import json
import numpy as np
import synnax as sy
from collections import deque

def run_median_chan(stop_event):
    client = sy.Synnax(host="169.254.71.1", port=9091, username="synnax", password="seldon", secure=False)

    with open("median_channels.json") as f:
        cfg = json.load(f)

    all_ai_channels_names = cfg["ai_channels"]
    med_ai_channels_names = cfg["med_channels"]

    all_ai_channels_buffers = {name: deque(maxlen=9) for name in all_ai_channels_names}

    print(f"Starting median writer for {len(all_ai_channels_names)} channels...")

    with client.open_writer(
        start=sy.TimeStamp.now(),
        channels=med_ai_channels_names,
    ) as writer:
        with client.open_streamer(all_ai_channels_names) as streamer:
            for frame in streamer:
                if stop_event.is_set():
                    break

                write_data = {}
                for channel_name in all_ai_channels_names:
                    series = frame[channel_name]
                    if series is not None and len(series) > 0:
                        for val in series.to_numpy():
                            all_ai_channels_buffers[channel_name].append(float(val))

                    buf = all_ai_channels_buffers[channel_name]
                    if len(buf) > 0:
                        s = sorted(buf)
                        med = s[len(s) // 2]
                        write_data[channel_name + "_med"] = np.array([med], dtype=np.float32)

                if write_data:
                    writer.write(write_data)
