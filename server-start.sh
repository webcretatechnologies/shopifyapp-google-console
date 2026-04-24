#!/bin/sh
cd /app
npm install
while true; do
  npx nodemon --exitcrash server/index.js
  echo "[server-start] nodemon exited, restarting in 3 seconds..."
  sleep 3
done
