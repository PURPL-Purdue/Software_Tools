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
                sensors.append(row)

code_block = ""
task_block = """\ntask = ni.AnalogReadTask(
    name="Analog Read Task",
    sample_rate=sy.Rate.HZ * 100,
    stream_rate=sy.Rate.HZ * 25,
    data_saving=True,
    channels=[\n"""
write_task_block = """task = ni.AnalogWriteTask(
    name="Analog Write Task",
    state_rate=sy.Rate.HZ * 20,
    data_saving=True,
    channels=[\n"""

for sensor in sensors:
    sensor[1] = sensor[1].replace("-", "_")
    code_block = code_block + "ch_" + sensor[1] + " = client.channels.create(\n\tname=\"" + sensor[1] + "\",\n\tindex=ai_time.key,\n\tdata_type=sy.DataType.FLOAT32,\n\tretrieve_if_name_exists=True,\n)\n"
    
    if not "SN" in sensor[1]:
        if sensor[6] == "Voltage":
            if "TC" in sensor[1]:
                task_block += """        ni.AIThermoChan(
            channel=ch_""" + sensor[1] + """.key,
            device=<insert modbus id>,
            port=<insert port number>,
            units="DegC",
            thermocouple_type="J",
            cjc_source="BuiltIn",
        ),\n"""
            else:
                task_block += """        ni.AIVoltageChan(
            channel=ch_""" + sensor[1] + """.key,
            device=<insert modbus id>,
            port=<insert port number>,
            min_val=-10.0,
            max_val=10.0,
            terminal_config="Diff",
        ),\n"""
        elif sensor[6] == "Current":
            task_block += """        ni.AICurrentChan(
            channel=ch_""" + sensor[1] + """.key,
            device=<insert modbus id>,
            port=<insert port number>,
            min_val=0.004,
            max_val=0.02,
        ),\n"""
    
    else:
        code_block = code_block + "ch_" + sensor[1] + "_state = client.channels.create(\n\tname=\"" + sensor[1] + "\",\n\tindex=ai_time.key,\n\tdata_type=sy.DataType.FLOAT32,\n\tretrieve_if_name_exists=True,\n)\n"
        write_task_block += """        ni.AOCurrentChan(
            cmd_channel=ch_""" + sensor[1] + """,
            state_channel=ch_""" + sensor[1] + """_state,
            device=<insert modbus id>,
            port=<insert port number>,
            min_val=<insert min amps>,
            max_val=<insert max amps>,
        ),\n"""
        
        

task_block += """    ],
)\n"""

write_task_block += """    ],
)"""

code_block += task_block + "\n" + write_task_block

pyperclip.copy(code_block)