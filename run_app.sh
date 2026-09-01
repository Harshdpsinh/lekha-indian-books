#!/bin/sh
set -eu
cd "$(dirname "$0")"
if [ ! -d .venv ]; then python3 -m venv .venv; fi
. .venv/bin/activate
pip install -q -r requirements.txt
[ -f .env ] || cp .env.example .env
mkdir -p inbox out data
echo "Lekha is opening in your browser…"
exec streamlit run app/streamlit_app.py --server.headless true
