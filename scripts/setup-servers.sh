#!/bin/bash
set -euo pipefail

# ─────────────────────────────────────────────────────────
# PharmaHub — First-Time Server Setup
# Run this ONCE from your local machine after terraform apply
#
# Usage:
#   chmod +x scripts/setup-servers.sh
#   ./scripts/setup-servers.sh
#
# Prerequisites:
#   - terraform apply completed (droplets are running)
#   - SSH key already added to DigitalOcean
#   - You can SSH into both servers
# ─────────────────────────────────────────────────────────

# ── Config (update these with your terraform output) ─────
APP_HOST="${APP_HOST:-188.166.179.160}"
DB_HOST="${DB_HOST:-165.22.63.182}"
DB_PRIVATE_IP="${DB_PRIVATE_IP:-10.10.10.2}"
SSH_USER="root"

DB_NAME="pharmahub"
DB_USER="pharmahub"
DB_PASS="${DB_PASS:-$(openssl rand -base64 24)}"

MEILI_KEY="${MEILI_KEY:-$(openssl rand -base64 32)}"

REPO_URL="${REPO_URL:-https://github.com/YOUR_USER/YOUR_REPO.git}"

echo "═══════════════════════════════════════════════════"
echo "  PharmaHub Server Setup"
echo "═══════════════════════════════════════════════════"
echo ""
echo "  App Server:  ${APP_HOST}"
echo "  DB Server:   ${DB_HOST} (private: ${DB_PRIVATE_IP})"
echo "  DB Password:  ${DB_PASS}"
echo "  Meili Key:   ${MEILI_KEY}"
echo ""
echo "  ⚠️  SAVE THESE CREDENTIALS SOMEWHERE SAFE!"
echo ""
echo "═══════════════════════════════════════════════════"
read -p "Press Enter to continue or Ctrl+C to cancel..."

# ─────────────────────────────────────────────────────────
# STEP 1: Setup Database Server
# ─────────────────────────────────────────────────────────
echo ""
echo ">>> [1/3] Setting up Database Server (${DB_HOST})..."
echo ""

ssh -o StrictHostKeyChecking=no ${SSH_USER}@${DB_HOST} bash <<DBEOF
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

echo ">>> Updating system..."
apt-get update -y && apt-get upgrade -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold"

# ── Install PostgreSQL 16 ────────────────────
echo ">>> Installing PostgreSQL 16..."
apt-get install -y gnupg2 lsb-release curl
echo "deb http://apt.postgresql.org/pub/repos/apt \$(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg
apt-get update -y
apt-get install -y postgresql-16

# ── Configure PostgreSQL ─────────────────────
PG_CONF="/etc/postgresql/16/main/postgresql.conf"
PG_HBA="/etc/postgresql/16/main/pg_hba.conf"

# Listen on private network
sed -i "s/#listen_addresses = 'localhost'/listen_addresses = 'localhost,${DB_PRIVATE_IP}'/" "\$PG_CONF"

# Memory tuning for 1GB
sed -i "s/shared_buffers = 128MB/shared_buffers = 256MB/" "\$PG_CONF"
sed -i "s/#effective_cache_size = 4GB/effective_cache_size = 512MB/" "\$PG_CONF"
sed -i "s/#work_mem = 4MB/work_mem = 4MB/" "\$PG_CONF"
sed -i "s/#maintenance_work_mem = 64MB/maintenance_work_mem = 64MB/" "\$PG_CONF"

# Allow VPC connections
echo "host    all    all    10.10.10.0/24    md5" >> "\$PG_HBA"

systemctl restart postgresql

# ── Create database and user ─────────────────
sudo -u postgres psql <<SQL
CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';
CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};
GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
SQL

# ── Daily backup cron ────────────────────────
mkdir -p /opt/backups/daily
chown postgres:postgres /opt/backups/daily

cat > /etc/cron.d/pharmahub-backup <<'CRON'
0 3 * * * postgres pg_dump -U ${DB_USER} -Fc ${DB_NAME} > /opt/backups/daily/pharmahub_\$(date +\%Y\%m\%d).dump && find /opt/backups/daily -name "*.dump" -mtime +7 -delete
CRON
chmod 644 /etc/cron.d/pharmahub-backup

# ── File storage directories ─────────────────
mkdir -p /opt/pharmahub-uploads/{prescriptions,products,reports}

# ── Swap ─────────────────────────────────────
if [ ! -f /swapfile ]; then
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo ">>> ✅ Database server ready!"
DBEOF

# ─────────────────────────────────────────────────────────
# STEP 2: Setup App Server
# ─────────────────────────────────────────────────────────
echo ""
echo ">>> [2/3] Setting up App Server (${APP_HOST})..."
echo ""

ssh -o StrictHostKeyChecking=no ${SSH_USER}@${APP_HOST} bash <<APPEOF
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

echo ">>> Updating system..."
apt-get update -y && apt-get upgrade -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold"

