import synnax as sy
from synnax import ni

# Connect to Synnax
client = sy.Synnax()

# Get the embedded rack (local driver rack)
rack = client.racks.retrieve_embedded_rack()

devices = []
device_map = {} # Initialize from config file

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

# Create the devices in Synnax
for device in devices:
    device = client.devices.create(device)

# # Or retrieve by model
# device = client.devices.retrieve(model="NI 9205")

# # Or retrieve by name
# device = client.devices.retrieve(name="My NI Module")

for device in devices:
    print(f"Device configured: {device.name} (key={device.key})")
