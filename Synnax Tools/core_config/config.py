import csv
import synnax as sy
from synnax import ni

BASE_SR = 1000 # Hz
HIGH_SR = 150000 #Hz
STREAM_SR = 10 # Hz

# Connect to Synnax
client = sy.Synnax(host="",
    port=9091,
    username="synnax",
    password="seldon",
    secure=True
)

# Get the embedded rack (local driver rack)
rack = client.racks.retrieve_embedded_rack()

# modules = []
module_map = {} # Initialize from config file

rows = []
module_rows = False

with open('channel_config.csv', newline='') as f:
    reader = csv.reader(f)
    for row in reader:
        if row[0] == "cRIO Slot":
            module_rows = True
            continue
        if module_rows:
            if row[0] == '':
                break
            rows.append(row)

# Configure modules
for row in rows:
    modbus = row[0]
    card_type = row[1]

    card_num = 1

    while True:
        if module_map[card_type + "-" + str(card_num)]:
            card_num += 1
        else:
            name = card_type + "-" + str(card_num)
            module_map[name] = ni.Device(
                identifier="dev_mod" + str(modbus),
                name=name,
                model="NI " + card_type,
                location="cDAQ1/dev_mod" + str(modbus),
                rack=rack.key,
            )
            break
            

# Create the devices in Synnax
for module in module_map:
    device = client.devices.create(device)

for module in module_map:
    print(f"Device configured: {device.name} (key={device.key})")

rows = []
channel_rows = False

channels = {}

# Channel Objs
base_ai_channels = []
high_ai_channels = [] # Kulites

base_ao_channels = []

base_di_channels = []

base_do_channels = []

# Time Channel
channels["time_chan"] = client.channels.create(
    name="time_chan",
    is_index=True,
    data_type=sy.DataType.TIMESTAMP,
    retrieve_if_name_exists=True,
)

with open('channel_config.csv', newline='') as f:
    reader = csv.reader(f)
    for row in reader:
        if row[0] == "P&ID Name":
            channel_rows = True
            continue
        if channel_rows:
            rows.append(row)

