import cv2
import numpy as np
import socket
import math
import threading
import tkinter as tk  # For getting screen size

# ------------------------------
# CONFIGURATION
# ------------------------------
SUBNET = "192.168.50"
PORT = 554
USERNAME = "admin"
PASSWORD = "123456"
STREAM_PATH = "stream1"
TIMEOUT = 0.3

# ------------------------------
# Get screen size
# ------------------------------
root = tk.Tk()
SCREEN_WIDTH = root.winfo_screenwidth()
SCREEN_HEIGHT = root.winfo_screenheight()
root.destroy()

# ------------------------------
# FUNCTIONS
# ------------------------------
def scan_rtsp(subnet):
    found = []
    threads = []

    def scan_ip(ip):
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(TIMEOUT)
        try:
            sock.connect((ip, PORT))
            found.append(ip)
        except:
            pass
        finally:
            sock.close()

    for i in range(1, 255):
        ip = f"{subnet}.{i}"
        t = threading.Thread(target=scan_ip, args=(ip,))
        threads.append(t)
        t.start()

    for t in threads:
        t.join()

    return found

def open_streams(ip_list):
    caps = []
    for ip in ip_list:
        url = f"rtsp://{USERNAME}:{PASSWORD}@{ip}:{PORT}/{STREAM_PATH}"
        caps.append(cv2.VideoCapture(url))
    return caps

def resize_keep_aspect(frame, max_width, max_height):
    h, w = frame.shape[:2]
    scale = min(max_width / w, max_height / h)
    new_w, new_h = int(w * scale), int(h * scale)
    return cv2.resize(frame, (new_w, new_h))

# ------------------------------
# MAIN
# ------------------------------
def main():
    print("Scanning subnet for cameras...")
    cameras = scan_rtsp(SUBNET)
    if not cameras:
        print("No cameras found.")
        return

    print(f"Found cameras: {cameras}")
    caps = open_streams(cameras)

    num_cams = len(caps)
    cols = math.ceil(math.sqrt(num_cams))
    rows = math.ceil(num_cams / cols)

    while True:
        frames = []
        # Calculate max cell size based on screen
        max_cell_w = SCREEN_WIDTH // cols
        max_cell_h = SCREEN_HEIGHT // rows

        for cap in caps:
            ret, frame = cap.read()
            if not ret:
                frame = np.zeros((max_cell_h, max_cell_w, 3), dtype=np.uint8)
            else:
                frame = resize_keep_aspect(frame, max_cell_w, max_cell_h)
            frames.append(frame)

        # Build grid row by row
        grid_rows = []
        for r in range(rows):
            row_frames = frames[r*cols:(r+1)*cols]
            # Fill empty cells
            while len(row_frames) < cols:
                row_frames.append(np.zeros((max_cell_h, max_cell_w, 3), dtype=np.uint8))
            # Horizontally stack frames with alignment
            # Pad frames to same height for stacking
            heights = [f.shape[0] for f in row_frames]
            max_h = max(heights)
            padded = [np.pad(f, ((0,max_h-f.shape[0]), (0,0), (0,0)), mode='constant') for f in row_frames]
            grid_rows.append(np.hstack(padded))

        # Vertically stack rows, pad to same width
        widths = [r.shape[1] for r in grid_rows]
        max_w = max(widths)
        padded_rows = [np.pad(r, ((0,0),(0,max_w - r.shape[1]),(0,0)), mode='constant') for r in grid_rows]
        grid = np.vstack(padded_rows)

        cv2.imshow("Camera Grid", grid)
        if cv2.waitKey(1) & 0xFF == 27:
            break

    for cap in caps:
        cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()