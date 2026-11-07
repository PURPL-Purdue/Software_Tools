from datetime import timedelta, timezone, datetime

import synnax as sy
import requests
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
        print("export_data loaded and running")
        channels = ["data_logging"]

        

        #start_timestamp = "2026-11-01T16:26:47.029264-05:00" # + sy.TimeSpan.MINUTE * 6 + sy.TimeSpan.SECOND * 52
        start_timestamp = datetime(2026, 11, 2, 16, 42, 7, 69264, tzinfo=timezone(timedelta(hours=-5)))


        test_timestamp = str(start_timestamp)[:18].replace(":", ".")
                        
        channels = ["data_logging"]

        end_timestamp = datetime(2026, 11, 2, 16, 42, 19, 99264, tzinfo=timezone(timedelta(hours=-5))) #sy.TimeStamp.now() + 7 * sy.TimeSpan.MINUTE + sy.TimeSpan.SECOND * 00
    

        print(f"End timestamp: {end_timestamp}")

        test_nickname = input("Enter a name for this test (end name with \":e\" if this is the final test): ")

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

        # Upload the CSV to the SPYGLASS server, can be commented out if not needed
        # Was getting weird errors when trying to upload the CSV, but unit tests of the upload function were
        # successful, so I'm not sure where things are going wrong.
        upload_test("https://trapi.tail5b9bd7.ts.net", test_nickname, "Testbed", os.path.join("/Users/brettpaden/src/purpl/Data_Regression_App/Synnax Tools/core_config/output_data", test_dir, test_nickname + "_" + test_timestamp + "_combined.csv"), os.path.join("/Users/brettpaden/src/purpl/Data_Regression_App/Synnax Tools/sequences", input("Enter sequence file name: ")))

        
def upload_test(url, name, project, data_path, test_path):
    with open(data_path, "rb") as data_file, open(test_path, "rb") as test_file:
        response = requests.post(
            f"{url}/upload",
            data={
                "name": name,
                "project": project
            },
            files={
                "data_file": data_file,
                "test_file": test_file
            },
            timeout=120
        )

    response.raise_for_status()
    return response.json()

if __name__ == "__main__":
    export_data_loop()