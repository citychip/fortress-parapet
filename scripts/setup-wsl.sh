#!/bin/bash
# ============================================================
# Parapet (Fortress v5) — WSL Setup Script
# Run this once from WSL to set up the project
# Usage: bash /mnt/c/Users/cityc.000/OneDrive/_Stocks26/2606Fortress/fortress-parapet/scripts/setup-wsl.sh
# ============================================================
set -e

WINDOWS_SRC="/mnt/c/Users/cityc.000/OneDrive/_Stocks26/2606Fortress/fortress-parapet"
WSL_DEST="$HOME/fortress-parapet"
WEBROOT="/var/www/fortress-parapet"
NGINX_CONF="/etc/nginx/sites-available/fortress-parapet"
API_TOKEN="07f03fb6e664859ac5e8113eaf1102ac43a3cb785c581af756671072b426db21"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   Parapet — Fortress v5 Setup        ║"
echo "╚══════════════════════════════════════╝"
echo ""

# 1. Copy source files from Windows to WSL
echo "▶ Copying source from Windows mount..."
rm -rf "$WSL_DEST"
cp -r "$WINDOWS_SRC" "$WSL_DEST"
echo "  → $WSL_DEST"

# 2. Write .env.local with API token
echo "▶ Writing .env.local..."
cat > "$WSL_DEST/.env.local" <<EOF
VITE_API_BASE=http://localhost:8081
VITE_API_TOKEN=$API_TOKEN
EOF
echo "  → .env.local created"

# 3. Install dependencies
echo "▶ Installing npm dependencies..."
cd "$WSL_DEST"
npm install

# 4. Build
echo "▶ Building..."
npm run build

# 5. Set up webroot
echo "▶ Setting up webroot at $WEBROOT..."
sudo mkdir -p "$WEBROOT"
sudo cp -r "$WSL_DEST/dist/"* "$WEBROOT/"
echo "  → Files copied to $WEBROOT"

# 6. Install nginx config
echo "▶ Installing nginx config..."
sudo cp "$WSL_DEST/nginx/parapet.conf" "$NGINX_CONF"
sudo ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/fortress-parapet
echo "  → Enabled at $NGINX_CONF"

# 7. Test and reload nginx
echo "▶ Testing nginx config..."
sudo nginx -t
echo "▶ Reloading nginx..."
sudo nginx -s reload

# 8. GitHub remote setup
echo ""
echo "▶ Setting up GitHub..."
cd "$WSL_DEST"
git init
git add -A
git commit -m "Initial commit — Parapet (Fortress v5)"
echo ""
echo "  To push to GitHub, first create the repo at:"
echo "  https://github.com/new  (name: fortress-parapet)"
echo "  Then run:"
echo "  cd ~/fortress-parapet"
echo "  git remote add origin https://citychip:YOUR_TOKEN@github.com/citychip/fortress-parapet.git"
echo "  git push -u origin main"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║  ✓ Parapet is live at               ║"
echo "║    http://localhost:3000             ║"
echo "╚══════════════════════════════════════╝"
echo ""
