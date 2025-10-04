#!/usr/bin/env bash
set -e
# Setup python venv
python3 -m venv .venv || true
. .venv/bin/activate || true
pip install -U pip setuptools wheel || true
# Install repo tools if requirements.txt exists in root
if [ -f requirements.txt ]; then
  pip install -r requirements.txt || true
fi
