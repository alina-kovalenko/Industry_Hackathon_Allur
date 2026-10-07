#!/bin/sh
set -eu
cd "$(dirname "$0")"
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements-runtime.lock
PORT="${PORT:-8001}" HOST=127.0.0.1 .venv/bin/python scripts/serve.py
