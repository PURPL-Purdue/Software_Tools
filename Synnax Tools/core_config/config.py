import csv
import time
import numpy as np
import synnax as sy
from synnax import ni
from collections import deque

BASE_SR = 1000 # Hz
HIGH_SR = 150000 # Hz
TC_SR = 80 # Hz 

STATE_SR = 150 # Hz
STREAM_SR = 50 # Hz
TC_STREAM_SR = 20 # Hz, thermocouple data is slower changing so can stream at a lower rate to reduce CPU load and risk of dropped samples

CHASSIS = "NI-cRIO-9056-01DCA43E"

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
client.tasks._default_rack = rack  # Route tasks to the cRIO rack, not the embedded Windows rack

# Delete all existing tasks
# Potentially all channels too since retrieve_if_name_exists doesn't seem to work
existing_tasks = client.tasks.list()
for task in existing_tasks:
    try:
        task.execute_command("stop")
    except Exception:
        pass
time.sleep(2)  # Wait for cRIO to stop tasks and release NI hardware resources before deleting
client.tasks.delete([task.key for task in existing_tasks])
time.sleep(2)  # Wait for cRIO to fully release resources before creating new tasks

# Channel Objs
ai_mod_chan_map = {} # AI channels for the same task must live on the same device, so this is an array of channel arrays

ao_mod_chan_map = {} # AO channels for the same task must live on the same device, so this is an array of channel arrays

di_mod_chan_map = {} # DI channels for the same task must live on the same device, so this is an array of channel arrays

do_mod_chan_map = {} # DO channels for the same task must live on the same device, so this is an array of channel arrays

channels = {}

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
            # Appropriate Time Channel
            channels["time_chan" + name] = client.channels.create(
                name="time_chan" + name,
                is_index=True,
                data_type=sy.DataType.TIMESTAMP,
                retrieve_if_name_exists=True,
            )
            print(f"Adding module {name} with modbus {modbus} to rack {rack.name}")
            full_location = "Mod" + str(modbus)
            device = client.devices.retrieve(location=full_location, ignore_not_found=True)
            if device is None:
                device = client.devices.retrieve(location=CHASSIS + "Slot" + str(modbus), ignore_not_found=True)
            if device is None:
                device = client.devices.retrieve(location=CHASSIS + "Mod" + str(modbus))
            module_map[name] = device
            module_map[name].location = full_location
            module_map[name].name = name
            break
            
# Create the devices in Synnax
for module in module_map:
    created = client.devices.create(module_map[module])
    module_map[module] = created

for module in module_map.values():
    print(f"Device configured: {module.name} (key={module.key})")

rows = []
channel_rows = False


# start_cmd and estop_cmd
channels["start_cmd"] = client.channels.create(
    name="start_cmd",
    data_type=sy.DataType.UINT8,
    virtual=True,
    retrieve_if_name_exists=True,
)

channels["estop_cmd"] = client.channels.create(
    name="estop_cmd",
    data_type=sy.DataType.UINT8,
    virtual=True,
    retrieve_if_name_exists=True,
)

channels["seq_running"] = client.channels.create(
    name="seq_running",
    data_type=sy.DataType.UINT8,
    virtual=True,
    retrieve_if_name_exists=True,
)

channels["redline_triggered"] = client.channels.create(
    name="redline_triggered",
    data_type=sy.DataType.UINT8,
    virtual=True,
    retrieve_if_name_exists=True,
)

