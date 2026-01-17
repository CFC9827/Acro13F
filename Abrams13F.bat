@echo off
setlocal
title Abrams13F Launcher

echo Starting Abrams13F...

:: Check for Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in your PATH.
    echo Please install Python from https://www.python.org/ and try again.
    pause
    exit /b 1
)

:: Check for .env and create if missing
if not exist ".env" (
    echo [INFO] Creating initial configuration...
    echo # Abrams13F Configuration > .env
)

:: Auto-install dependencies
echo [INFO] Verifying dependencies...
python -m pip install -q -r requirements.txt

:: Run the launcher
echo [INFO] Initializing native window...
python launcher.py

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] The application crashed or failed to start.
    echo Check for error messages above.
    pause
)

endlocal
