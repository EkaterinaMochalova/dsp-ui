#!/bin/bash
# One-time setup for screen_cleaner

set -e

echo "Installing Python dependencies..."
pip3 install -r "$(dirname "$0")/requirements.txt"

echo ""
echo "Checking for ffmpeg (needed for MP4 reference)..."
if ! command -v ffmpeg &>/dev/null; then
    echo "  ffmpeg not found."
    if command -v brew &>/dev/null; then
        echo "  Installing via Homebrew..."
        brew install ffmpeg
    else
        echo "  Install manually: https://ffmpeg.org/download.html"
    fi
else
    echo "  ffmpeg OK: $(ffmpeg -version 2>&1 | head -1)"
fi

echo ""
echo "Setup complete."
echo ""
echo "Web UI:"
echo "  export ANTHROPIC_API_KEY=sk-ant-..."
echo "  streamlit run app.py"
echo ""
echo "CLI (alternative):"
echo "  python3 screen_cleaner.py photos.zip --reference ad.mp4"
