#!/bin/sh
exec python3 -m http.server "${PORT:-8080}"
