import csv
import sys
import pyperclip
import time
import synnax as sy
from itertools import islice
import threading

client = sy.Synnax(
        host="localhost",
        port=9091,
        username="synnax",
        password="seldon",
)

write_lock = threading.Lock()

def strip_comment(line):
    return line.split("/", 1)[0].rstrip()

def preprocess_file(path):
    with open(path, newline="") as f:
        cleaned = (strip_comment(line) for line in f)
        reader = csv.reader(cleaned)

        sequence = []
        redline_devices = []
        redline_values = []
        redline_table = {}
        time_offsets = []
        devices = []

        new_seq = True
        seq_name = None
        seq_list = []
        sequences_dict = {}

        has_redline_seq = False

        last_time = -1

        for i, row in enumerate(reader):
            sequence.append(row)

            if i == 0 and row[0] != "Limits":
                print(row[0])
                return (False, "Error: missing Limits flag")
            if i == 1:
                for j, value in enumerate(row):
                    row[j] = value.replace("-", "_")
                redline_devices = row
            if i == 2:
                if len(row) != len(redline_devices):
                    return (False, "Error: number of redline devices does not match number of redlines in row 3")
                for j, value in enumerate(row):
                    if int(value) != -1 and int(value) < 0:
                        return (False, "Error: invalid redline value for device " + redline_devices[j])
                redline_values = row
            
            
            if i == 3:
                if (row[0] != "Timestamp (ms)"):
                    return (False, "Error: no timestamp header element")

                for j, value in enumerate(row[1:]):
                    row[j + 1] = value.replace("-", "_")
                devices = row[1:]

                print("Input Devices: " + str(devices))

            if i == 4:
                if (len(row) > 1):
                    return (False, "Error: Missing Main sequence start in row " + str(i + 1))

            if (i >= 4):
                if row[0] == "END":
                    if len(row) > 2:
                        return (False, "Error: END statement should specify function name at row " + str(i + 1))
                    if row[1] != seq_name:
                        return (False, "Error: END statement should terminate " + seq_name + " but terminates " + row[1] + " at row " + str(i + 1))
                    
                    new_seq = True
                    continue

                if new_seq:
                    if (len(row) > 1):
                        return (False, "Error: Missing sequence start in row " + str(i + 1))
                    seq_name = row[0]

                    seq_list.append(seq_name)
                    sequences_dict[seq_name] = i + 1

                    if seq_name == "Redline":
                        has_redline_seq = True

                    if len(row) > 1:
                        return (False, "Error: Start of sequence should only have one column at row " + str(i + 1))
                    
                    last_time = -1
                    new_seq = False
                    continue

                if int(row[0]) < 0:
                    return (False, "Error: Negative timestamp in row " + str(i + 1))

                if int(row[0]) <= last_time: # Check to make sure times happen in chronological order
                    return (False, "Error: time out of order in row " + str(i + 1))
                
                #if (last_time != -1):
                #    time_offsets.append(int(row[0]) - last_time)
                
                last_time = int(row[0])

                if "BLUELINE" not in row[1]:
                    for element in row:
                        try: # Logic to check if the value is an integer (valid)
                            x = int(element)
                        except ValueError:
                            return (False, "Error: non-integer element in row " + str(i + 1))
                        
                    if len(row[1:]) != len(devices):
                        return (False, "Error: Invalid input field length in row " + str(i + 1))
            
                    for num in row[1:]: # Check for digital input for solenoids
                        if (int(num) < 0 or int(num) > 1):
                            return (False, "Error: invalid input on row " + str(i + 1))
                else:
                    if len(row) != 6:
                        return (False, "Error: invalid length for check condition in row " + str(i + 1))
                    
                    if row[2] != "LOWER" and row[2] != "UPPER":
                        return (False, "Error: " + str(row[2]) + " is not a proper redline condition. Please use LOWER or UPPER. Row " + str(i + 1))

                    if row[3].replace("-", "_") not in redline_devices:
                        return (False, "Error: Check on non-existent device in row " + str(i + 1))
                    
                    try: # Logic to check if the check value is an integer (valid)
                        x = int(row[4])
                    except ValueError:
                        return (False, "Error: non-integer check value in row " + str(i + 1))
                    
                    # TODO: Add check to make sure referenced sequence exists (shouldn't be necessary)
        
        if not has_redline_seq:
            return (False, "Error: File contains no redline sequence")
        if not new_seq:
            return (False, "Error: did not terminate sequence " + str(seq_name) + " with an END")

        for device in redline_devices:
            redline_table[device] = redline_values[redline_devices.index(device)]
                    
        return (True, redline_table, devices, sequences_dict, sequence)
                    
            
