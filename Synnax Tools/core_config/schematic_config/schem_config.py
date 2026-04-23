from pathlib import Path
import synnax as sy
import json


def configure_schematic():
    client = sy.Synnax(host="169.254.71.1",
        port=9091,
        username="synnax",
        password="seldon",
        secure=False
    )

    BASE_DIR = Path(__file__).resolve().parent
    file_name = "tpump_schem_4-23-26-2.json"
    file_path = BASE_DIR / "empty_schems" / file_name

    with open(file_path, 'r') as file:
        data = json.load(file)

    elements = data["props"]

    for element in elements.keys():
        if elements[element]["key"] == "value":
            #print(elements[element]["telem"]["props"]["segments"]["valueStream"]["props"]["channel"])
            
            label = elements[element]["label"]["label"]
            label = label.replace("-", "_")

            if label[:2] == "SN" or label[:2] == "ER":
                label = label + "_state"

            #print(label)

            try:
                elements[element]["telem"]["props"]["segments"]["valueStream"]["props"]["channel"] = client.channels.retrieve([label])[0].key
            except:
                print(f"Channel {label} not found in Synnax, skipping...")

            #print(elements[element]["telem"]["props"]["segments"]["valueStream"]["props"])
        elif elements[element]["key"] == "setpoint":
            label = elements[element]["label"]["label"]

            label = label.replace(" ", "_")
            label = label.replace("-", "_")

            try:
                elements[element]["sink"]["props"]["segments"]["setter"]["props"]["channel"] = client.channels.retrieve([label + "_cmd"])[0].key
                elements[element]["sink"]["props"]["segments"]["setter"]["props"]["channel"] = client.channels.retrieve([label + "_cmd"])[0].key
            except:
                print(f"Channel {label} not found in Synnax, skipping...")

        elif elements[element]["key"] == "solenoidValve" or elements[element]["key"] == "ballValve" or elements[element]["key"] == "switch" or elements[element]["key"] == "ejectorCompressor":
            #print(elements[element]["source"]["props"]["segments"]["valueStream"]["props"]["channel"])
            #print(elements[element]["sink"]["props"]["segments"]["setter"]["props"]["channel"])

            label = elements[element]["label"]["label"]

            if label == "SEQUENCE RUNNING":
                label = "seq_running"
                
                try:
                    channel_key = client.channels.retrieve([label])[0].key

                    elements[element]["source"]["props"]["segments"]["valueStream"]["props"]["channel"] = channel_key
                    elements[element]["sink"]["props"]["segments"]["setter"]["props"]["channel"] = channel_key
                except:
                    print(f"Channel {label} not found in Synnax, skipping...")

                continue
            
            elif label == "REDLINE TRIGGERED":
                label = "redline_triggered"
                
                try:
                    channel_key = client.channels.retrieve([label])[0].key

                    elements[element]["source"]["props"]["segments"]["valueStream"]["props"]["channel"] = channel_key
                    elements[element]["sink"]["props"]["segments"]["setter"]["props"]["channel"] = channel_key
                except:
                    print(f"Channel {label} not found in Synnax, skipping...")

                continue
            
            elif label == "BLUELINE TRIGGERED":
                label = "blueline_triggered"

                try:
                    channel_key = client.channels.retrieve([label])[0].key

                    elements[element]["source"]["props"]["segments"]["valueStream"]["props"]["channel"] = channel_key
                    elements[element]["sink"]["props"]["segments"]["setter"]["props"]["channel"] = channel_key
                except:
                    print(f"Channel {label} not found in Synnax, skipping...")

                continue

            elif label == "DATA LOGGING":
                label = "data_logging"

                try:
                    channel_key = client.channels.retrieve([label])[0].key

                    elements[element]["source"]["props"]["segments"]["valueStream"]["props"]["channel"] = channel_key
                    elements[element]["sink"]["props"]["segments"]["setter"]["props"]["channel"] = channel_key
                except:
                    print(f"Channel {label} not found in Synnax, skipping...")

                continue

            label = label.replace(" ", "_")
            label = label.replace("-", "_")

            #print(label)

            try:
                elements[element]["source"]["props"]["segments"]["valueStream"]["props"]["channel"] = client.channels.retrieve([label + "_state"])[0].key
                elements[element]["sink"]["props"]["segments"]["setter"]["props"]["channel"] = client.channels.retrieve([label + "_cmd"])[0].key
            except:
                print(f"Channel {label} not found in Synnax, skipping...")

        if elements[element]["key"] == "button":
            #print(elements[element]["source"]["props"]["segments"]["valueStream"]["props"]["channel"])
            #print(elements[element]["sink"]["props"]["segments"]["setter"]["props"]["channel"])
            label = elements[element]["label"]["label"]
            if label == "Start":
                label = "start_cmd"       
                try:
                    channel_key = client.channels.retrieve([label])[0].key
                    elements[element]["sink"]["props"]["segments"]["setter"]["props"]["channel"] = channel_key
                except:
                    print(f"Channel {label} not found in Synnax, skipping...")

                continue

            elif label == "ESTOP":
                label = "estop_cmd"
                try:
                    channel_key = client.channels.retrieve([label])[0].key
                    elements[element]["sink"]["props"]["segments"]["setter"]["props"]["channel"] = channel_key
                except:
                    print(f"Channel {label} not found in Synnax, skipping...")
                
                continue
            

            label = label.replace(" ", "_")
            label = label.replace("-", "_")

            #print(label)

            try:
                elements[element]["sink"]["props"]["segments"]["setter"]["props"]["channel"] = client.channels.retrieve([label + "_cmd"])[0].key
            except:
                print(f"Channel {label} not found in Synnax, skipping...")

    with open("./filled_schems/" + file_name, "w") as file:
        json.dump(data, file)

if __name__ == "__main__":
    configure_schematic()