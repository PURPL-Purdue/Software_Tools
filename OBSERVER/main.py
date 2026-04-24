from datetime import datetime
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
# Threaded frame grabber — prevents buffer buildup / stale frames
# ------------------------------
class CameraStream:
    def __init__(self, ip, url):
        self.ip = ip
        self.url = url
        self.cap = None
        self.frame = None
        self.ret = False
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread = None

    def _try_open(self, url):
        cap = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
        # Reduce internal buffer to 1 frame so we always get the latest
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        # Request high resolution (camera may honour or ignore this)
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1920)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 1080)
        return cap

    def start(self):
        """
        Try the main stream (stream0) first for highest resolution.
        Fall back to the configured STREAM_PATH if stream0 fails.
        """
        main_url  = f"rtsp://{USERNAME}:{PASSWORD}@{self.ip}:{PORT}/stream0"
        fallback_url = self.url  # original stream1 url

        cap = self._try_open(main_url)
        ret, _ = cap.read()
        if ret:
            print(f"[{self.ip}] Using main stream (stream0) ✓")
            self.cap = cap
        else:
            print(f"[{self.ip}] stream0 failed, falling back to {STREAM_PATH}")
            cap.release()
            self.cap = self._try_open(fallback_url)

        self._thread = threading.Thread(target=self._grab_loop, daemon=True)
        self._thread.start()

    def _grab_loop(self):
        """Continuously grab frames; only decode when read() is called."""
        while not self._stop.is_set():
            grabbed = self.cap.grab()
            if not grabbed:
                # Brief pause then retry — avoids spin-lock on disconnect
                time.sleep(0.05)
                continue
            ret, frame = self.cap.retrieve()
            with self._lock:
                self.ret = ret
                self.frame = frame

    def read(self):
        with self._lock:
            return self.ret, (self.frame.copy() if self.frame is not None else None)

    def release(self):
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=2)
        if self.cap:
            self.cap.release()


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

    with ThreadPoolExecutor(max_workers=40) as executor:
        futures = [executor.submit(scan_ip, ip) for ip in ips]
        for future in as_completed(futures):
            result = future.result()
            if result:
                found.append(result)

    return found


def open_streams(ip_list):
    streams = []
    for ip in ip_list:
        url = f"rtsp://{USERNAME}:{PASSWORD}@{ip}:{PORT}/{STREAM_PATH}"
        s = CameraStream(ip, url)
        s.start()
        streams.append(s)
    return streams


def create_writers(streams):
    """Initialize VideoWriter objects for all active cameras."""
    writers = {}
    # Prefer avc1 (H.264) for better quality/size; fall back to mp4v
    fourcc = cv2.VideoWriter_fourcc(*'avc1')
    timestamp = time.strftime("%Y%m%d_%H%M%S")

    for s in streams:
        ret, frame = s.read()
        if not ret or frame is None:
            print(f"Skipping writer for {s.ip} (no frame)")
            continue

        h, w = frame.shape[:2]
        filename = f"{SAVE_DIR}/cam_{s.ip.replace('.', '_')}_{timestamp}.mp4"
        writer = cv2.VideoWriter(filename, fourcc, FPS, (w, h))

        # avc1 may not be available on all systems — fall back to mp4v
        if not writer.isOpened():
            print(f"[{s.ip}] avc1 unavailable, falling back to mp4v")
            fourcc_fallback = cv2.VideoWriter_fourcc(*'mp4v')
            writer = cv2.VideoWriter(filename, fourcc_fallback, FPS, (w, h))

        writers[s.ip] = writer
        print(f"Recording {s.ip} → {filename}  [{w}x{h}]")

    return writers


def release_writers(writers):
    for writer in writers.values():
        writer.release()
    writers.clear()
    print("Recording stopped.")


def resize_keep_aspect(frame, max_width, max_height):
    h, w = frame.shape[:2]
    scale = min(max_width / w, max_height / h)
    new_w, new_h = int(w * scale), int(h * scale)
    return cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_LINEAR)


