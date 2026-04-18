import synnax as sy
from synnax import ni
from itertools import zip_longest
import pandas as pd
import os
import csv
from merge_data import merge
from pathlib import Path

def export_data_loop():
    client = sy.Synnax(host="169.254.71.1",
        port=9091,
        username="synnax",
        password="seldon",
        secure=False
    )

    keep_running = True

    while keep_running:
        channels = ["start_cmd"]

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
        test_timestamp = str(start_timestamp)[:18].replace(":", ".")
                        
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

        test_nickname = input("Enter a name for this test: (end name with \":e\" if this is the final test)")

        if test_nickname.endswith(":e"):
            test_nickname = test_nickname[:-2]
            keep_running = False

        # Querey data between start and end timestamps
        time_range = sy.TimeRange(start=start_timestamp, end=end_timestamp)

        all_channels = client.channels.retrieve(["*"])

        time_chans = client.channels.retrieve(["time_chan[a-zA-Z0-9_]*"]) # Get all time channels
        time_chan_to_card_name = {chan.key: chan.name[9:] for i,chan in enumerate(time_chans)}

        channels_by_device = {}

        for device in time_chan_to_card_name.values():
            channels_by_device[device] = []

        for channel in all_channels:
            if channel.virtual or channel.index not in time_chan_to_card_name:
                continue;

            channels_by_device[time_chan_to_card_name[channel.index]].append(channel.name)

        test_dir = test_nickname + "_" + test_timestamp

        os.makedirs("output_data", exist_ok=True)
        os.makedirs("output_data/" + test_dir, exist_ok=True)

        for device in channels_by_device.keys():
            device_cols = []
            read_channels = channels_by_device[device]

            for channel in read_channels:
                data = client.read(time_range, [channel])
                column = [channel]

                for value in data:
                    column.append(float(value))

                device_cols.append(column)



            with open(os.path.join("output_data", test_dir, test_nickname + "_" + test_timestamp + "_" + device + ".csv"), "w", newline="") as f:
                writer = csv.writer(f)

                for row in zip_longest(*device_cols, fillvalue=""):
                    writer.writerow(row)

        merge(os.path.join("output_data", test_dir), test_nickname + "_" + test_timestamp + "_combined.csv")
        rows = []

        with open(os.path.join("output_data", test_dir, test_nickname + "_" + test_timestamp + "_combined.csv"), newline="") as f:
            reader = csv.reader(f)
            for row in reader:
                rows.append(row)

        for i, row in enumerate(rows):
            if i == 0:
                continue

            for j, cell in enumerate(row):
                if rows[i][j] == "":
                    continue

                n = 1

                while i + n < len(rows) and rows[i + n][j] == "":
                    rows[i + n][j] = rows[i][j]
                    n += 1

                n = 1
                while i - n >= 0 and rows[i - n][j] == "":
                    rows[i - n][j] = rows[i][j]
                    n += 1 

        with open(os.path.join("output_data", test_dir, test_nickname + "_" + test_timestamp + "_combined.csv"), "w", newline="") as f:
            writer = csv.writer(f)

            for row in rows:
                writer.writerow(row)