import csv
import re
import pyperclip

# Pattern: cell starts with two letters followed by a dash
sensor_pattern = re.compile(r'^[A-Za-z]{2}-')

sensors = []

with open("file.csv", newline="", encoding="utf-8") as f:
    reader = csv.reader(f)
    for row in reader:
        # Ensure column 2 exists
        if len(row) >= 2:
            cell = row[1].strip()

            if sensor_pattern.match(cell):
                sensors.append(cell)

code_block = ""

for sensor in sensors:
    sensor = sensor.replace("-", "_")
    code_block = code_block + "ch_" + sensor + " = client.channels.create(\n\tname=\"" + sensor + "\",\n\tindex=ai_time.key,\n\tdata_type=sy.DataType.FLOAT32,\n\tretrieve_if_name_exists=True,\n)\n"

pyperclip.copy(code_block)