# ── Node.js 20 LTS ──────────────────────────
echo ">>> Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs git
npm install -g pm2

# ── Docker ───────────────────────────────────
echo ">>> Installing Docker..."
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
fi

# ── Redis ────────────────────────────────────
echo ">>> Starting Redis..."
docker rm -f redis 2>/dev/null || true
docker run -d \
  --name redis \
  --restart always \
  -p 127.0.0.1:6379:6379 \
  redis:7-alpine \
  redis-server --maxmemory 128mb --maxmemory-policy allkeys-lru

# ── Meilisearch ──────────────────────────────
echo ">>> Starting Meilisearch..."
mkdir -p /opt/meilisearch/data
docker rm -f meilisearch 2>/dev/null || true
docker run -d \
  --name meilisearch \
  --restart always \
  -p 127.0.0.1:7700:7700 \
  -v /opt/meilisearch/data:/meili_data \
  -e MEILI_MASTER_KEY='${MEILI_KEY}' \
  -e MEILI_ENV='production' \
  -e MEILI_MAX_INDEXING_MEMORY='200Mb' \
  getmeili/meilisearch:v1.8

# ── Caddy ────────────────────────────────────
echo ">>> Installing Caddy..."
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update -y
apt-get install -y caddy

cat > /etc/caddy/Caddyfile <<'CADDY'
:80 {
    reverse_proxy localhost:5000
}
CADDY

systemctl restart caddy

# ── PM2 log directory ────────────────────────
mkdir -p /var/log/pm2

# ── Clone repo ───────────────────────────────
if [ ! -d /opt/pharmahub-backend/.git ]; then
  echo ">>> Cloning repository..."
  git clone ${REPO_URL} /opt/pharmahub-backend || echo "⚠️  Clone failed — set REPO_URL or clone manually"
fi

# ── Create .env ──────────────────────────────
cat > /opt/pharmahub-backend/.env <<ENV
PORT=5000
NODE_ENV=production

# Database (via private VPC)
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_PRIVATE_IP}:5432/${DB_NAME}"
REDIS_URL="redis://127.0.0.1:6379"

# Security — CHANGE THESE
JWT_ACCESS_SECRET="$(openssl rand -base64 48)"
JWT_REFRESH_SECRET="$(openssl rand -base64 48)"

# Meilisearch
MEILISEARCH_HOST="http://127.0.0.1:7700"
MEILISEARCH_API_KEY="${MEILI_KEY}"

# Email (configure when ready)
RESEND_API_KEY=""

# SMS (configure when ready)
TWILIO_ACCOUNT_SID=""
TWILIO_AUTH_TOKEN=""
ENV

# ── Swap ─────────────────────────────────────
if [ ! -f /swapfile ]; then
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# ── PM2 startup ──────────────────────────────
pm2 startup systemd -u root --hp /root

echo ">>> ✅ App server ready!"
APPEOF

# ─────────────────────────────────────────────────────────
# STEP 3: Install deps, migrate, start
# ─────────────────────────────────────────────────────────
echo ""
echo ">>> [3/3] Installing dependencies and starting app..."
echo ""

ssh ${SSH_USER}@${APP_HOST} bash <<STARTEOF
set -e
cd /opt/pharmahub-backend

if [ -f package.json ]; then
  npm ci --production
  npx prisma generate
  npx prisma migrate deploy
  pm2 start ecosystem.config.js --env production
  pm2 save
  echo ""
  echo ">>> ✅ PharmaHub is LIVE at http://${APP_HOST}"
else
  echo "⚠️  No package.json found. Clone your repo to /opt/pharmahub-backend first."
  echo "    Then run: cd /opt/pharmahub-backend && npm ci && npx prisma migrate deploy && pm2 start ecosystem.config.js --env production"
fi
STARTEOF

echo ""
echo "═══════════════════════════════════════════════════"
echo "  ✅ SETUP COMPLETE!"
echo "═══════════════════════════════════════════════════"
echo ""
echo "  🌐 App:      http://${APP_HOST}"
echo "  🔑 SSH App:  ssh root@${APP_HOST}"
echo "  🔑 SSH DB:   ssh root@${DB_HOST}"
echo ""
echo "  📂 App dir:  /opt/pharmahub-backend"
echo "  📂 Uploads:  /opt/pharmahub-uploads (on DB server)"
echo "  📂 Backups:  /opt/backups/daily (on DB server)"
echo ""
echo "  🔗 DB URL:   postgresql://${DB_USER}:${DB_PASS}@${DB_PRIVATE_IP}:5432/${DB_NAME}"
echo ""
echo "  Next steps:"
echo "    1. Add GitHub secrets: APP_HOST, DB_HOST, SSH_PRIVATE_KEY, REPO_URL"
echo "    2. Push to main branch → auto deploys via GitHub Actions"
echo "    3. Point your domain to ${APP_HOST} and update Caddyfile"
echo ""
echo "═══════════════════════════════════════════════════"
