#!/bin/bash
# ============================================================
# Parapet — Redeploy Script
# Run this after pulling updates from GitHub or making changes
# Usage: bash ~/fortress-parapet/scripts/deploy.sh
# ============================================================
set -e

WSL_DEST="$HOME/fortress-parapet"
WEBROOT="/var/www/fortress-parapet"

echo "▶ Building..."
cd "$WSL_DEST"
npm run build

echo "▶ Deploying to $WEBROOT..."
sudo rm -rf "$WEBROOT"/*
sudo cp -r dist/* "$WEBROOT/"

echo "▶ Reloading nginx..."
sudo nginx -s reload

echo "✓ Deployed at http://localhost:3000"
