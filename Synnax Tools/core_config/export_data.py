import synnax as sy
from synnax import node
import pandas as pd

client = sy.Synnax(host="localhost",
    port=9091,
    username="synnax",
    password="seldon",
    secure=False
)

channels = ["start_cmd"]

with client.open_streamer(channels) as streamer:
    # Loop through the frames in the streamer. Each iteration will block until a new
    # frame is available, then we'll print out the frame of data.
    while True:
        for frame in streamer.read():
            if not "start_cmd" in frame:
                continue

            for value in frame["start_cmd"]:
                if value > 0:
                    start_timestamp = sy.TimeStamp.now()
                    break
                
channels = ["seq_running"]

with client.open_streamer(channels) as streamer:
    # Loop through the frames in the streamer. Each iteration will block until a new
    # frame is available, then we'll print out the frame of data.
    while True:
        for frame in streamer.read():
            if not "seq_running" in frame:
                continue

            for value in frame["seq_running"]:
                if value > 0:
                    end_timestamp = sy.TimeStamp.now()
                    break

# Querey data between start and end timestamps
time_range = sy.TimeRange(start=start_timestamp, end=end_timestamp)

test_name = "test_data.csv"

all_channels = client.channels.retrieve(["*"])
all_channels_names = [channel.name for channel in all_channels]

# Great, docs are kinda fucked, we have to specify channels to read from for client.read(start, end, channels[])... doesn't seem like they have a method to get all channels
data = client.read(time_range, all_channels)

os.makedirs("test_data", exist_ok=True)

# Build new filename
base_name = os.path.basename(path)
name, _ = os.path.splitext(base_name)
new_filename = f"{test_name}.csv"
new_path = os.path.join("test_data", new_filename)

# Convert the data to a pandas DataFrame and export to a CSV file.
df = data.to_df().to_csv(new_path)