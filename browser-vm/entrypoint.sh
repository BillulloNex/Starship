#!/bin/bash
set -e

# Fix permissions on mounted volumes
mkdir -p /home/browseruser/.config/google-chrome /home/browseruser/Downloads /var/log/supervisor
chown -R browseruser:browseruser /home/browseruser /var/log/supervisor 2>/dev/null || true

# Remove old X lock files if any
rm -f /tmp/.X99-lock /tmp/.X11-unix/X99

exec "$@"
