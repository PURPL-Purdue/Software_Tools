import time
import synnax as sy

client = sy.Synnax(
    host="169.254.71.1",
    port=9091,
    username="synnax",
    password="seldon",
    secure=False,
)

rack = client.racks.retrieve(name="NI-cRIO-9056-01DCA43E")
client.tasks._default_rack = rack

existing_tasks = client.tasks.list()

if not existing_tasks:
    print("No tasks found on cRIO.")
else:
    print(f"Found {len(existing_tasks)} task(s). Stopping...")
    for task in existing_tasks:
        try:
            task.execute_command("stop")
            print(f"  Stopped: {task.name}")
        except Exception as e:
            print(f"  Could not stop {task.name}: {e}")

    time.sleep(2)

    client.tasks.delete([task.key for task in existing_tasks])
    print(f"Deleted {len(existing_tasks)} task(s).")

    time.sleep(2)
    print("Done. cRIO NI hardware resources released.")
