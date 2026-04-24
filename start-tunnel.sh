#!/bin/bash
# Cloudflare quick tunnel for Shopify app development
# Starts tunnel, auto-updates .env, restarts Lando node service
# Usage: ./start-tunnel.sh

ENV_FILE="$(dirname "$0")/.env"
LOGFILE="/tmp/cloudflared-shopify.log"

# ── Check cloudflared ─────────────────────────────────────────────────────────
if ! command -v cloudflared &>/dev/null; then
  echo ""
  echo "ERROR: cloudflared not found. Install it with:"
  echo "  brew install cloudflared"
  echo ""
  exit 1
fi

echo ""
echo "Starting Cloudflare tunnel -> http://localhost:3000 ..."
rm -f "$LOGFILE"
cloudflared tunnel --url http://localhost:3000 >"$LOGFILE" 2>&1 &
CF_PID=$!

# ── Wait for tunnel URL (up to 60s) ──────────────────────────────────────────
TUNNEL_URL=""
printf "Waiting for tunnel URL"
for i in $(seq 1 30); do
  TUNNEL_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOGFILE" 2>/dev/null | head -1)
  [ -n "$TUNNEL_URL" ] && break
  printf "."
  sleep 2
done
echo ""

if [ -z "$TUNNEL_URL" ]; then
  echo ""
  echo "ERROR: Could not detect tunnel URL after 60s."
  echo "Check $LOGFILE for details."
  kill "$CF_PID" 2>/dev/null
  exit 1
fi

echo ""
echo "Tunnel URL: $TUNNEL_URL"
echo ""

# ── Update .env ───────────────────────────────────────────────────────────────
if [ -f "$ENV_FILE" ]; then
  sed -i '' "s|^APP_URL=.*|APP_URL=$TUNNEL_URL|"                                           "$ENV_FILE"
  sed -i '' "s|^SHOPIFY_HOST=.*|SHOPIFY_HOST=$TUNNEL_URL|"                                 "$ENV_FILE"
  sed -i '' "s|^GOOGLE_REDIRECT_URI=.*|GOOGLE_REDIRECT_URI=$TUNNEL_URL/api/google/callback|" "$ENV_FILE"
  echo ".env updated: APP_URL, SHOPIFY_HOST, GOOGLE_REDIRECT_URI"
else
  echo "WARNING: .env not found at $ENV_FILE — update manually."
fi

# ── Restart Lando node service to pick up new .env ────────────────────────────
echo ""
echo "Restarting Lando node service..."
if command -v lando &>/dev/null; then
  lando restart -s node 2>/dev/null && echo "Node service restarted." || {
    echo "lando restart -s node failed, trying full restart..."
    lando restart
  }
else
  echo "lando not found in PATH — restart manually: lando restart"
fi

# ── Print action checklist ────────────────────────────────────────────────────
echo ""
echo "================================================================"
echo " REQUIRED: Update these two external services with the new URL"
echo "================================================================"
echo ""
echo " [1] SHOPIFY PARTNERS"
echo "     https://partners.shopify.com"
echo "     Apps -> your app -> Configuration"
echo ""
echo "     App URL:"
echo "       $TUNNEL_URL"
echo ""
echo "     Allowed redirection URLs:"
echo "       $TUNNEL_URL/api/auth/callback"
echo ""
echo " [2] GOOGLE CLOUD CONSOLE"
echo "     https://console.cloud.google.com/apis/credentials"
echo "     Click your OAuth 2.0 Client -> Authorized redirect URIs"
echo ""
echo "     Remove the old trycloudflare.com URI and add:"
echo "       $TUNNEL_URL/api/google/callback"
echo ""
echo "================================================================"
echo " App install URL (for testing):"
echo "   $TUNNEL_URL/api/auth/install?shop=YOUR-STORE.myshopify.com"
echo ""
echo " Admin panel:"
echo "   $TUNNEL_URL/admin"
echo ""
echo " phpMyAdmin:"
echo "   https://pma.shopify-google.lndo.site"
echo "================================================================"
echo ""
echo " Press Ctrl+C to stop the tunnel"
echo "================================================================"
echo ""

# ── Keep running until Ctrl+C ─────────────────────────────────────────────────
wait "$CF_PID"