def draw_rec_indicator(grid, is_recording, frame_count):
    indicator_x, indicator_y = 18, 18
    dot_radius = 10
    font = cv2.FONT_HERSHEY_DUPLEX
    font_scale = 0.65
    thickness = 2

    if is_recording:
        pulse_on = (frame_count // 15) % 2 == 0
        dot_color = (0, 0, 220) if pulse_on else (0, 0, 130)
        label = "REC"
        text_color = (0, 0, 220)
    else:
        dot_color = (100, 100, 100)
        label = "STANDBY"
        text_color = (160, 160, 160)

    pill_x1 = indicator_x - dot_radius - 6
    pill_y1 = indicator_y - dot_radius - 6
    pill_x2 = indicator_x + dot_radius + 120
    pill_y2 = indicator_y + dot_radius + 6

    overlay = grid.copy()
    cv2.rectangle(overlay, (pill_x1, pill_y1), (pill_x2, pill_y2), (20, 20, 20), -1)
    cv2.addWeighted(overlay, 0.55, grid, 0.45, 0, grid)

    cv2.circle(grid, (indicator_x, indicator_y), dot_radius, dot_color, -1)
    cv2.circle(grid, (indicator_x, indicator_y), dot_radius, (255, 255, 255), 1)

    cv2.putText(
        grid, label,
        (indicator_x + dot_radius + 8, indicator_y + 6),
        font, font_scale, text_color, thickness, cv2.LINE_AA
    )

    hint = "Press R to toggle recording  |  ESC to quit | 1-3 to switch cameras | 0 for all | D for day mode | N for night mode | L for light on | O for light off"
    cv2.putText(
        grid, hint,
        (10, grid.shape[0] - 10),
        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (180, 180, 180), 1, cv2.LINE_AA
    )


def set_time(ips: list):
    HEADERS = {
        "Referer": "",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        "Accept": "text/javascript, text/html, application/xml, text/xml, */*",
        "Content-type": "application/x-www-form-urlencoded",
    }

    for cam in ips:
        session = requests.Session()
        soap_body = f"""<?xml version="1.0"?><soap:Envelope xmlns:soap="http://www.w3.org/2001/12/soap-envelope"><soap:Header>	<userid>52851dbd7918bbae</userid>	<passwd>a17faccd02661e4c</passwd></soap:Header><soap:Body><TimeConfig TimeMode="MANUAL" TimeZone="480" CurTime="{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}"><NTPConfig ServerIP="ipvs.icamra.com" ServerPort="123" RefreshInterval="60"/><SummerTime enable="0" auto="0" offset="60" ><start month="3" week="3" weekday="0" hour="2" /><end month="11" week="2" weekday="0" hour="2" /></SummerTime></TimeConfig></soap:Body></soap:Envelope>"""
        headers = {**HEADERS, "Referer": f"http://{cam}/"}
        print(f"Setting time")
        response = session.post(f"http://{cam}/setTimeConfig", data=soap_body, headers=headers, timeout=5)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text}\n")
    return response

def set_ir_cut_mode(mode: str, ips: list):
    HEADERS = {
        "Referer": "",
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
        response = session.post(f"http://{cam}/setIRCutManual_DayNight", data=soap_body, headers=headers, timeout=5)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text}\n")
    return response


