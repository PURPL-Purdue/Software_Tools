import csv
import os
import sys

blueline_funcs = []
blueline_seqs = []

def strip_comment(line):
    return line.split("/", 1)[0].rstrip()

def parse_blueline(name, snrs, upprs, lwrs, seq):
    func = ""
    func += "func " + name + "() u8 {\n"
    func += "\t" + name + "_count u8 := 0\n"
    lines = []
    for i, snr in enumerate(snrs):
        snrs[i] = snr.replace("-", "_")
    for i, num in enumerate(upprs):
        func += "\t" + name + "_count += " + snrs[i] + " > " + str(parse_int(num, True)) + "\n"
    for i, num in enumerate(lwrs):
        func += "\t" + snrs[i] + " < " + str(parse_int(num, False)) + "\n"
    func += "\treturn " + name + "_count\n"
    func += "}\n\n"
    blueline_funcs.append(func)
    blueline_seqs.append(seq)

def parse_int(s, upr):
    if (s=="NA" and upr):
        return 100000
    elif (s=="NA" and not upr):
        return -30
    else:
        return int(s)

def preprocess_file(path):
    print("Parsing file: " + path)
    with open(path, newline="") as f:
        cleaned = (strip_comment(line) for line in f)
        reader = csv.reader(cleaned)
        rows = list(reader)

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

        for i, row in enumerate(rows):
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

            indx = 0
            if (row[0] == "BlueLimits"):
                while (rows[indx+i+1][0] != "Timestamp (ms)"):
                    indx += 1
                    func_name = rows[indx+i][0]
                    snrs = rows[indx+i][1].split("|")
                    upprs = rows[indx+i][2].split("|")
                    lwrs = rows[indx+i][3].split("|")
                    seq = rows[indx+i][4]
                    parse_blueline(func_name, snrs, upprs, lwrs, seq)
            i += indx #after thinking about how the csv would end up looking I think the i enumerator would be off as well as the hardcoded checks below, hence the increase by indx
            
            
            if i == 3+indx:
                if (row[0] != "Timestamp (ms)"):
                    return (False, "Error: no timestamp header element")

                for j, value in enumerate(row[1:]):
                    row[j + 1] = value.replace("-", "_")
                    if value:
                        devices.append(row[j+1] + "_cmd")
                print("Input Devices: " + str(devices))

            if i == 4+indx:
                if (row[0] != "Main"):
                    return (False, "Error: Missing Main sequence start in row " + str(i + 1))

            if (i >= 5+indx):
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
    

    redline_func = "func check_redline() bool {\n" 

    redline_func += "\tis_redline := false\n"

    for key in redline_table:
        if not int(redline_table[key]) < 1:
            redline_func += "\tis_redline = " + key + " > " + str(redline_table[key]) +" or is_redline\n" #"\tredline_count += " + key + "_med > " + str(redline_table[key]) +"\n"

    # # TODO GENERALIZE THIS, HARDCODED FOR EREGS LOWER BOUND IN CASE OF DISCONNECT
    # redline_func += "\tredline_count += PT_GO2_03_1_med < -100 \n"
    # redline_func += "\tredline_count += PT_N2_06_med < -100 \n"

    redline_func += "\treturn is_redline\n"
    
    redline_func += "}\n\n"

    # estop_seq = "authority 255\n"
    estop_seq = "\tstage ESTOP {\n"
    estop_seq += "\t\tcontrol.set_authority{value=254},\n"
    estop_seq += "\t\t0 -> seq_running,\n"
    estop_seq += "\t\t0 -> data_logging,\n"

    for device in input_devices:
        estop_seq += "\t\t0 -> " + device + ",\n"

    estop_seq += "\t\ttime.wait{duration=500ms} => IDLE,\n"
    estop_seq += "\t}\n\n"

    idle_seq = "\tstage IDLE {\n"
    idle_seq += "\t\t0 -> seq_running,\n"
    idle_seq += "\t\t0 -> data_logging,\n"
    idle_seq += "\t\tcontrol.set_authority{value=0},\n"

    for device in input_devices:
        idle_seq += "\t\t0 -> " + device + ",\n"

    idle_seq += "\t\tstart_cmd != 0 => Main,\n"
    idle_seq += "\t}\n\n"

    main_sequence = "import (\n\ttime\n\tcontrol\n)\n\nauthority 250\n"
    main_sequence += "sequence Main {\n"
    blueline_num = 1

    with open(path, newline="") as f:

        cleaned = (strip_comment(line) for line in f)
        reader = csv.reader(cleaned)

        new_seq = False
        first_stage = True
        seq_name = "Main"
        seq_prefix = "ts"

        rows = []

        for row in reader:
            rows.append(row)

        for i, row in enumerate(rows):
            if (i < 5):
                continue

            if row[0] == "END":
                new_seq = True

                continue

            if new_seq:
                new_seq = False
                first_stage = True
                seq_name = row[0]
                seq_prefix = seq_name

                continue
            
            timestamp = row[0]

            stage_block = "\tstage " + seq_prefix + str(timestamp) + " {\n"

            if first_stage: # First block has a set authority 
                first_stage = False
                if seq_name == "Main":
                    stage_block += "\t\tcontrol.set_authority{value=250},\n"
                    stage_block += "\t\t1 -> seq_running,\n"
                    stage_block += "\t\t1 -> data_logging,\n"
                    stage_block += "\t\t0 -> blueline_triggered\n"
                    stage_block += "\t\t0 -> redline_triggered\n"
                    stage_block += "\t\t0 -> blueline_count\n"
                elif seq_name == "Redline":
                    stage_block += "\t\tcontrol.set_authority{value=253},\n"
                    stage_block += "\t\t1 -> redline_triggered,\n"
                else:
                    stage_block += "\t\tcontrol.set_authority{value=250},\n"
                    stage_block += "\t\t1 -> blueline_triggered,\n"

            if ("BLUELINE" in row[1]):
                stage_block += "\t\t" + row[3].replace("-", "_") + (" > " if row[2] == "UPPER" else " < ") + row[4] + " => " + row[5] + "0,\n" # "\t\t" + row[3].replace("-", "_") + "_med" + (" > " if row[2] == "UPPER" else " < ") + row[4] + " => " + row[5] + ",\n"

                stage_block += "\t\t" + str(blueline_num) + " -> blueline_count,\n"
                blueline_num += 1

                if rows[i + 1][0] != "END":
                    stage_block += "\t\ttime.wait{duration=" + str(int(rows[i+1][0]) - int(row[0])) + "ms} => next\n"

                stage_block += "\t}\n\n"

                main_sequence += stage_block
                continue


            for j, value in enumerate(row[1:]):
                if int(value) in (0, 1):
                    stage_block += "\t\t" + str(value) + " -> " + str(input_devices[j]) + ",\n"
                else:
                    indx = 0
                    for k, func in enumerate(blueline_funcs):
                        if str(value) in func:
                            indx = k
                    stage_block += "\t\tinterval{period=10ms} -> " + str(value) + "{} => " + blueline_seqs[indx]

            if seq_name != "Redline":
                stage_block += "\t\ttime.interval{period=10ms} -> check_redline{} => Redline0,\n"

            stage_block += "\t\testop_cmd != 0 => ESTOP,\n"

            if rows[i + 1][0] != "END":
                stage_block += "\t\ttime.wait{duration=" + str(int(rows[i+1][0]) - int(row[0])) + "ms} => next\n"
            else:
                stage_block += "\t\t0 -> seq_running,\n"
                stage_block += "\t\t0 -> data_logging,\n"
                stage_block += "\t\ttime.wait{duration=1ms} => IDLE\n"

            stage_block += "\t}\n\n"

            main_sequence += stage_block
            new_seq = False

        main_sequence += "\n\n"

        main_sequence += estop_seq
        main_sequence += idle_seq
        main_sequence += "}\n\n"
        main_sequence += redline_func

        for func in blueline_funcs:
            main_sequence += func



        main_sequence += "start_cmd != 0 => Main"

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
