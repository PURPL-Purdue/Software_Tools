from schematic_config.schem_config import configure_schematic
from config import configure_synnax
from export_data import export_data_loop
from run_median import run_median_chan
import threading

if __name__ == "__main__":
    configure_synnax()

    stop_event = threading.Event()

    med_thread = threading.Thread(target=run_median_chan, args=(stop_event,))
    med_thread.start()

    export_data_loop()

    stop_event.set()
    med_thread.join()