for row in rows:
    if row[0] == "":
        continue

    device_type = row[1].split()[0]
    ni_route = row[2].split("-")
    module_name = ni_route[0] + "-" + ni_route[1]

    if device_type in "AI":
        channels[row[0]] = client.channels.create(
            name=row[0],
            index=channels["time_chan"].key,
            data_type=sy.DataType.FLOAT32,
            retrieve_if_name_exists=True,
        )
    elif device_type == "DI":
        # TODO
        print("DI to be implemented")
    elif device_type == "AO":
        channels[row[0] + "_cmd"] = client.channels.create(
            name=row[0] + "_cmd",
            index=channels["time_chan"].key,
            data_type=sy.DataType.FLOAT32,
            retrieve_if_name_exists=True,
        )
        channels[row[0] + "_state"] = client.channels.create(
            name=row[0] + "_state",
            index=channels["time_chan"].key,
            data_type=sy.DataType.FLOAT32,
            retrieve_if_name_exists=True,
        )
    elif device_type == "DO":
        channels[row[0] + "_cmd"] = client.channels.create(
            name=row[0] + "_cmd",
            index=channels["time_chan"].key,
            data_type=sy.DataType.FLOAT32,
            retrieve_if_name_exists=True,
        )
        channels[row[0] + "_state"] = client.channels.create(
            name=row[0] + "_state",
            index=channels["time_chan"].key,
            data_type=sy.DataType.FLOAT32,
            retrieve_if_name_exists=True,
        )
    else:
        raise ValueError("Device Type must be AI, AO, DI, or DO")

    # Add channel to appropriate array
    # Python switches do NOT fall through, no break required
    device_chan = None
    match device_type:
        case "AI":
            match ni_route[0]:
                case "NI9205":
                    if row[4] != "V":
                        raise Exception(f"Voltage/Current Type does not match card type, got {row[4]} but expecting 'V' for {ni_route[0]}")
                    if ni_route[1] == 1:
                        # Kulite card
                        high_ai_channels.append( ni.AIVoltageChan(
                            channel=channels[row[0]].key,
                            device=module_name.key,
                            port=ni_route[2],
                            min_val=float(row[5]),
                            max_val=float(row[6]),
                            terminal_config=row[7],
                        ))
                        continue
                    if row[7] not in {"Diff", "NRSE", "RSE"}:
                        raise ValueError("Unrecognized/Invalid NI Voltage AI Terminal Config")
                    device_chan = ni.AIVoltageChan(
                        channel=channels[row[0]].key,
                        device=module_name.key,
                        port=ni_route[2],
                        min_val=float(row[5]),
                        max_val=float(row[6]),
                        terminal_config=row[7],
                    )
                case "NI9213":
                    if row[4] != "V":
                        raise Exception(f"Voltage/Current Type does not match card type, got {row[4]} but expecting 'V' for {ni_route[0]}")
                    device_chan = ni.AIThermocoupleChan(
                        channel=channels[row[0]].key,
                        device=module_name.key,
                        port=ni_route[2],
                        units="DegC",
                        thermocouple_type="K",
                        cjc_source="BuiltIn"
                    )
                case "NI9203":
                    if row[4] != "C":
                        raise Exception(f"Voltage/Current Type does not match card type, got {row[4]} but expecting 'V' for {ni_route[0]}")
                    device_chan = ni.AICurrentChan(
                        channel=channels[row[0]].key,
                        device=module_name.key,
                        port=ni_route[2],
                        min_val=float(row[5]) * 0.001, # milliamps
                        max_val=float(row[6]) * 0.001, # milliamps
                    ),
                case _:
                    raise ValueError(f"Unrecognized/Invalid NI AI Card Type: {ni_route[0]}")
            if device_chan:
                base_ai_channels.append(device_chan)
            else:
                raise Exception("Failed to create AI device channel")
        case "AO":
            if row[4] != "V":
                raise Exception(f"Voltage/Current Type does not match card type, got {row[4]} but expecting 'V' for {ni_route[0]}")
            match ni_route[0]:
                case "NI9264":
                    device_chan = ni.AOVoltageChan(
                        cmd_channel=channels[row[0] + "_cmd"].key,
                        state_channel=channels[row[0] + "_state"].key,
                        device=module_name.key,
                        port=ni_route[2],
                        min_val=float(row[5]),
                        max_val=float(row[6]),
                    )
                case _:
                    raise ValueError("Unrecognized/Invalid NI Voltage AO Card Type")
        case "DI":
            # TODO
            print("Digital Input not implemented")
        case "DO":
            match ni_route[0]:
                case "NI9476":
                    device_chan = ni.DOChan(
                        cmd_channel=channels[row[0] + "_cmd"].key,
                        state_channel=channels[row[0] + "_state"].key,
                        device=module_name.key,
                        port=module_name.key,
                        line=ni_route[2]
                    )
                case _:
                    raise ValueError("Unrecognized/Invalid NI Voltage AO Card Type")
        case _:
            raise ValueError("Device Type must be AI, AO, DI, or DO")

print(channels)

tasks = []

# Create and configure tasks
base_ai_task = ni.AnalogReadTask(
    name="Base Speed Analog Read Task",
    sample_rate=sy.Rate.HZ * BASE_SR,
    stream_rate=sy.Rate.HZ * STREAM_SR,
    data_saving=True,
    channels=base_ai_channels,
)
tasks.append(base_ai_task)

high_ai_task = ni.AnalogReadTask(
    name="High Speed Analog Read Task",
    sample_rate=sy.Rate.HZ * HIGH_SR,
    stream_rate=sy.Rate.HZ * STREAM_SR,
    data_saving=True,
    channels=high_ai_channels,
)
tasks.append(high_ai_task)

base_ao_task = ni.AnalogWriteTask(
    name="Base Speed Analog Write Task",
    sample_rate=sy.Rate.HZ * BASE_SR,
    stream_rate=sy.Rate.HZ * STREAM_SR,
    data_saving=True,
    channels=base_ao_channels,
)
tasks.append(base_ao_task)

base_di_task = ni.DigitalWriteTask(
    name="Digital Write Task",
    sample_rate=sy.Rate.HZ * BASE_SR,
    stream_rate=sy.Rate.HZ * STREAM_SR,
    data_saving=True,
    channels=base_di_channels,
)
tasks.append(base_di_task)

base_do_task = ni.DigitaleadTask(
    name="Base Speed Digital Read Task",
    sample_rate=sy.Rate.HZ * BASE_SR,
    stream_rate=sy.Rate.HZ * STREAM_SR,
    data_saving=True,
    channels=base_do_channels,
)
tasks.append(base_do_task)

for task in tasks:
    client.tasks.configure(task)

### IDK WHAT THIS CODE DOES, MAYBE IT IS NEEDED TO START THE TASKS
# # Start task and read data
# with base_ai_task.run():
#     with client.open_streamer(["voltage_chan", "current_chan", "temp_chan"]) as streamer:
#         for _ in range(10):
#             frame = streamer.read()
#             print(frame)