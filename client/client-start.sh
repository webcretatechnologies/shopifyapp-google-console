#!/bin/sh
set -e
cd /app/client
npm install
npm run dev -- --host