channels["blueline_triggered"] = client.channels.create(
    name="blueline_triggered",
    data_type=sy.DataType.UINT8,
    virtual=True,
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
    if row[3] == "NC":
        continue

    device_type = row[1].split()[0]
    print(f"Configuring channel {row[0]} of type {device_type}")
    ni_route = row[2].split("_")
    module_name = ni_route[0] + "_" + ni_route[1]

    if device_type == "AI" or device_type == "TC":
        channels[row[0]] = client.channels.create(
            name=row[0],
            index=channels["time_chan" + module_name].key,
            data_type=sy.DataType.FLOAT32,
            retrieve_if_name_exists=True,
        )
    elif device_type == "DI":
        channels[row[0]] = client.channels.create(
            name=row[0],
            index=channels["time_chan" + module_name].key,
            data_type=sy.DataType.UINT8,
            retrieve_if_name_exists=True,
        )
    elif device_type == "AO":
        # CHANGED: cmd channels now use a per-channel time index instead of the shared module index.
        # Previously: index=channels["time_chan" + module_name].key for both cmd and state.
        # Reason: Synnax requires ALL channels sharing an index to be written in the same frame.
        # With a shared index, clicking one schematic switch would fail because it's missing
        # the other cmd channels. Each cmd channel now has its own index so writes are independent.
        # To revert: remove the _cmd_time channel creation and change cmd index back to
        # channels["time_chan" + module_name].key (same as state channel).
        channels[row[0] + "_cmd_time"] = client.channels.create(
            name=row[0] + "_cmd_time",
            is_index=True,
            data_type=sy.DataType.TIMESTAMP,
            retrieve_if_name_exists=True,
        )
        channels[row[0] + "_cmd"] = client.channels.create(
            name=row[0] + "_cmd",
            index=channels[row[0] + "_cmd_time"].key,
            data_type=sy.DataType.FLOAT32,
            retrieve_if_name_exists=True,
        )
        channels[row[0] + "_state"] = client.channels.create(
            name=row[0] + "_state",
            index=channels["time_chan" + module_name].key,
            data_type=sy.DataType.FLOAT32,
            retrieve_if_name_exists=True,
        )
    elif device_type == "DO":
        # CHANGED: same as AO above — per-channel time index for cmd, shared module index for state.
        # To revert: remove _cmd_time creation and change cmd index back to
        # channels["time_chan" + module_name].key.
        channels[row[0] + "_cmd_time"] = client.channels.create(
            name=row[0] + "_cmd_time",
            is_index=True,
            data_type=sy.DataType.TIMESTAMP,
            retrieve_if_name_exists=True,
        )
        channels[row[0] + "_cmd"] = client.channels.create(
            name=row[0] + "_cmd",
            index=channels[row[0] + "_cmd_time"].key,
            data_type=sy.DataType.UINT8,
            retrieve_if_name_exists=True,
        )
        channels[row[0] + "_state"] = client.channels.create(
            name=row[0] + "_state",
            index=channels["time_chan" + module_name].key,
            data_type=sy.DataType.UINT8,
            retrieve_if_name_exists=True,
        )
    else:
        raise ValueError("Device Type must be AI, AO, DI, or DO")

    # Add channel to appropriate array
    # Python switches do NOT fall through, no break required
    device_chan = None
    match device_type:
        case "AI" | "TC":
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
                        custom_scale=ni.LinScale(
                            slope = float(row[12]) * (float(row[9]) - float(row[8])) / (float(row[6]) - float(row[5])), # Map the voltage range to the engineering unit range
                            y_intercept = float(row[11]),
                            pre_scaled_units = "Volts",
                            scaled_units = row[10],
                        )
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
                        cjc_source="BuiltIn",
                        cjc_port=0,
                        cjc_val=0,
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
                        ext_shunt_resistor_val=1,
                        custom_scale=ni.LinScale(
                            slope = float(row[12]) * (float(row[9]) - float(row[8])) / (float(row[6]) * 0.001 - float(row[5]) * 0.001), # Map the voltage range to the engineering unit range
                            y_intercept = float(row[11]),
                            pre_scaled_units = "Amps",
                            scaled_units = row[10],
                        )
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
                    # NI requires pre_scaled_units="Volts" when units="Volts" on AO channels.
                    # So the scale goes Volts (cmd input) → engineering units (state readback).
                    # Write cmd_channel in Volts; state_channel reads back in engineering units.
                    device_chan = ni.AOVoltageChan(
                        cmd_channel=channels[row[0] + "_cmd"].key,
                        state_channel=channels[row[0] + "_state"].key,
                        port=int(ni_route[2]),
                        units= "Volts",
                        min_val=float(row[5]),
                        max_val=float(row[6]),
                        custom_scale=ni.LinScale(
                            slope = float(row[12]) * (float(row[9]) - float(row[8])) / (float(row[6]) - float(row[5])), # Volts → engineering units
                            y_intercept = float(row[11]),
                            pre_scaled_units = "Volts",  # NI requires this to match channel units
                            scaled_units = row[10],       # Engineering units for state readback
                        )
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

# Create and configure tasks
for module_name, channel_arr in ai_mod_chan_map.items():
    if not channel_arr:                                                                                                                                
        print(f"Skipping task for {module_name}: no channels configured")                                                                           
        continue 
    ai_task = None
    if module_name == "NI9205_1":
        # Kulite tasks need to run at high speed for pressure data, so configure a separate task for them
        ai_task = ni.AnalogReadTask(
            name=f"High Speed Analog Read Task for {module_name}",
            sample_rate=sy.Rate.HZ * HIGH_SR,
            stream_rate=sy.Rate.HZ * STREAM_SR,
            device=module_map[module_name].key,
            data_saving=True,
            channels=channel_arr,
        )
    elif module_name.split("_")[0] == "NI9213":
        # Thermocouple tasks can run at a lower rate since temp changes more slowly, and this reduces CPU load and risk of dropped samples
        ai_task = ni.AnalogReadTask(
            name=f"Thermocouple Analog Read Task for {module_name}",
            sample_rate=sy.Rate.HZ * TC_SR,
            stream_rate=sy.Rate.HZ * TC_STREAM_SR,
            device=module_map[module_name].key,
            data_saving=True,
            channels=channel_arr,
        )
    else:
        ai_task = ni.AnalogReadTask(
            name=f"Base Speed Analog Read Task for {module_name}",
            sample_rate=sy.Rate.HZ * BASE_SR,
            stream_rate=sy.Rate.HZ * STREAM_SR,
            device=module_map[module_name].key,
            data_saving=True,
            channels=channel_arr,
        )
    if not ai_task:
        raise Exception(f"Failed to create AI task for module {module_name}")
    tasks.append(ai_task)

# print(f"BASE AO CHANNELS: {base_ao_channels}")
for module_name, channel_arr in ao_mod_chan_map.items():
    ao_task = ni.AnalogWriteTask(
        name=f"Analog Write for Card AO {module_name} Task",
        state_rate=sy.Rate.HZ * STATE_SR,
        device=module_map[module_name].key, # Get device from module tracking array
        data_saving=True,
        channels=channel_arr,
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

for module_name, channel_arr in do_mod_chan_map.items():
    do_task = ni.DigitalWriteTask(
        name=f"Digital Write for Card DO {module_name} Task",
        state_rate=sy.Rate.HZ * STATE_SR,
        device=module_map[module_name].key, # Get device from module tracking array
        data_saving=True,
        channels=channel_arr,
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

### This should be sufficient to start all the tasks, GUI might be better for start though for speed toggling
for task in tasks:
    task.start()

all_ai_channels_buffers = {}
all_ai_channels_names = []

med_ai_channels_names = []

for channel_array in ai_mod_chan_map.values():
    for channel in channel_array:
        print("Adding channel to buffer tracking and med channel creation: " + client.channels.retrieve(channel.channel).name)
        all_ai_channels_names.append(client.channels.retrieve(channel.channel).name)

import json

for channel_name in all_ai_channels_names:
    channels[channel_name + "_med"] = client.channels.create(
        name=channel_name + "_med",
        data_type=sy.DataType.FLOAT32,
        virtual=True,
        retrieve_if_name_exists=True,
    )

    med_ai_channels_names.append(channel_name + "_med")
    all_ai_channels_buffers[channel_name] = deque(maxlen=9)

# Export channel names so run_median.py can start independently
with open("median_channels.json", "w") as f:
    json.dump({"ai_channels": all_ai_channels_names, "med_channels": med_ai_channels_names}, f, indent=2)
print("Exported median channel config to median_channels.json")

print("Configuration complete. Run run_median.py to start the median channel writer.")
