#!/bin/sh
set -eu

if [ -n "${VOICE_BASE_URL:-}" ]; then
  VOICE_LOCATIONS=$(cat <<EOF
    location /api/voice/ws {
        proxy_pass ${VOICE_BASE_URL};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        add_header X-Accel-Buffering no;
    }

    location /api/voice/ {
        proxy_pass ${VOICE_BASE_URL}/api/voice/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        add_header X-Accel-Buffering no;
    }
EOF
)
else
  VOICE_LOCATIONS=""
fi

export VOICE_LOCATIONS
envsubst '${BASE_URL} ${VOICE_LOCATIONS}' < /etc/nginx/nginx.conf.template > /etc/nginx/conf.d/default.conf

VOICE_ENABLED="false"
if [ -n "${VOICE_BASE_URL:-}" ]; then
  VOICE_ENABLED="true"
fi
cat > /usr/share/nginx/html/runtime-config.js <<EOF
globalThis.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
  "DESKTOP_APP": "${DESKTOP_APP:-}",
  "DEBUG_PANEL_ENABLED": "${DEBUG_PANEL_ENABLED:-}",
  "DELTA_LOGS_ENABLED": "${DELTA_LOGS_ENABLED:-}",
  "SETTINGS_MENU_ENABLED": "${SETTINGS_MENU_ENABLED:-}",
  "QUICK_ACTIONS_ENABLED": "${QUICK_ACTIONS_ENABLED:-}",
  "VOICE_ASR_CLIENT_GATE_ENABLED": "${VOICE_ASR_CLIENT_GATE_ENABLED:-}",
  "VOICE_ASR_CLIENT_GATE_RMS_THRESHOLD": "${VOICE_ASR_CLIENT_GATE_RMS_THRESHOLD:-}",
  "VOICE_ASR_CLIENT_GATE_OPEN_HOLD_MS": "${VOICE_ASR_CLIENT_GATE_OPEN_HOLD_MS:-}",
  "VOICE_ASR_CLIENT_GATE_CLOSE_HOLD_MS": "${VOICE_ASR_CLIENT_GATE_CLOSE_HOLD_MS:-}",
  "VOICE_ASR_CLIENT_GATE_PRE_ROLL_MS": "${VOICE_ASR_CLIENT_GATE_PRE_ROLL_MS:-}",
  "VOICE_ENABLED": "${VOICE_ENABLED}"
};
EOF

exec nginx -g 'daemon off;'
