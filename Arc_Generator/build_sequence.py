import csv
import sys

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

        last_time = -1

        for i, row in enumerate(reader):
            if i == 0 and row[0] != "Limits":
                return (False, "Error: missing Limits flag")
            if i == 1:
                redline_devices = row
            if i == 2:
                for j, value in enumerate(row):
                    if int(value) != -1 and int(value) < 0:
                        return (False, "Error: invalid redline value for device " + redline_devices[j])
                redline_values = row
            if i == 3 and row[0] != "Sequence":
                return (False, "Error: missing Sequence flag")
            
            
            if i == 4:
                if (row[0] != "Timestamp (ms)"):
                    return (False, "Error: no timestamp header element")

                devices = row[1:]

            if (i >= 5):
                if int(row[0]) < 0:
                    return (False, "Error: Negative timestamp in row " + str(i + 1))

                    
                if int(row[0]) <= last_time: # Check to make sure times happen in chronological order
                    return (False, "Error: time out of order in row " + str(i + 1))
                
                if (last_time != -1):
                    time_offsets.append(int(row[0]) - last_time)
                
                last_time = int(row[0])

                if "CHECK" not in row[1]:
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
                    if len(row) != 4:
                        return (False, "Error: invalid length for check condition in row " + str(i + 1))
                    
                    if row[2] not in redline_devices:
                        return (False, "Error: Check on non-existent device in row " + str(i + 1))
                    
                    try: # Logic to check if the check value is an integer (valid)
                        x = int(row[3])
                    except ValueError:
                        return (False, "Error: non-integer check value in row " + str(i + 1))
        
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
    


    redline_func = "func check_redline() boolean {\n" 

    redline_func += "\tredline_count f64 = 0\n"

    for key in redline_table:
        redline_func += "\tredline_count += " + key + " < " + str(redline_table[key]) +"\n"

    redline_func += "\treturn redline_count > 0\n"
    
    redline_func += "}\n\n"

    main_sequence = "sequence main {\n"

    with open(path, newline="") as f:

        cleaned = (strip_comment(line) for line in f)
        reader = csv.reader(cleaned)


        for i, row in enumerate(reader):
            if (i < 5):
                continue

            timestamp = row[0]

            stage_block = "\tstage " + str(timestamp) + " {\n"

            if ("CHECK" in row[1]):
                stage_block += "\t\t" + row[2] + " > " + row[3] + " => abort_sequence\n"

                if (i - 5< len(time_offsets)):
                    stage_block += "\t\twait{duration=" + str(time_offsets[i - 5]) + "ms} => next\n"

                stage_block += "\t}\n\n"

                main_sequence += stage_block
                continue


            for j, value in enumerate(row[1:]):
                stage_block += "\t\t" + str(value) + " -> " + str(input_devices[j]) + "\n"

            stage_block += "\t\tcheck_redline() => abort_sequence\n"

            if (i - 5 < len(time_offsets)):
                stage_block += "\t\twait{duration=" + str(time_offsets[i - 5]) + "ms} => next\n"

            stage_block += "\t}\n\n"

            main_sequence += stage_block

        main_sequence += "}\n\n"

        main_sequence += redline_func

        abort_sequence = "sequence abort_sequence {\n\tstage abort {\n"

        for device in input_devices:
            abort_sequence += "\t\t0 -> " + str(device) + "\n"

        abort_sequence += "\t}\n}\n"

        main_sequence += abort_sequence

        print(main_sequence)

    

if __name__ == "__main__":
    # Check if at least one argument (besides the script name) is provided
    if len(sys.argv) > 1:
        path = sys.argv[1]
        parse_main_sequence(path)
    else:
        parse_main_sequence