def set_light_mode(mode: str, ips: list):
    HEADERS = {
        "Referer": "",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        "Accept": "text/javascript, text/html, application/xml, text/xml, */*",
        "Content-type": "application/x-www-form-urlencoded",
    }

    if mode == "On":
        mode = 100
    elif mode == "Off":
        mode = 0

    for cam in ips:
        session = requests.Session()
        soap_body = f"""<?xml version="1.0"?><soap:Envelope xmlns:soap="http://www.w3.org/2001/12/soap-envelope"><soap:Header>	<userid>52851dbd7918bbae</userid>	<passwd>a17faccd02661e4c</passwd></soap:Header><soap:Body><Video><Capture Brightness="128" Contrast="128" Saturation="128" Sharpness="128" TVSystem="0" forct_antiflicker="0" cropxpix="0" cropypix="0" HFlip="1" VFlip="1" rotate="0" WB_RGB="8421504" BackLight="0" HLC="0" TNF="128" SNF="128" IrcutMode="3" IrcutSensitivity="50" IrcutOpenLedDelay="14" led_brightness_mode="1" led_brightness_value="{mode}" led_brightness_alarm="0" IrcutNightStartTime="18:00:00" IrcutNightEndTime="08:00:00" IrcutKeepColor="0" led_mode="1" ispadvmode="0" bManualGain="0" gainValue="0" WDRMode="0" WDRValue="128" DfrogFlag="0" DfrogValue="128" WDRStartTime="00:00:00" WDREndTime="00:00:00" shutter_mode="0" shutter_mode_night="0" shutter_speed_day="1000" shutter_speed_night="1000" isp_mode_color="0" isp_mode_night="0" videoEncodeMode="0" aov_mode="2" aov_fps="1" light_off_sensitivity="56" face_exposure_sensitivity="60">
<FishEyeCfg Enable="0" autocrop="0" diameter_ppm="0" center_ppm_x="0" center_ppm_y="0"/>
</Capture></Video></soap:Body></soap:Envelope>"""
        headers = {**HEADERS, "Referer": f"http://{cam}/"}
        print(f"Setting {cam} to {mode}...")
        response = session.post(f"http://{cam}/setMediaVideoCaptureConfig", data=soap_body, headers=headers, timeout=5)
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
    all_streams = open_streams(cameras)
    active_streams = all_streams.copy()

    num_cams = len(active_streams)
    cols = math.ceil(math.sqrt(num_cams))
    rows = math.ceil(num_cams / cols)

    is_recording = False
    writers = {}
    frame_count = 0

    print("Press R to start/stop recording. Press ESC to quit.")
    set_time(cameras)
    
    while True:
        frames = []
        max_cell_w = SCREEN_WIDTH // cols
        max_cell_h = SCREEN_HEIGHT // rows

        # --- Recording: always capture ALL cameras at full resolution,
        #     regardless of which view (single / grid) is currently shown.
        if is_recording:
            for s in all_streams:
                ret, frame = s.read()
                if ret and frame is not None and s.ip in writers:
                    writers[s.ip].write(frame)

        # --- Display: only read + render the active (visible) streams.
        for s in active_streams:
            ret, frame = s.read()

            if not ret or frame is None:
                frame_display = np.zeros((max_cell_h, max_cell_w, 3), dtype=np.uint8)
            else:
                frame_display = resize_keep_aspect(frame, max_cell_w, max_cell_h)

            frames.append(frame_display)

        # Build grid
        grid_rows = []
        for r in range(rows):
            row_frames = frames[r * cols:(r + 1) * cols]
            while len(row_frames) < cols:
                row_frames.append(np.zeros((max_cell_h, max_cell_w, 3), dtype=np.uint8))

            max_h = max(f.shape[0] for f in row_frames)
            padded = [
                np.pad(f, ((0, max_h - f.shape[0]), (0, 0), (0, 0)), mode='constant')
                for f in row_frames
            ]
            grid_rows.append(np.hstack(padded))

        max_w = max(r.shape[1] for r in grid_rows)
        padded_rows = [
            np.pad(r, ((0, 0), (0, max_w - r.shape[1]), (0, 0)), mode='constant')
            for r in grid_rows
        ]
        grid = np.vstack(padded_rows)

        draw_rec_indicator(grid, is_recording, frame_count)
        frame_count += 1

        cv2.imshow("Camera Grid", grid)
        key = cv2.waitKey(1) & 0xFF

        if key == 27:  # ESC
            break
        elif key == ord('t') or key == ord('T'):
            print("Syncing camera times... ")
            set_time(cameras)
        elif key == ord('d') or key == ord('D'):
            print("Switching to Day Mode (IR Cut ON)")
            set_ir_cut_mode("DayMode", cameras)
        elif key == ord('n') or key == ord('N'):
            print("Switching to Night Mode (IR Cut OFF)")
            set_ir_cut_mode("NightMode", cameras)
        elif key == ord('l') or key == ord('L'):
            set_light_mode("On", cameras)
        elif key == ord('o') or key == ord('O'):
            set_light_mode("Off", cameras)
        elif key == ord('0'):
            active_streams = all_streams.copy()
            num_cams = len(active_streams)
            cols = math.ceil(math.sqrt(num_cams))
            rows = math.ceil(num_cams / cols)
        elif key == ord('1'):
            print("Switching to Camera 1")
            active_streams = [all_streams[0]]
            cols = rows = num_cams = 1
        elif key == ord('2'):
            print("Switching to Camera 2")
            active_streams = [all_streams[1]]
            cols = rows = num_cams = 1
        elif key == ord('3'):
            print("Switching to Camera 3")
            active_streams = [all_streams[2]]
            cols = rows = num_cams = 1
        elif key == ord('r') or key == ord('R'):
            if not is_recording:
                print("Starting recording...")
                writers = create_writers(all_streams)  # always record every camera
                is_recording = True
            else:
                release_writers(writers)
                is_recording = False

    # Cleanup
    if is_recording:
        release_writers(writers)

    for s in all_streams:
        s.release()

    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()