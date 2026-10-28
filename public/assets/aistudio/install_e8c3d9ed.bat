@echo off
REM ==============================================================================
REM  ORNION — PERSONAL AI ASSISTANT - 1-CLICK WINDOWS SETUP SCRIPT
REM  Created and developed by Praneeth Thota
REM ==============================================================================

setlocal enabledelayedexpansion

echo.
echo ==================================================================
echo                 ORNION SETUP — PERSONAL AI ASSISTANT
echo               Created and developed by Praneeth Thota
echo ==================================================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [X] Python is NOT installed or not in PATH
    echo.
    echo Please install Python 3.10+ from: https://python.org
    echo.
    echo IMPORTANT: During installation, CHECK the box:
    echo "Add Python to PATH"
    echo.
    pause
    exit /b 1
)

echo [OK] Python detected successfully!
echo.

REM Create virtual environment if it doesn't exist
if not exist ".venv" (
    echo [*] Creating virtual environment (.venv)...
    python -m venv .venv
    if %errorlevel% neq 0 (
        echo [X] Failed to create virtual environment
        pause
        exit /b 1
    )
    echo [OK] Virtual environment created!
    echo.
) else (
    echo [OK] Virtual environment already exists!
    echo.
)

REM Activate virtual environment
echo [*] Activating virtual environment...
call .venv\Scripts\activate.bat
if %errorlevel% neq 0 (
    echo [X] Failed to activate virtual environment
    pause
    exit /b 1
)
echo [OK] Virtual environment activated!
echo.

REM Upgrade pip
echo [*] Upgrading pip...
python -m pip install --upgrade pip
if %errorlevel% neq 0 (
    echo [!] Warning: pip upgrade had issues, continuing anyway...
)
echo.

REM Install requirements
echo [*] Installing dependencies from requirements.txt...
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [X] Failed to install requirements
    echo.
    echo Try running manually:
    echo   1. Open Command Prompt in this folder
    echo   2. Run: .venv\Scripts\activate.bat
    echo   3. Run: pip install -r requirements.txt
    pause
    exit /b 1
)
echo [OK] Dependencies installed!
echo.

REM Install additional audio packages
echo [*] Installing audio packages (pyttsx3, pyaudio)...
pip install pyttsx3
pip install pyaudio 2>nul
if %errorlevel% neq 0 (
    echo [!] Note: pyaudio may need a prebuilt wheel on some Windows Python versions.
    echo [!] If microphone input is unavailable, ORNION automatically runs in interactive console text mode.
)
echo.

REM Setup complete
echo.
echo ==================================================================
echo [+] ORNION SETUP COMPLETED SUCCESSFULLY!
echo ==================================================================
echo.
echo NEXT STEPS:
echo.
echo 1. Optional: Get a free Groq API key:
echo    Visit: https://console.groq.com/keys
echo.
echo 2. To start ORNION at any time, run:
echo    .venv\Scripts\activate.bat
echo    python jarvis_voice.py
echo.
echo 3. Open the ORNION Neural Interface HUD in your browser:
echo    http://127.0.0.1:8765
echo.
pause

REM Start ORNION
echo.
echo [*] Starting ORNION — Personal AI Assistant...
echo.
python jarvis_voice.py
