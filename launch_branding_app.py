from __future__ import annotations

import importlib.util
import os
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent
REQUIREMENTS = REPO_ROOT / "tools" / "branding_flask" / "requirements.txt"
URL = "http://127.0.0.1:5050"


def ensure_dependencies() -> None:
    missing = [
        package
        for package in ("flask", "openpyxl")
        if importlib.util.find_spec(package) is None
    ]
    if not missing:
        return
    print(f"Installing local app requirements for: {', '.join(missing)}")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", str(REQUIREMENTS)])


def open_browser() -> None:
    time.sleep(1.2)
    webbrowser.open(URL)


def main() -> None:
    os.chdir(REPO_ROOT)
    ensure_dependencies()
    from tools.branding_flask.app import app

    print("Starting CAS Branding Capture")
    print(f"Open {URL}")
    print("Leave this window open while you use the local app.")
    threading.Thread(target=open_browser, daemon=True).start()
    app.run(host="127.0.0.1", port=5050, debug=False)


if __name__ == "__main__":
    main()
