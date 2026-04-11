#!/bin/bash
# JARVIS NEXUS — Launch script
cd "$(dirname "$0")"
./node_modules/.bin/electron . "$@"
