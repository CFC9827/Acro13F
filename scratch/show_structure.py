
import sys
import re

def show_structure(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    for i, line in enumerate(lines):
        # Match comments or specific JSX patterns
        if '{/*' in line or 'className=' in line or 'Tab Switcher' in line:
            try:
                print(f"{i+1}: {line.strip()}")
            except:
                pass

show_structure(r"c:\Users\abram\Projects\Abrams13F\ui\src\components\GlobalDashboard.tsx")
