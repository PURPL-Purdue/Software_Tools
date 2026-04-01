import cv2
import numpy as np
import socket
import math
import threading
import tkinter as tk
import time
import os

# ------------------------------
# CONFIGURATION
# ------------------------------
SUBNET = "192.168.50"
PORT = 554
USERNAME = "admin"
PASSWORD = "123456"
STREAM_PATH = "stream1"
TIMEOUT = 0.3
FPS = 20  # Recording FPS

SAVE_DIR = "recordings"
os.makedirs(SAVE_DIR, exist_ok=True)

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
        caps.append((ip, cv2.VideoCapture(url)))
    return caps

def create_writers(caps):
    writers = {}

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    timestamp = time.strftime("%Y%m%d_%H%M%S")

    for ip, cap in caps:
        ret, frame = cap.read()
        if not ret:
            print(f"Skipping writer for {ip} (no frame)")
            continue

        h, w = frame.shape[:2]
        filename = f"{SAVE_DIR}/cam_{ip.replace('.', '_')}_{timestamp}.mp4"

        writer = cv2.VideoWriter(filename, fourcc, FPS, (w, h))
        writers[ip] = writer

        print(f"Recording {ip} → {filename}")

    return writers

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

    writers = create_writers(caps)

    num_cams = len(caps)
    cols = math.ceil(math.sqrt(num_cams))
    rows = math.ceil(num_cams / cols)

    while True:
        frames = []

        max_cell_w = SCREEN_WIDTH // cols
        max_cell_h = SCREEN_HEIGHT // rows

        for ip, cap in caps:
            ret, frame = cap.read()

            if not ret:
                frame_display = np.zeros((max_cell_h, max_cell_w, 3), dtype=np.uint8)
            else:
                # Write original frame (full resolution)
                if ip in writers:
                    writers[ip].write(frame)

                # Resize for display
                frame_display = resize_keep_aspect(frame, max_cell_w, max_cell_h)

            frames.append(frame_display)

        # Build grid
        grid_rows = []
        for r in range(rows):
            row_frames = frames[r*cols:(r+1)*cols]

            while len(row_frames) < cols:
                row_frames.append(np.zeros((max_cell_h, max_cell_w, 3), dtype=np.uint8))

            heights = [f.shape[0] for f in row_frames]
            max_h = max(heights)

            padded = [
                np.pad(f, ((0, max_h - f.shape[0]), (0, 0), (0, 0)), mode='constant')
                for f in row_frames
            ]

            grid_rows.append(np.hstack(padded))

        widths = [r.shape[1] for r in grid_rows]
        max_w = max(widths)

        padded_rows = [
            np.pad(r, ((0, 0), (0, max_w - r.shape[1]), (0, 0)), mode='constant')
            for r in grid_rows
        ]

        grid = np.vstack(padded_rows)

        cv2.imshow("Camera Grid", grid)

        if cv2.waitKey(1) & 0xFF == 27:
            break

    # Cleanup
    for _, cap in caps:
        cap.release()

    for writer in writers.values():
        writer.release()

    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()