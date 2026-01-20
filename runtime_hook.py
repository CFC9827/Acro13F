# PyInstaller runtime hook
# This runs before the main script to set up the import path correctly

import os
import sys

# When running as a frozen exe, the _MEIPASS is the temp directory where files are extracted
if getattr(sys, 'frozen', False):
    # Running in a bundle
    base_path = sys._MEIPASS
    
    # Add the backend directory to sys.path so that 'from services.xxx import ...' works
    backend_path = os.path.join(base_path, 'backend')
    if backend_path not in sys.path:
        sys.path.insert(0, backend_path)
    
    # Also add the root so 'from backend.xxx import ...' works
    if base_path not in sys.path:
        sys.path.insert(0, base_path)
