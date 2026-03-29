import csv
import sys
import pyperclip

def strip_comment(line):
    return line.split("/", 1)[0].rstrip()

def preprocess_file(path):
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

            if (i >= 5):
                if row[0] == "END":
                    if len(row) > 2:
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

    redline_func += "\tredline_count u8 := 0,\n"

    for key in redline_table:
        if not int(redline_table[key]) < 1:
            redline_func += "\tredline_count += " + key + " < " + str(redline_table[key]) +",\n"

    redline_func += "\treturn redline_count,\n"
    
    redline_func += "}\n\n"

    estop_func = "func estop() u8 {\n"
    estop_func += "\tset_authority{value=255},\n"

    for device in input_devices:
        estop_func += "\t0 -> " + device + ",\n"

    estop_func += "\tset_authority{value=0},\n"
    estop_func += "\treturn 1,\n"
    estop_func += "}\n\n"

    main_sequence = "sequence Main {\n"

    with open(path, newline="") as f:

        cleaned = (strip_comment(line) for line in f)
        reader = csv.reader(cleaned)

        new_seq = False
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
                seq_name = row[0]
                new_seq = False

                if seq_name == "Redline":
                    main_sequence += "authority 254\n\n"
                else:
                    main_sequence += "authority 250\n\n"

                main_sequence += "sequence " + seq_name + " {\n"
                continue
            
            timestamp = row[0]

            stage_block = "\tstage ts" + str(timestamp) + " {\n"

            if ("BLUELINE" in row[1]):
                stage_block += "\t\t" + row[3].replace("-", "_") + (" > " if row[2] == "UPPER" else " < ") + row[4] + " => " + row[5] + ",\n"

                if rows[i + 1][0] != "END":
                    stage_block += "\t\twait{duration=" + str(int(rows[i+1][0]) - int(row[0])) + "ms} => next\n"

                stage_block += "\t}\n\n"

                main_sequence += stage_block
                continue


            for j, value in enumerate(row[1:]):
                stage_block += "\t\t" + str(value) + " -> " + str(input_devices[j]) + ",\n"

            if seq_name != "Redline":
                stage_block += "\t\tcheck_redline() > 0 => Redline,\n"

            if rows[i + 1][0] != "END":
                stage_block += "\t\twait{duration=" + str(int(rows[i+1][0]) - int(row[0])) + "ms} => next\n"
            else:
                stage_block += "\t\tset_authority{value=0},\n"

            stage_block += "\t}\n\n"

            main_sequence += stage_block

        main_sequence += "\n\n"

        main_sequence += redline_func
        main_sequence += estop_func

        print(main_sequence)
        pyperclip.copy(main_sequence)
    

if __name__ == "__main__":
    # Check if at least one argument (besides the script name) is provided
    if len(sys.argv) > 1:
        path = sys.argv[1]
        parse_main_sequence(path)
    else:
        parse_main_sequence