import synnax as sy
from synnax import ni
from itertools import zip_longest
import pandas as pd
import os
import csv

client = sy.Synnax(host="localhost",
    port=9091,
    username="synnax",
    password="seldon",
    secure=False
)

channels = ["start_cmd"]
frame_count = 0

with client.open_streamer(channels) as streamer:
    # Loop through the frames in the streamer. Each iteration will block until a new
    # frame is available, then we'll print out the frame of data.
    while True:
        frame = streamer.read()
        if not "start_cmd" in frame:
            continue

        if frame["start_cmd"][0] == 1:
            start_timestamp = sy.TimeStamp.now()
            break

print(f"Start timestamp: {start_timestamp}")
                
channels = ["seq_running"]

with client.open_streamer(channels) as streamer:
    # Loop through the frames in the streamer. Each iteration will block until a new
    # frame is available, then we'll print out the frame of data.
    while True:
        frame = streamer.read()

        if not "seq_running" in frame:
            continue

        if frame["seq_running"][0] == 0:
            end_timestamp = sy.TimeStamp.now()
            break

print(f"End timestamp: {end_timestamp}")

# Querey data between start and end timestamps
time_range = sy.TimeRange(start=start_timestamp, end=end_timestamp)

# test_name = "test_data.csv"

all_channels = client.channels.retrieve(["*"])

time_chans = client.channels.retrieve(["time_chan[a-zA-Z0-9_]*"]) # Get all time channels
time_chan_to_card_name = {chan.key: chan.name[10:] for i,chan in enumerate(time_chans)}

channels_by_device = {}

for device in time_chan_to_card_name.values():
    channels_by_device[device] = []

for channel in all_channels:
    if channel.virtual or channel.index not in time_chan_to_card_name:
        continue;

    channels_by_device[time_chan_to_card_name[channel.index]].append(channel.name)

os.makedirs("output_data", exist_ok=True)

for device in channels_by_device.keys():
    device_cols = []
    read_channels = channels_by_device[device]

    for channel in read_channels:
        if "time_chan" in channel:
            continue

        data = client.read(time_range, [channel])

        column = [channel]

        for value in data:
            column.append(float(value))

        device_cols.append(column)

    with open(os.path.join("output_data", device + ".csv"), "w", newline="") as f:
        writer = csv.writer(f)

        for row in zip_longest(*device_cols, fillvalue=""):
            writer.writerow(row)