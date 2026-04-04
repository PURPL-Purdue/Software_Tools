import csv
import synnax as sy
from synnax import ni

BASE_SR = 1000 # Hz
HIGH_SR = 150000 #Hz

STATE_SR = 150 # Hz
STREAM_SR = 10 # Hz

# Connect to Synnax
client = sy.Synnax(host="localhost",
    port=9091,
    username="synnax",
    password="seldon",
    secure=False
)

# # Get the embedded rack (local driver rack)
# rack = client.racks.retrieve_embedded_rack()

# Get the cRIO rack
rack = client.racks.retrieve(name="NI-cRIO-9056-01DCA43E")

# Channel Objs
ai_mod_chan_map = {} # AI channels for the same task must live on the same device, so this is an array of channel arrays
ai_modules = [] # Track which modules have AI channels for task configuration, should all be on same module but just in case

ao_mod_chan_map = {} # AO channels for the same task must live on the same device, so this is an array of channel arrays
ao_modules = [] # Track which modules have AO channels for task configuration

di_mod_chan_map = {} # DI channels for the same task must live on the same device, so this is an array of channel arrays
di_modules = [] # Track which modules have DI channels for task configuration

do_mod_chan_map = {} # DO channels for the same task must live on the same device, so this is an array of channel arrays
do_modules = [] # Track which modules have DO channels for task configuration

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
        if module_map.get("NI" + card_type + "_" + str(card_num)):
            card_num += 1
        else:
            name = "NI" + card_type + "_" + str(card_num)
            match card_type:
                case "9205":
                    print("Configuring NI 9205 AI Card")
                    if ai_mod_chan_map.get(name):
                        raise Exception(f"Duplicate module name in config: {name}")
                    ai_mod_chan_map[name] = []
                    # TODO: The following comment is untrue for now, due to synnax double port 0 bind error
                    # AI so no need to add a new channel array, all AI channels can be in the same task/device
                case "9213":
                    print("Configuring NI 9213 Thermocouple Card")
                    if ai_mod_chan_map.get(name):
                        raise Exception(f"Duplicate module name in config: {name}")
                    ai_mod_chan_map[name] = []
                    # TODO: The following comment is untrue for now, due to synnax double port 0 bind error
                    # AI so no need to add a new channel array, all AI channels can be in the same task/device
                case "9203":
                    print("Configuring NI 9203 Current Card")
                    if ai_mod_chan_map.get(name):
                        raise Exception(f"Duplicate module name in config: {name}")
                    ai_mod_chan_map[name] = []
                    # TODO: The following comment is untrue for now, due to synnax double port 0 bind error
                    # AI so no need to add a new channel array, all AI channels can be in the same task/device
                case "9264":
                    print("Configuring NI 9264 AO Card")
                    if ao_mod_chan_map.get(name):
                        raise Exception(f"Duplicate module name in config: {name}")
                    ao_mod_chan_map[name] = []
                    # base_ao_modules.append(name) # Track module for task config
                case "9476":
                    print("Configuring NI 9476 DO Card")
                    if do_mod_chan_map.get(name):
                        raise Exception(f"Duplicate module name in config: {name}")
                    do_mod_chan_map[name] = []
                    # base_do_modules.append(name) # Track module for task config
                case _:
                    raise ValueError(f"Unrecognized/Invalid NI Card Type: {card_type}")
            print(f"Adding module {name} with modbus {modbus} to rack {rack.name}")
            module_map[name] = client.devices.retrieve(location="Mod" + str(modbus))
            module_map[name].name = name
            module_map[name].properties["identifier"] = "Mod" + str(modbus)
            # module_map[name] = ni.Device(
            #     identifier="Mod" + str(modbus),
            #     name=name,
            #     model="NI " + card_type,
            #     location="Mod" + str(modbus),
            #     rack=rack.key,
            # )
            break
            
# Create the devices in Synnax
for module in module_map:
    created = client.devices.create(module_map[module])
    module_map[module] = created

