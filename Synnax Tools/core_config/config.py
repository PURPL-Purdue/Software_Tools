import csv
import synnax as sy
from synnax import ni

# Connect to Synnax
client = sy.Synnax()

# Get the embedded rack (local driver rack)
rack = client.racks.retrieve_embedded_rack()

devices = []
device_map = {} # Initialize from config file

rows = []
device_rows = False

with open('pigtails.csv', newline='') as f:
    reader = csv.reader(f)
    for row in reader:
        if row[0] == "cRIO Slot":
            device_rows = True
            continue;
        if device_rows:
            if row[0] == '':
                break

            rows.append(row)


for row in rows:
    modbus = row[0]
    card_type = row[1]

    card_num = 1

    while True:
        if device_map[card_type + "-" + str(card_num)]:
            card_num += 1
        else:
            name = card_type + "-" + str(card_num)
            device_map[name] = ni.Device(
                                identifier="dev_mod" + str(modbus),
                                name=name,
                                model="NI " + card_type,
                                location="cDAQ1/dev_mod" + str(modbus),
                                rack=rack.key,
                            )
            

"""
# Configure device using the ni.Device class - each module is its own device
devices.append(ni.Device(
    identifier="dev_mod1",
    name="My NI Module",
    model="NI 9205",
    location="cDAQ1/dev_mod1",
    rack=rack.key,
))
devices.append(ni.Device(
    identifier="dev_mod2",
    name="My NI Module",
    model="NI 9205",
    location="cDAQ1/dev_mod1",
    rack=rack.key,
))
devices.append(ni.Device(
    identifier="dev_mod3",
    name="My NI Module",
    model="NI 9205",
    location="cDAQ1/dev_mod1",
    rack=rack.key,
))
devices.append(ni.Device(
    identifier="dev_mod4",
    name="My NI Module",
    model="NI 9205",
    location="cDAQ1/dev_mod1",
    rack=rack.key,
))
devices.append(ni.Device(
    identifier="dev_mod5",
    name="My NI Module",
    model="NI 9205",
    location="cDAQ1/dev_mod1",
    rack=rack.key,
))
devices.append(device = ni.Device(
    identifier="dev_mod6",
    name="My NI Module",
    model="NI 9205",
    location="cDAQ1/dev_mod1",
    rack=rack.key,
))
devices.append(ni.Device(
    identifier="dev_mod7",
    name="My NI Module",
    model="NI 9205",
    location="cDAQ1/dev_mod1",
    rack=rack.key,
))
devices.append(ni.Device(
    identifier="dev_mod8",
    name="My NI Module",
    model="NI 9205",
    location="cDAQ1/dev_mod1",
    rack=rack.key,
))
"""

# Create the devices in Synnax
for device in device_map:
    device = client.devices.create(device)

# # Or retrieve by model
# device = client.devices.retrieve(model="NI 9205")

# # Or retrieve by name
# device = client.devices.retrieve(name="My NI Module")

for device in device_map:
    print(f"Device configured: {device.name} (key={device.key})")

rows = []
channel_rows = False

channels = {}

channels["ai_time"] = client.channels.create(
    name="ai_time",
    is_index=True,
    data_type=sy.DataType.TIMESTAMP,
    retrieve_if_name_exists=True,
)

with open('pigtails.csv', newline='') as f:
    reader = csv.reader(f)
    for row in reader:
        if row[0] == "P&ID Name":
            channel_rows = True
            continue;
        if channel_rows:
            rows.append(row)


for row in rows:
    channels[row[0]] = client.channels.create(
        name=row[0],
        index=channels["ai_time"].key,
        data_type=sy.DataType.FLOAT32,
        retrieve_if_name_exists=True,
    )

print(channels);