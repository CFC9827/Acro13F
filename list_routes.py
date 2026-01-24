import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.getcwd(), "backend"))

from main import app

print("Listing all routes:")
for route in app.routes:
    # Check if it has a path and methods
    path = getattr(route, "path", "No path")
    methods = getattr(route, "methods", "No methods")
    name = getattr(route, "name", "No name")
    print(f"{methods} {path} -> {name}")
