import csv
import os
import sys

def strip_comment(line):
    return line.split("/", 1)[0].rstrip()

def preprocess_file(path):
    print("Parsing file: " + path)
    with open(path, newline="") as f:
        cleaned = (strip_comment(line) for line in f)
        reader = csv.reader(cleaned)

        redline_devices = []
        redline_values = []
        redline_table = {}
        time_offsets = []
        devices = []

        new_seq = False
        seq_name = "Main"
        seq_list = ["Main"]

        has_redline_seq = False

        last_time = -1

        for i, row in enumerate(reader):
            if i == 0 and row[0] != "Limits":
                print(row[0])
                return (False, "Error: missing Limits flag")
            if i == 1:
                empty = False
                for j, value in enumerate(row):
                    if row[j] == '':
                        empty = True 
                        continue
                    else:
                        if empty == True:
                            return(False, "Weird ass empty redline jitsky")
                    row[j] = value.replace("-", "_")
                    redline_devices.append(row[j])
            if i == 2:
                empty = False
                for j, value in enumerate(row):
                    if row[j] == '':
                        empty = True 
                        continue
                    else:
                        if empty == True:
                            return(False, "Weird ass empty redline jitsky")
                    redline_values.append(row[j])
                if len(redline_values) != len(redline_devices):
                    return (False, "Error: number of redline devices does not match number of redlines in row 3")
                for j, value in enumerate(redline_values):
                    if int(value) != -1 and int(value) < 0:
                        return (False, "Error: invalid redline value for device " + redline_devices[j])
            
            
            if i == 3:
                if (row[0] != "Timestamp (ms)"):
                    return (False, "Error: no timestamp header element")

                for j, value in enumerate(row[1:]):
                    row[j + 1] = value.replace("-", "_")
                    if value:
                        devices.append(row[j+1] + "_cmd")
                print("Input Devices: " + str(devices))

            if i == 4:
                if (row[0] != "Main"):
                    return (False, "Error: Missing Main sequence start in row " + str(i + 1))

            if (i >= 5):
                if row[0] == "END":
                    if len(row) < 2:
                        return (False, "Error: END statement should specify function name at row " + str(i + 1))
                    if row[1] != seq_name:
                        return (False, "Error: END statement should terminate " + seq_name + " but terminates " + row[1] + " at row " + str(i + 1))
                    
                    new_seq = True
                    continue

                if new_seq:
                    seq_name = row[0]

                    seq_list.append(seq_name)

                    if seq_name == "Redline":
                        has_redline_seq = True

                    if len(row) > 1:
                        for element in row[1:]:
                            if element:
                                return (False, "Error: Unexpected entries for start of sequence at row " + str(i + 1))
                    
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
                    
        return (True, redline_table, devices, time_offsets)
                    
            
