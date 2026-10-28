#!/bin/sh
# Double-click to run the stereo test: serves this folder to this computer only, then opens the page.
# Close the Terminal window (or press Ctrl+C) to stop.
cd "$(dirname "$0")" || exit 1
PORT=8766
(sleep 1; open "http://127.0.0.1:$PORT/experiment.html") &
exec python3 -m http.server "$PORT" --bind 127.0.0.1
