#!/bin/bash
# Cloudflare NAMED tunnel for Shopify app
# Permanent URL: https://analytics.boxtasks.com  ->  http://localhost:3000
# Usage: ./start-tunnel.sh

set -e

TUNNEL_URL="https://analytics.boxtasks.com"
TUNNEL_TOKEN="eyJhIjoiZjFiZWYwOWEyYTI4ZjZmN2I5ODhiYzU1MzY3YmM3YTAiLCJ0IjoiY2QzNGFmMDAtZTZmOS00OWRjLWIzMjAtMzc0MzcwZGVhMDJiIiwicyI6Ik1EZ3lZekUxWmpNdE9EWm1aUzAwTWpJeExUa3hZVEV0TTJaaVpqVTFPVEpoT1RkbSJ9"

# ── Check cloudflared ─────────────────────────────────────────────────────────
if ! command -v cloudflared &>/dev/null; then
  echo ""
  echo "ERROR: cloudflared not found. Install it with:"
  echo "  brew install cloudflared"
  echo ""
  exit 1
fi

echo ""
echo "================================================================"
echo " Cloudflare Named Tunnel"
echo "================================================================"
echo " Public URL : $TUNNEL_URL"
echo " Local      : http://localhost:3000"
echo "================================================================"
echo ""
echo " Make sure the tunnel's Public Hostname in the Cloudflare"
echo " dashboard is configured to forward to:  http://localhost:3000"
echo " (or http://host.docker.internal:3000 if running on Linux)"
echo ""
echo " App install URL:"
echo "   $TUNNEL_URL/api/auth/install?shop=YOUR-STORE.myshopify.com"
echo ""
echo " Admin panel:"
echo "   $TUNNEL_URL/admin"
echo "================================================================"
echo ""

# ── Run the named tunnel (foreground, Ctrl+C to stop) ────────────────────────
exec cloudflared tunnel run --token "$TUNNEL_TOKEN"
