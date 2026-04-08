import synnax as sy
from synnax import ni
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
all_channels_names = []

for channel in all_channels:
    if channel.virtual:
        print(f"Skipping virtual channel: {channel.name}")
        continue

    print(f"Adding channel: {channel.name}")
    all_channels_names.append(channel.name)

print(f"Reading data for channels: {all_channels_names}")

data = client.read(time_range, all_channels_names)

os.makedirs("test_data", exist_ok=True)

test_name = input("Enter a name for the test data (without extension): ")

# Build new filename
base_name = os.path.basename("test")
name, _ = os.path.splitext(base_name)
new_filename = f"{test_name}.csv"
new_path = os.path.join("test_data", new_filename)

data_channels = data.channels

rows = []
rows.append(data_channels)

for i, channel in enumerate(data_channels):
    for j, value in enumerate(data[channel]):
        if len(rows) <= j + 1:
            rows.append([])
        rows[j + 1].append(float(value))

# TODO: Make the writer/rows actually work

with open("output.csv", "w", newline="") as f:
    writer = csv.writer(f)

    for row in rows:
        writer.writerow(row)