for module in module_map.values():
    print(f"Device configured: {module.name} (key={module.key})")

rows = []
channel_rows = False

channels = {}

# Time Channel
channels["time_chan"] = client.channels.create(
    name="time_chan",
    is_index=True,
    data_type=sy.DataType.TIMESTAMP,
    retrieve_if_name_exists=True,
)

# Check if analog/digital time should be different, using same channel for now

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
    if row[3] == "NC":
        continue

    device_type = row[1].split()[0]
    print(f"Configuring channel {row[0]} of type {device_type}")
    ni_route = row[2].split("_")
    module_name = ni_route[0] + "_" + ni_route[1]

    if device_type == "AI":
        channels[row[0]] = client.channels.create(
            name=row[0],
            index=channels["time_chan"].key,
            data_type=sy.DataType.FLOAT32,
            retrieve_if_name_exists=True,
        )
    elif device_type == "DI":
        channels[row[0]] = client.channels.create(
            name=row[0],
            index=channels["time_chan"].key,
            data_type=sy.DataType.UINT8,
            retrieve_if_name_exists=True,
        )
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
            data_type=sy.DataType.UINT8,
            retrieve_if_name_exists=True,
        )
        channels[row[0] + "_state"] = client.channels.create(
            name=row[0] + "_state",
            index=channels["time_chan"].key,
            data_type=sy.DataType.UINT8,
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
                    if row[7] not in {"Diff", "NRSE", "RSE"}:
                        raise ValueError("Unrecognized/Invalid NI Voltage AI Terminal Config")
                    # TODO: Implement custom scaling
                    device_chan = ni.AIVoltageChan(
                        channel=channels[row[0]].key,
                        device=module_map[module_name].key,
                        port=int(ni_route[2]),
                        min_val=float(row[5]),
                        max_val=float(row[6]),
                        terminal_config=row[7],
                    )
                case "NI9213":
                    if row[4] != "V":
                        raise Exception(f"Voltage/Current Type does not match card type, got {row[4]} but expecting 'V' for {ni_route[0]}")
                    device_chan = ni.AIThermocoupleChan(
                        channel=channels[row[0]].key,
                        device=module_map[module_name].key,
                        port=int(ni_route[2]),
                        units="DegC",
                        thermocouple_type="K",
                        cjc_source="BuiltIn"
                    )
                case "NI9203":
                    if row[4] != "C":
                        raise Exception(f"Voltage/Current Type does not match card type, got {row[4]} but expecting 'V' for {ni_route[0]}")
                    device_chan = ni.AICurrentChan(
                        channel=channels[row[0]].key,
                        device=module_map[module_name].key,
                        port=int(ni_route[2]),
                        min_val=float(row[5]) * 0.001, # milliamps
                        max_val=float(row[6]) * 0.001, # milliamps
                        shunt_resistor_loc="Internal",
                        ext_shunt_resistor_val=1
                    )
                case _:
                    raise ValueError(f"Unrecognized/Invalid NI AI Card Type: {ni_route[0]}")
            if device_chan:
                ai_mod_chan_map[module_name].append(device_chan)
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
                        port=int(ni_route[2]),
                        units="Volts",
                        min_val=float(row[5]),
                        max_val=float(row[6]),
                    )
                case _:
                    raise ValueError("Unrecognized/Invalid NI Voltage AO Card Type")
            if device_chan:
                ao_mod_chan_map[module_name].append(device_chan)
            else:
                raise Exception("Failed to create AO device channel")
        case "DI":
            # TODO
            print("Digital Input not implemented")
        case "DO":
            match ni_route[0]:
                case "NI9476":
                    device_chan = ni.DOChan(
                        cmd_channel=channels[row[0] + "_cmd"].key,
                        state_channel=channels[row[0] + "_state"].key,
                        port=0,
                        line=int(ni_route[2])
                    )
                case _:
                    raise ValueError("Unrecognized/Invalid NI Voltage AO Card Type")
            if device_chan:
                do_mod_chan_map[module_name].append(device_chan)
            else:
                raise Exception("Failed to create DO device channel")
        case _:
            raise ValueError("Device Type must be AI, AO, DI, or DO")

