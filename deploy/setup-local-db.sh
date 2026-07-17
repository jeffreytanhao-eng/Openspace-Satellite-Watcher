#!/bin/bash
# ============================================================
# Install local PostgreSQL and set up satellite-watcher database
# Run on HK server: sudo bash setup-local-db.sh
# ============================================================

set -e

echo "========================================="
echo "  Installing Local PostgreSQL"
echo "========================================="

# 1. Install PostgreSQL
echo ">> Installing PostgreSQL..."
apt update && apt install -y postgresql postgresql-contrib

# 2. Start and enable
echo ">> Starting PostgreSQL service..."
systemctl enable postgresql
systemctl start postgresql

# 3. Create database and user
echo ">> Creating database and user..."
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"
sudo -u postgres psql -c "CREATE DATABASE \"satellite-watcher\";" 2>/dev/null || echo "  Database already exists"

# 4. Verify connection
echo ">> Verifying connection..."
if sudo -u postgres psql -d "satellite-watcher" -c "SELECT 1;" > /dev/null 2>&1; then
  echo "  PostgreSQL connection OK"
else
  echo "  ERROR: Cannot connect to PostgreSQL"
  exit 1
fi

# 5. Configure PostgreSQL for low memory usage
echo ">> Optimizing PostgreSQL config for lightweight server..."
PG_CONF="/etc/postgresql/$(pg_config --version | grep -oP '\d+' | head -1)/main/postgresql.conf"
if [ -f "$PG_CONF" ]; then
  sed -i "s/^#*shared_buffers.*/shared_buffers = 128MB/" "$PG_CONF"
  sed -i "s/^#*work_mem.*/work_mem = 16MB/" "$PG_CONF"
  sed -i "s/^#*effective_cache_size.*/effective_cache_size = 256MB/" "$PG_CONF"
  sed -i "s/^#*max_connections.*/max_connections = 50/" "$PG_CONF"
  systemctl restart postgresql
  echo "  PostgreSQL config updated"
else
  echo "  Warning: Could not find postgresql.conf, skipping optimization"
fi

# 6. Run Prisma migrations and seed
echo ">> Running database migrations..."
cd /app
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/satellite-watcher?schema=public" npx prisma db push
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/satellite-watcher?schema=public" npx prisma generate

echo ">> Seeding database..."
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/satellite-watcher?schema=public" npx tsx prisma/seed.ts

# 7. Verify data
echo ">> Verifying satellite data..."
SATELLITE_COUNT=$(sudo -u postgres psql -d "satellite-watcher" -t -c "SELECT COUNT(*) FROM \"SpaceObject\";" 2>/dev/null | xargs)
echo "  Satellites in database: ${SATELLITE_COUNT:-0}"

TAG_COUNT=$(sudo -u postgres psql -d "satellite-watcher" -t -c "SELECT COUNT(*) FROM \"UserTag\";" 2>/dev/null | xargs)
echo "  Tags in database: ${TAG_COUNT:-0}"

echo ""
echo "========================================="
echo "  Local PostgreSQL setup complete!"
echo "  DATABASE_URL=postgresql://postgres:postgres@localhost:5432/satellite-watcher?schema=public"
echo "========================================="
