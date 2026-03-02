from flask import Flask, send_file, request, abort, jsonify
import json
import os
import io
import csv
from data_regression import data_regression

app = Flask(__name__)

@app.route("/upload_test", methods=['POST'])
def upload_test():
    os.makedirs("Test_Data", exist_ok=True)
    os.makedirs("Sequences", exist_ok=True)

    test_id = request.args.get("test_id")
    fuel_choice = request.args.get("fuel_choice")

    if not test_id or not fuel_choice:
        abort(400, "dataset and vehicle required")

    test_data_file = request.files.get("test_data")
    seq_data_file = request.files.get("seq_data")

    if not test_data_file or not seq_data_file:
        abort(400, "missing files")

    test_data_path = "Test_Data/" + str(test_id) + ".csv"
    seq_data_path = "Sequences/" + str(test_id) + ".csv"

    test_data_file.save(test_data_path)
    seq_data_file.save(seq_data_path)

    data = get_json()

    test_conditions = gen_test_condition(request)

    parameters = run_reg_from_test_cond(test_id, test_conditions)[0]

    exists = False

    for test in data["tests"]:
        if test["test_id"] == test_id:
            exists = True
            test["data_file"] = test_data_path
            test["sequence_file"] = seq_data_path
            test["test_conditions"] = test_conditions
            test["parameters"] = parameters
    

    if not exists:
        data["tests"].append({
            "test_id": test_id,
            "data_file": test_data_path,
            "sequence_file": seq_data_path,
            "test_conditions": test_conditions,
            "parameters": parameters
        })

    write_json(data)

    return {
        "status" : 200
    },200

def run_reg_from_test_cond(test_id, test_conditions):
    return data_regression(file_name= test_id + ".csv",
                    fuel_choice=test_conditions["fuel_choice"],
                    fuel_CdA=test_conditions["fuel_CdA"],
                    ox_CdA=test_conditions["ox_CdA"],
                    A_star=test_conditions["A_star"],
                    ox_name=test_conditions["ox_name"],
                    state_ox=test_conditions["state_ox"],
                    state_fu=test_conditions["state_fu"],
                    fuel_upstream_col=test_conditions["fuel_upstream_col"],
                    ox_upstream_col=test_conditions["ox_upstream_col"],
                    downstream_col=test_conditions["downstream_col"],
                    downstream_col2=test_conditions["downstream_col2"])

def gen_test_condition(request):
    test_conditions = {}

    test_conditions["fuel_choice"] = request.args.get("fuel_choice")
    test_conditions["fuel_CdA"] = request.args.get("fuel_CdA")
    test_conditions["ox_CdA"] = request.args.get("ox_CdA")
    test_conditions["A_star"] = request.args.get("A_star")
    test_conditions["ox_name"] = request.args.get("ox_name")
    test_conditions["state_ox"] = request.args.get("state_ox")
    test_conditions["state_fu"] = request.args.get("state_fu")
    test_conditions["fuel_upstream_col"] = request.args.get("fuel_upstream_col")
    test_conditions["ox_upstream_col"] = request.args.get("ox_upstream_col")
    test_conditions["downstream_col"] = request.args.get("downstream_col")
    test_conditions["downstream_col2"] = request.args.get("downstream_col2")

    return test_conditions

@app.route("/get_tests")
def get_tests():
    data = get_json()

    test_ids = []

    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow(["filename"])  # header required

    for test in data["tests"]:
        writer.writerow([test["test_id"]])

    mem = io.BytesIO(output.getvalue().encode("utf-8"))
    mem.seek(0)

    return send_file(mem, mimetype="text/csv", as_attachment=False), 200

@app.route("/get_test_data/<test_id>")
def get_test_data(test_id):
    data = get_json()

    path = ""

    for test in data["tests"]:
        if test["test_id"] == test_id:
            path = test["data_file"]

    if path == "":
        return None, 404
    
    return send_file(str(path), as_attachment=True), 200

@app.route("/get_seq_data/<test_id>")
def get_seq_data(test_id):
    data = get_json()

    path = ""

    for test in data["tests"]:
        if test["test_id"] == test_id:
            path = test["sequence_file"]

    if path == "":
        return None, 404
    
    return send_file(str(path), as_attachment=True), 200

def get_json():
    with open('./tests.json', 'r') as file:
        data = json.load(file)
    
    return data

def write_json(data):
    with open('tests.json', 'w') as file:
        json.dump(data, file, indent=2)

if __name__ == '__main__':
    app.run(debug=True, port=6767)