#!/usr/bin/env bash
# ==============================================================================
#  ORNION — PERSONAL AI ASSISTANT - 1-CLICK macOS & LINUX SETUP SCRIPT
#  Created and developed by Praneeth Thota
# ==============================================================================

set -e

echo ""
echo "=================================================================="
echo "             ORNION SETUP — PERSONAL AI ASSISTANT"
echo "           Created and developed by Praneeth Thota"
echo "=================================================================="
echo ""

# 1. Check Python 3.10+
if ! command -v python3 &> /dev/null; then
    echo "[X] Python 3 is NOT installed."
    echo "Please install Python 3.10+ from https://python.org or via Homebrew/apt."
    exit 1
fi

PY_VER=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
echo "[OK] Python $PY_VER detected successfully!"

# 2. Create virtual environment
if [ ! -d ".venv" ]; then
    echo "[*] Creating virtual environment (.venv)..."
    python3 -m venv .venv
    echo "[OK] Virtual environment created!"
else
    echo "[OK] Virtual environment (.venv) already exists!"
fi

# 3. Activate virtual environment
source .venv/bin/activate
echo "[OK] Virtual environment activated!"

# 4. Upgrade pip & install requirements
echo "[*] Upgrading pip and installing dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# Install optional cross-platform audio packages
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "[*] macOS detected: native 'say' speech engine enabled."
    pip install pyaudio || echo "[!] Note: If PyAudio fails on macOS, run: brew install portaudio && pip install pyaudio"
else
    pip install pyttsx3 pyaudio || echo "[!] Note: On Linux, install portaudio19-dev if microphone input requires PyAudio."
fi

# 5. Configure Free Groq API Key
mkdir -p ~/.ornion
if [ ! -f ~/.ornion/free.key ]; then
    echo ""
    read -p "Enter your Groq API Key (or press Enter to use Local Action Mode): " GROQ_KEY
    if [ -n "$GROQ_KEY" ]; then
        echo "$GROQ_KEY" > ~/.ornion/free.key
        chmod 600 ~/.ornion/free.key
        echo "[OK] Groq API key saved to ~/.ornion/free.key"
    else
        echo "[*] Skipping cloud key. ORNION will use Local Action Mode."
    fi
fi

echo ""
echo "=================================================================="
echo "[+] ORNION SETUP COMPLETED SUCCESSFULLY!"
echo "=================================================================="
echo "To launch ORNION Personal AI Assistant:"
echo "  source .venv/bin/activate && python jarvis_voice.py"
echo ""
echo "To open the ORNION Neural Interface HUD:"
echo "  http://127.0.0.1:8765 (or open jarvis_workplace.html)"
echo "=================================================================="
