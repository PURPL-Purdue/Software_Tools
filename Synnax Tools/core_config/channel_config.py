import synnax as sy
from synnax import ni

# Connect to Synnax
client = sy.Synnax()

# Get the embedded rack (local driver rack)
rack = client.racks.retrieve_embedded_rack()

# TODO POTENTIALLY REMOVE DEVICE CONFIGURATION IF IT IS AUTO CONFIGURED UPON CONNECTION
# Configure device using the ni.Device class
device_arr = []
device_map = {}

device_arr.append(ni.Device(
    identifier="9205-1",
    name="AI_Voltage_1",
    model="NI 9205",
    location="cDAQ1/dev_mod1",
    rack=rack.key,
))

device_map[device_arr[-1].name] = len(device_arr)

device_arr.append(ni.Device(
    identifier="9205-2",
    name="AI_Voltage_2",
    model="NI 9205",
    location="cDAQ1/dev_mod1",
    rack=rack.key,
))

device_map[device_arr[-1].name] = len(device_arr)

device_arr.append(ni.Device(
    identifier="9205-3",
    name="AI_Voltage_3",
    model="NI 9205",
    location="cDAQ1/dev_mod1",
    rack=rack.key,
))

device_map[device_arr[-1].name] = len(device_arr)

device_arr.append(ni.Device(
    identifier="9203-1",
    name="AI_Current_1",
    model="NI 9203",
    location="cDAQ1/dev_mod1",
    rack=rack.key,
))

device_map[device_arr[-1].name] = len(device_arr)

device_arr.append(ni.Device(
    identifier="9203-2",
    name="AI_Current_2",
    model="NI 9203",
    location="cDAQ1/dev_mod1",
    rack=rack.key,
))

device_map[device_arr[-1].name] = len(device_arr)

device_arr.append(ni.Device(
    identifier="9213-1",
    name="AI_TC_1",
    model="NI 9213",
    location="cDAQ1/dev_mod1",
    rack=rack.key,
))

device_map[device_arr[-1].name] = len(device_arr)

device_arr.append(ni.Device(
    identifier="dev_mod1",
    name="DO_24Voltage_1",
    model="NI 9476",
    location="cDAQ1/dev_mod1",
    rack=rack.key,
))

device_map[device_arr[-1].name] = len(device_arr)

device_arr.append(ni.Device(
    identifier="dev_mod1",
    name="AO_Voltage_1",
    model="NI 9264",
    location="cDAQ1/dev_mod1",
    rack=rack.key,
))

device_map[device_arr[-1].name] = len(device_arr)

devices = []

for device in device_arr: 
    devices.append(client.devices.create(device))

# Create the device in Synnax


print(f"Device configured: {device.name} (key={device.key})")

# Retrieve devices
v_dev = client.devices.retrieve(name="Mod1_Voltage")
c_dev = client.devices.retrieve(name="Mod2_Current")
tc_dev = client.devices.retrieve(name="Mod1_TC")


# Create index and data channels
ai_time = client.channels.create(
    name="ai_time",
    is_index=True,
    data_type=sy.DataType.TIMESTAMP,
    retrieve_if_name_exists=True,
)

ch_PT_N2_01 = client.channels.create(
	name="PT_N2_01",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_PT_N2_03 = client.channels.create(
	name="PT_N2_03",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_PT_N2_04 = client.channels.create(
	name="PT_N2_04",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_PT_N2_05 = client.channels.create(
	name="PT_N2_05",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_PT_N2_06 = client.channels.create(
	name="PT_N2_06",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_PT_GO2_01 = client.channels.create(
	name="PT_GO2_01",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_PT_GO2_02 = client.channels.create(
	name="PT_GO2_02",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_PT_GO2_03 = client.channels.create(
	name="PT_GO2_03",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_PT_H2_01 = client.channels.create(
	name="PT_H2_01",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_PT_H2_02 = client.channels.create(
	name="PT_H2_02",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_PT_N2_15 = client.channels.create(
	name="PT_N2_15",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_PT_N2_16 = client.channels.create(
	name="PT_N2_16",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_PT_N2_08 = client.channels.create(
	name="PT_N2_08",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_PT_N2_17 = client.channels.create(
	name="PT_N2_17",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_PT_N2_19 = client.channels.create(
	name="PT_N2_19",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_PT_FU_01_1 = client.channels.create(
	name="PT_FU_01_1",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_PT_FU_01_2 = client.channels.create(
	name="PT_FU_01_2",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_PT_N2_12 = client.channels.create(
	name="PT_N2_12",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_PT_GO2_05 = client.channels.create(
	name="PT_GO2_05",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_PT_GO2_04 = client.channels.create(
	name="PT_GO2_04",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_PT_H2_03 = client.channels.create(
	name="PT_H2_03",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_PT_FU_02 = client.channels.create(
	name="PT_FU_02",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
# TODO: 11x more PTs for T-PUMP

ch_SN_N2_12 = client.channels.create(
	name="SN_N2_12",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_SN_N2_11 = client.channels.create(
	name="SN_N2_11",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_SN_N2_10 = client.channels.create(
	name="SN_N2_10",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_SN_G02_05 = client.channels.create(
	name="SN_G02_05",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_SN_H2_03 = client.channels.create(
	name="SN_H2_03",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_SN_CO2_01 = client.channels.create(
	name="SN_CO2_01",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_SN_N2_13 = client.channels.create(
	name="SN_N2_13",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_SN_PV_N2_08 = client.channels.create(
	name="SN_PV_N2_08",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_SN_PV_N2_09 = client.channels.create(
	name="SN_PV_N2_09",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_SN_PV_N2_17 = client.channels.create(
	name="SN_PV_N2_17",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_SN_PV_N2_18 = client.channels.create(
	name="SN_PV_N2_18",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_SN_PV_N2_19 = client.channels.create(
	name="SN_PV_N2_19",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_SN_PV_N2_20 = client.channels.create(
	name="SN_PV_N2_20",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_SN_PV_LO2_03 = client.channels.create(
	name="SN_PV_LO2_03",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_SN_PV_LO2_05 = client.channels.create(
	name="SN_PV_LO2_05",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_SN_PV_LO2_01 = client.channels.create(
	name="SN_PV_LO2_01",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_SN_PV_G02_04 = client.channels.create(
	name="SN_PV_G02_04",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_SN_PV_FU_02 = client.channels.create(
	name="SN_PV_FU_02",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_SN_PV_FU_02 = client.channels.create(
	name="SN_PV_FU_02",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_SN_PV_LO2_04 = client.channels.create(
	name="SN_PV_LO2_04",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
# TODO: 2 more SN for t pump

ch_LC_01 = client.channels.create(
	name="LC_01",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_LC_02 = client.channels.create(
	name="LC_02",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_LC_03 = client.channels.create(
	name="LC_03",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)

ch_TC_LO2_03 = client.channels.create(
	name="TC_LO2_03",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_TC_FU_01 = client.channels.create(
	name="TC_FU_01",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_TC_GO2_05 = client.channels.create(
	name="TC_GO2_05",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_TC_GO2_04 = client.channels.create(
	name="TC_GO2_04",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_TC_H2_03 = client.channels.create(
	name="TC_H2_03",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_TC_FU_04 = client.channels.create(
	name="TC_FU_04",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
# TODO: 6 more TCs for T PUMP

ch_ER_N2_06 = client.channels.create(
	name="ER_N2_06",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
ch_ER_N2_07 = client.channels.create(
	name="ER_N2_07",
	index=ai_time.key,
	data_type=sy.DataType.FLOAT32,
	retrieve_if_name_exists=True,
)