def parse_main_sequence(path="test.csv"):
    validation = preprocess_file(path)

    redline_devices = []
    input_devices = []

    if (validation[0]):
        isValid, redline_table, input_devices, time_offsets = validation
    else:
        print(validation[1])
        return
    

    redline_func = "func check_redline() u8 {\n" 

    redline_func += "\tredline_count u8 := 0\n"

    for key in redline_table:
        if not int(redline_table[key]) < 1:
            redline_func += "\tredline_count += " + key + " > " + str(redline_table[key]) +"\n" #"\tredline_count += " + key + "_med > " + str(redline_table[key]) +"\n"

    # # TODO GENERALIZE THIS, HARDCODED FOR EREGS LOWER BOUND IN CASE OF DISCONNECT
    # redline_func += "\tredline_count += PT_GO2_03_1_med < -100 \n"
    # redline_func += "\tredline_count += PT_N2_06_med < -100 \n"

    redline_func += "\treturn redline_count\n"
    
    redline_func += "}\n\n"

    # estop_seq = "authority 255\n"
    estop_seq = "sequence ESTOP {\n"
    estop_seq += "\tstage estop_main{\n"
    estop_seq += "\t\tset_authority{value=254},\n"
    estop_seq += "\t\t0 -> seq_running,\n"
    estop_seq += "\t\t0 -> data_logging,\n"

    for device in input_devices:
        estop_seq += "\t\t0 -> " + device + ",\n"

    estop_seq += "\t\twait{duration=500ms} => IDLE,\n"
    estop_seq += "\t}\n\n"
    estop_seq += "}\n\n"

    idle_seq = "sequence IDLE {\n"
    idle_seq += "\tstage idle_main{\n"
    idle_seq += "\t\t0 -> seq_running,\n"
    idle_seq += "\t\t0 -> data_logging,\n"
    idle_seq += "\t\tset_authority{value=0},\n"

    for device in input_devices:
        idle_seq += "\t\t0 -> " + device + ",\n"
    
    idle_seq += "\t\testop_cmd => ESTOP, \n"
    idle_seq += "\t\tstart_cmd => Main \n"

    idle_seq += "\t}\n\n"
    idle_seq += "}\n\n"

    main_sequence = "authority 250\n"
    main_sequence += "sequence Main {\n"

    blueline_num = 1

    with open(path, newline="") as f:

        cleaned = (strip_comment(line) for line in f)
        reader = csv.reader(cleaned)

        new_seq = False
        first_stage = True
        seq_name = "Main"

        rows = []

        for row in reader:
            rows.append(row)

        for i, row in enumerate(rows):
            if (i < 5):
                continue

            if row[0] == "END":
                new_seq = True

                main_sequence += "}\n\n"
                continue

            if new_seq:
                new_seq = False
                first_stage = True
                seq_name = row[0]

                main_sequence += "sequence " + seq_name + " {\n"
                continue
            
            timestamp = row[0]

            stage_block = "\tstage ts" + str(timestamp) + " {\n"

            if first_stage: # First block has a set authority 
                first_stage = False
                if seq_name == "Main":
                    stage_block += "\t\tset_authority{value=250},\n"
                    stage_block += "\t\t1 -> seq_running,\n"
                    stage_block += "\t\t1 -> data_logging,\n"
                elif seq_name == "Redline":
                    stage_block += "\t\tset_authority{value=253},\n"
                    stage_block += "\t\t1 -> redline_triggered,\n"
                else:
                    stage_block += "\t\tset_authority{value=250},\n"
                    stage_block += "\t\t1 -> blueline_triggered,\n"

            if ("BLUELINE" in row[1]):
                stage_block += "\t\t" + row[3].replace("-", "_") + (" > " if row[2] == "UPPER" else " < ") + row[4] + " => " + row[5] + ",\n" # "\t\t" + row[3].replace("-", "_") + "_med" + (" > " if row[2] == "UPPER" else " < ") + row[4] + " => " + row[5] + ",\n"

                stage_block += "\t\t" + str(blueline_num) + " -> blueline_count,\n"
                blueline_num += 1

                if rows[i + 1][0] != "END":
                    stage_block += "\t\twait{duration=" + str(int(rows[i+1][0]) - int(row[0])) + "ms} => next\n"

                stage_block += "\t}\n\n"

                main_sequence += stage_block
                continue


            for j, value in enumerate(row[1:]):
                stage_block += "\t\t" + str(value) + " -> " + str(input_devices[j]) + ",\n"

            if seq_name != "Redline":
                stage_block += "\t\tinterval{period=10ms} -> check_redline{} => Redline,\n"

            stage_block += "\t\testop_cmd => ESTOP,\n"

            if rows[i + 1][0] != "END":
                stage_block += "\t\twait{duration=" + str(int(rows[i+1][0]) - int(row[0])) + "ms} => next\n"
            else:
                stage_block += "\t\t0 -> seq_running,\n"
                stage_block += "\t\t0 -> data_logging,\n"
                stage_block += "\t\twait{duration=1ms} => IDLE\n"

            stage_block += "\t}\n\n"

            main_sequence += stage_block
            new_seq = False

        main_sequence += "\n\n"

        main_sequence += estop_seq
        main_sequence += idle_seq
        main_sequence += redline_func


        main_sequence += "start_cmd => Main"

        print(main_sequence)
        # pyperclip.copy(main_sequence)
        # Create arcs directory if it doesn't exist
        os.makedirs("arcs", exist_ok=True)

        # Build new filename
        base_name = os.path.basename(path)
        name, _ = os.path.splitext(base_name)
        new_filename = f"{name}_arc.txt"
        new_path = os.path.join("arcs", new_filename)

        # Write to file
        with open(new_path, "w", newline="") as f:
            f.write(main_sequence)

        print(f"Saved arc file to: {new_path}")

if __name__ == "__main__":
    # Check if at least one argument (besides the script name) is provided
    if len(sys.argv) > 1:
        for num in range(len(sys.argv)):
            if num == 0:
                continue

            path = sys.argv[num]
            parse_main_sequence(path)
    else:
        parse_main_sequence()