# print(channels)

tasks = []

# print(f"DEVICE FOR AI MODULE: {module_map['NI9205_2']}")
# chan_set = set()
# for chan in base_ai_channels:
#     print(f"AI Channel: {chan.channel}, Device: {chan.device}, Port: {chan.port}")
#     if (chan.device, chan.port) in chan_set:
#         raise Exception(f"Duplicate channel in base_ai_channels: {chan.channel}")
#     chan_set.add((chan.device, chan.port))
# print("CLEAR DUPES")
# print(f"BASE AI CHANNELS: {base_ai_mod_chan_map[module_name]}")

# Create and configure tasks
for module_name, channels in ai_mod_chan_map.items():
    ai_task = None
    if module_name == "NI9205_1":
        # Kulite tasks need to run at high speed for pressure data, so configure a separate task for them
        ai_task = ni.AnalogReadTask(
            name=f"High Speed Analog Read Task for {module_name}",
            sample_rate=sy.Rate.HZ * HIGH_SR,
            stream_rate=sy.Rate.HZ * STREAM_SR,
            device=module_map[module_name].key,
            data_saving=True,
            channels=channels,
        )
    else:
        ai_task = ni.AnalogReadTask(
            name=f"Base Speed Analog Read Task for {module_name}",
            sample_rate=sy.Rate.HZ * BASE_SR,
            stream_rate=sy.Rate.HZ * STREAM_SR,
            device=module_map["NI9205_2"].key,
            data_saving=True,
            channels=channels,
        )
    if not ai_task:
        raise Exception(f"Failed to create AI task for module {module_name}")
    tasks.append(ai_task)

# print(f"BASE AO CHANNELS: {base_ao_channels}")
for module_name, channels in ao_mod_chan_map.items():
    ao_task = ni.AnalogWriteTask(
        name=f"Analog Write for Card AO {module_name} Task",
        state_rate=sy.Rate.HZ * STATE_SR,
        device=module_map[module_name].key, # Get device from module tracking array
        data_saving=True,
        channels=channels,
    )
    if not ao_task:
        raise Exception(f"Failed to create AO task for module {module_name}")
    tasks.append(ao_task)

# base_di_task = ni.DigitalReadTask(
#     name="Digital Read Task",
#     sample_rate=sy.Rate.HZ * BASE_SR,
#     stream_rate=sy.Rate.HZ * STREAM_SR,
#     data_saving=True,
#     channels=base_di_channels,
# )
# tasks.append(base_di_task)

for module_name, channels in do_mod_chan_map.items():
    do_task = ni.DigitalWriteTask(
        name=f"Digital Write for Card DO {module_name} Task",
        state_rate=sy.Rate.HZ * STATE_SR,
        device=module_map[module_name].key, # Get device from module tracking array
        data_saving=True,
        channels=channels,
    )
    if not do_task:
        raise Exception(f"Failed to create DO task for module {module_name}")
    tasks.append(do_task)

for task in tasks:
    try:
        print(f"Configuring task: {task.name}, device={getattr(task, 'device', None)}")
        client.tasks.configure(task)
    except Exception as e:
        print(f"FAILED TASK: {task.name}")
        raise
### IDK WHAT THIS CODE DOES, MAYBE IT IS NEEDED TO START THE TASKS
### Hmmm, I think we need to do task_name.run() for each task, the other bit is just reading a frame of data
# # Start task and read data
# with base_ai_task.run():
#     with client.open_streamer(["voltage_chan", "current_chan", "temp_chan"]) as streamer:
#         for _ in range(10):
#             frame = streamer.read()
#             print(frame)


### This should be sufficient to start all the tasks, GUI might be better for start though for speed toggling
'''
for task in tasks:
    if task.name == "High Speed Analog Read Task":
        continue

    task.run()
'''