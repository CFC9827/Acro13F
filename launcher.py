import webview
import webbrowser
import multiprocessing
import uvicorn
import time
import socket
import os
import sys

# Ensure the 'backend' directory is in the Python path so internal 
# imports like 'from services.database import ...' work correctly
backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from backend.main import app


def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) == 0

def run_backend():
    # Only run the API server
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="error")

if __name__ == "__main__":
    # Windows-specific multiprocessing support
    multiprocessing.freeze_support()

    print("Launching Abrams13F Desktop...")

    # Kill any existing process on port 8000 to avoid conflicts
    if is_port_in_use(8000):
        print("[INFO] Port 8000 is in use. Attempting to free it...")
        import subprocess
        try:
            # Find and kill the process using port 8000
            result = subprocess.run(
                ['netstat', '-ano', '-p', 'TCP'],
                capture_output=True, text=True
            )
            for line in result.stdout.split('\n'):
                if ':8000' in line and 'LISTENING' in line:
                    pid = line.strip().split()[-1]
                    subprocess.run(['taskkill', '/F', '/PID', pid], capture_output=True)
                    print(f"[INFO] Killed existing process on port 8000 (PID: {pid})")
                    break
            time.sleep(1)
        except Exception as e:
            print(f"[WARN] Could not free port 8000: {e}")

    # Start the backend process
    backend_process = multiprocessing.Process(target=run_backend)
    backend_process.daemon = True
    backend_process.start()

    # Wait for the backend to be ready
    retries = 0
    while not is_port_in_use(8000) and retries < 100:
        time.sleep(0.1)
        retries += 1

    if retries >= 100:
        print("Backend failed to start in time.")
        sys.exit(1)

    args = sys.argv[1:]
    use_browser = "--browser" in args

    if use_browser:
        print("[INFO] Opening in default web browser...")
        webbrowser.open('http://localhost:8000')

    # Create the native window
    window = webview.create_window(
        'Abrams13F', 
        'http://localhost:8000',
        width=1280,
        height=850,
        min_size=(1024, 768),
        background_color='#0f172a' # Dark theme background
    )

    # Start the webview GUI
    # If using browser mode, we still start the webview but maybe iconized or minimized?
    # Actually, if we use browser mode, we might want to skip the webview entirely.
    # But for simplicity, let's just open the browser AND the window, or update the logic.

    if use_browser:
        # If we only want the browser, we still need to keep the process alive
        # to host the backend. pywebview isn't the best for "headless" but it works.
        # Let's just open both for now, or make the window hidden.
        webview.start()
    else:
        webview.start()

    # Clean up
    print("Shutting down...")
    backend_process.terminate()
    backend_process.join()
