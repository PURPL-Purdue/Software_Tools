from urllib import response
import cv2
import numpy as np
import socket
import math
import threading
import tkinter as tk
import time
import requests
import os
from concurrent.futures import ThreadPoolExecutor, as_completed

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

    def scan_ip(ip):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                sock.settimeout(TIMEOUT)
                sock.connect((ip, PORT))
                return ip
        except:
            return None

    ips = [f"{subnet}.{i}" for i in range(1, 255)]

    # LIMIT concurrency here 👇
    with ThreadPoolExecutor(max_workers=40) as executor:
        futures = [executor.submit(scan_ip, ip) for ip in ips]

        for future in as_completed(futures):
            result = future.result()
            if result:
                found.append(result)

    return found

def open_streams(ip_list):
    caps = []
    for ip in ip_list:
        url = f"rtsp://{USERNAME}:{PASSWORD}@{ip}:{PORT}/{STREAM_PATH}"
        caps.append((ip, cv2.VideoCapture(url)))
    return caps

def create_writers(caps):
    """Initialize VideoWriter objects for all active cameras."""
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

def release_writers(writers):
    """Release and clear all VideoWriter objects."""
    for writer in writers.values():
        writer.release()
    writers.clear()
    print("Recording stopped.")

def resize_keep_aspect(frame, max_width, max_height):
    h, w = frame.shape[:2]
    scale = min(max_width / w, max_height / h)
    new_w, new_h = int(w * scale), int(h * scale)
    return cv2.resize(frame, (new_w, new_h))

def draw_rec_indicator(grid, is_recording, frame_count):
    """
    Draw a recording status indicator in the top-left corner of the grid.
    - Recording: pulsing red dot + "REC"
    - Standby:   grey dot + "STANDBY"
    """
    indicator_x, indicator_y = 18, 18
    dot_radius = 10
    font = cv2.FONT_HERSHEY_DUPLEX
    font_scale = 0.65
    thickness = 2

    if is_recording:
        # Pulse: alternate opacity every ~15 frames
        pulse_on = (frame_count // 15) % 2 == 0
        dot_color = (0, 0, 220) if pulse_on else (0, 0, 130)  # bright/dim red (BGR)
        label = "REC"
        text_color = (0, 0, 220)
    else:
        dot_color = (100, 100, 100)  # grey
        label = "STANDBY"
        text_color = (160, 160, 160)

    # Semi-transparent background pill
    pill_x1 = indicator_x - dot_radius - 6
    pill_y1 = indicator_y - dot_radius - 6
    pill_x2 = indicator_x + dot_radius + 120
    pill_y2 = indicator_y + dot_radius + 6

    overlay = grid.copy()
    cv2.rectangle(overlay, (pill_x1, pill_y1), (pill_x2, pill_y2), (20, 20, 20), -1)
    cv2.addWeighted(overlay, 0.55, grid, 0.45, 0, grid)

    # Dot
    cv2.circle(grid, (indicator_x, indicator_y), dot_radius, dot_color, -1)
    cv2.circle(grid, (indicator_x, indicator_y), dot_radius, (255, 255, 255), 1)

    # Label
    cv2.putText(
        grid, label,
        (indicator_x + dot_radius + 8, indicator_y + 6),
        font, font_scale, text_color, thickness, cv2.LINE_AA
    )

    # Hint text bottom-left
    hint = "Press R to toggle recording  |  ESC to quit | 1-3 to switch cameras | 0 for all | d for day mode | n for night mode"
    cv2.putText(
        grid, hint,
        (10, grid.shape[0] - 10),
        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (180, 180, 180), 1, cv2.LINE_AA
    )


def set_ir_cut_mode(mode: str, ips: list):
    HEADERS = {
        "Referer": "",  # filled per camera below
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        "Accept": "text/javascript, text/html, application/xml, text/xml, */*",
        "Content-type": "application/x-www-form-urlencoded",
    }

    for cam in ips:
        session = requests.Session()

        soap_body = f"""<?xml version="1.0"?><soap:Envelope xmlns:soap="http://www.w3.org/2001/12/soap-envelope"><soap:Header>\t<userid>52851dbd7918bbae</userid>\t<passwd>a17faccd02661e4c</passwd></soap:Header><soap:Body>{mode}</soap:Body></soap:Envelope>"""
        headers = {**HEADERS, "Referer": f"http://{cam}/"}

        print(f"Setting {cam} to {mode}...")
        response = session.post(
            f"http://{cam}/setIRCutManual_DayNight",
            data=soap_body,
            headers=headers,
            timeout=5,
        )
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text}\n")
    return response


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
    orig_caps = caps.copy()  # Keep original list for recording

    num_cams = len(caps)
    cols = math.ceil(math.sqrt(num_cams))
    rows = math.ceil(num_cams / cols)

    is_recording = False
    writers = {}
    frame_count = 0

    print("Press R to start/stop recording. Press ESC to quit.")

    while True:
        frames = []
        max_cell_w = SCREEN_WIDTH // cols
        max_cell_h = SCREEN_HEIGHT // rows

        for ip, cap in caps:
            ret, frame = cap.read()

            if not ret:
                frame_display = np.zeros((max_cell_h, max_cell_w, 3), dtype=np.uint8)
            else:
                # Write original frame only when recording
                if is_recording and ip in writers:
                    writers[ip].write(frame)

                frame_display = resize_keep_aspect(frame, max_cell_w, max_cell_h)

            frames.append(frame_display)

        # Build grid
        grid_rows = []
        for r in range(rows):
            row_frames = frames[r * cols:(r + 1) * cols]

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

        # Draw indicator overlay
        draw_rec_indicator(grid, is_recording, frame_count)
        frame_count += 1

        cv2.imshow("Camera Grid", grid)

        key = cv2.waitKey(1) & 0xFF

        if key == 27:  # ESC — quit
            break
        elif key == ord('d') or key == ord('D'):
            print("Switching to Day Mode (IR Cut ON)")
            set_ir_cut_mode("DayMode", cameras)
        elif key == ord('n') or key == ord('N'):
            print("Switching to Night Mode (IR Cut OFF)")
            set_ir_cut_mode("NightMode", cameras)
        elif key == ord('0'):
            caps = orig_caps.copy()  # Show all cameras
            num_cams = len(caps)
            cols = math.ceil(math.sqrt(num_cams))
            rows = math.ceil(num_cams / cols)
            max_cell_w = SCREEN_WIDTH // cols
            max_cell_h = SCREEN_HEIGHT // rows
        elif key == ord('1'):
            print("Switching to Camera 1")
            max_cell_w = SCREEN_WIDTH
            max_cell_h = SCREEN_HEIGHT
            num_cams = 1
            cols = 1
            rows = 1
            caps = [orig_caps[0]]  # Show only first camera
        elif key == ord('2'):
            print("Switching to Camera 1")
            max_cell_w = SCREEN_WIDTH
            max_cell_h = SCREEN_HEIGHT
            num_cams = 1
            cols = 1
            rows = 1
            caps = [orig_caps[1]]
        elif key == ord('3'):
            print("Switching to Camera 3")
            max_cell_w = SCREEN_WIDTH
            max_cell_h = SCREEN_HEIGHT
            num_cams = 1
            cols = 1
            rows = 1
            caps = [orig_caps[2]]
        elif key == ord('r') or key == ord('R'):
            if not is_recording:
                print("Starting recording...")
                writers = create_writers(caps)
                is_recording = True
            else:
                release_writers(writers)
                is_recording = False

    # Cleanup
    if is_recording:
        release_writers(writers)

    for _, cap in caps:
        cap.release()

    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()