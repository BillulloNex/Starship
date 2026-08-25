#!/bin/bash
set -euo pipefail

COMMAND=${1:-}
URL=${2:-}

DISPLAY_NUM=":99"
RESOLUTION="1280x720x24"
PROFILE_DIR="${CHROME_PROFILE_DIR:-/home/openhands/.openhands/chrome-profile}"
VNC_PORT=5900
WEBSOCKIFY_PORT=6080
NOVNC_DIR="/opt/novnc"
BASE_DIR="/tmp/vnc-browser"
PIDS_DIR="$BASE_DIR/pids"
LOGS_DIR="$BASE_DIR/logs"

mkdir -p "$PIDS_DIR" "$LOGS_DIR"
export DISPLAY="$DISPLAY_NUM"

is_running() {
    if [ -f "$PIDS_DIR/xvfb.pid" ] && kill -0 $(cat "$PIDS_DIR/xvfb.pid") 2>/dev/null; then
        return 0
    fi
    return 1
}

start() {
    if is_running; then
        if [ -n "$URL" ]; then
            open_url "$URL"
        fi
        return 0
    fi

    # Start Xvfb
    Xvfb "$DISPLAY_NUM" -screen 0 "$RESOLUTION" > "$LOGS_DIR/xvfb.log" 2>&1 &
    echo $! > "$PIDS_DIR/xvfb.pid"
    sleep 1

    # Start Fluxbox
    fluxbox > "$LOGS_DIR/fluxbox.log" 2>&1 &
    echo $! > "$PIDS_DIR/fluxbox.pid"

    # Start x11vnc
    x11vnc -display "$DISPLAY_NUM" -nopw -forever -shared -listen localhost -xkb -rfbport $VNC_PORT > "$LOGS_DIR/x11vnc.log" 2>&1 &
    echo $! > "$PIDS_DIR/x11vnc.pid"

    # Start websockify
    websockify --web "$NOVNC_DIR" $WEBSOCKIFY_PORT localhost:$VNC_PORT > "$LOGS_DIR/websockify.log" 2>&1 &
    echo $! > "$PIDS_DIR/websockify.pid"

    # Start Chromium
    chromium --no-sandbox --window-size=1280,720 --user-data-dir="$PROFILE_DIR" ${URL:+"$URL"} > "$LOGS_DIR/chromium.log" 2>&1 &
    echo $! > "$PIDS_DIR/chromium.pid"
}

stop() {
    for pid_file in "$PIDS_DIR"/*.pid; do
        if [ -f "$pid_file" ]; then
            pid=$(cat "$pid_file")
            kill "$pid" 2>/dev/null || true
            rm -f "$pid_file"
        fi
    done
    
    # Also kill any stragglers
    pkill -f "Xvfb $DISPLAY_NUM" || true
    pkill -f fluxbox || true
    pkill -f x11vnc || true
    pkill -f websockify || true
    pkill -f "chromium.*$PROFILE_DIR" || true
}

status() {
    if is_running; then
        pid=$(cat "$PIDS_DIR/xvfb.pid" 2>/dev/null || echo "null")
        cat <<EOF
{"running": true, "pid": $pid, "url": "http://localhost:$WEBSOCKIFY_PORT", "display": "$DISPLAY_NUM"}
EOF
        exit 0
    else
        cat <<EOF
{"running": false, "pid": null, "url": null, "display": null}
EOF
        exit 1
    fi
}

open_url() {
    local target_url=$1
    if ! is_running; then
        echo "Error: VNC stack is not running." >&2
        exit 1
    fi
    # Use chromium to open url in existing session
    chromium --no-sandbox --user-data-dir="$PROFILE_DIR" "$target_url" > /dev/null 2>&1 &
}

case "$COMMAND" in
    start)
        start
        ;;
    stop)
        stop
        ;;
    status)
        status
        ;;
    open)
        if [ -z "$URL" ]; then
            echo "Usage: $0 open <url>" >&2
            exit 1
        fi
        open_url "$URL"
        ;;
    *)
        echo "Usage: $0 {start [url]|stop|status|open <url>}" >&2
        exit 1
        ;;
esac