def parse_main_sequence(path="test.csv",start_seq="Main"):
    validation = preprocess_file(path)

    redline_devices = []
    input_devices = []

    if (validation[0]):
        isValid, redline_table, input_devices, sequences_dict, sequence = validation
        print(sequences_dict)
    else:
        print(validation[1])
        return
    

    for key in redline_table:
        redline_devices.append(key)

    print(redline_devices)
    
    """with open("test.csv", newline="") as f:
        reader = csv.reader(f)
        sequence = list(reader)"""

    print(sequence)

    cur_seq = start_seq

    redline_thread = threading.Thread(target=check_redlines, args=(redline_table, input_devices, sequences_dict, sequence))

    # Open the controller
    with client.control.acquire(
        name="execution_thread",
        read=redline_devices,
        write=input_devices,
        write_authorities=[254]
    ) as controller:
        if not cur_seq:
            cur_seq = client.sequences.get("Main")

        cur_line = sequences_dict[cur_seq]

        while True:
            if write_lock.locked():
                return
            
            row = sequence[cur_line]

            if "BLUELINE" not in row[1]:
                with write_lock:
                    for i, value in enumerate(row[1:]):
                        controller[input_devices[i] + "_cmd"] = int(value)
            else:
                condition = row[2]
                device = row[3].replace("-", "_")
                value = int(row[4])
                if condition == "LOWER":
                    if int(controller[device]) < value:
                        cur_line = sequences_dict[row[5]] # Jump to specified sequence if condition is met
                else:
                    if int(controller[device]) > value:
                        cur_line = sequences_dict[row[5]] # Jump to specified sequence if condition is met

            delay = -1

            if sequence[cur_line + 1][0] != "END": # Check to make sure we aren't trying to read a timestamp from an END statement
                delay = int(sequence[cur_line + 1][0]) - int(row[0])
                time.sleep(delay / 1000)
            else:
                break
                
            cur_line += 1

def do_redline(redline_devices, input_devices, sequences_dict, sequence):
    with client.control.acquire(
        name="Hello",
        read=redline_devices,
        write=input_devices,
        write_authorities=[255]
    ) as controller:
        cur_row = sequences_dict["Redline"]

        with write_lock:
            while True:
                row = sequence[cur_row]

                for i, value in enumerate(row[1:]):
                    controller[input_devices[i] + "_cmd"] = int(value)

                if sequence[cur_row + 1][0] != "END":
                    time.sleep((int(sequence[cur_row + 1]) - int(row[0])) / 1000)
                else:
                    break

                cur_row += 1

def check_redlines(redline_table, input_devices, sequences_dict, sequence):
    with client.control.acquire(
        name="redline_check_thread",
        read=redline_table.keys(),
        write=[],
        write_authorities=[]
    ) as controller:
        frame = []

        while True:
            all_device_values = []

            for device in redline_table.keys():
                all_device_values.append(controller[device])

            if len(frame) < 100:
                frame.append(all_device_values)
            else:
                frame.pop(0)
                frame.append(all_device_values)

            totals = []
            for ind in range(len(frame[0])):
                totals.append(sum(frame[j][ind] for j in range(len(frame))))

                # Check against redline
                if int(totals[ind] / len(frame)) > int(list(redline_table.values())[ind]):
                    do_redline(redline_table.keys(), input_devices, sequences_dict, sequence)
                    return

            
        
        

if __name__ == "__main__":
    # Check if at least one argument (besides the script name) is provided
    print("Hello World")
    if len(sys.argv) > 2:
        path = sys.argv[1]
        start_seq = sys.argv[2]
        parse_main_sequence(path, start_seq)
    else:
        parse_main_sequence