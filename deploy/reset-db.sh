#!/bin/bash
set -e
cd /app

echo ">> Reading DATABASE_URL..."
DB_URL=""
for f in .env.production .env ecosystem.config.cjs; do
  if [ -f "$f" ]; then
    VAL=$(grep -E 'DATABASE_URL|POSTGRES_PRISMA_URL' "$f" 2>/dev/null | grep -v UNPOOLED | grep -v NO_SSL | head -1 | sed 's/.*DATABASE_URL=//;s/.*POSTGRES_PRISMA_URL=//' | tr -d '"' | tr -d "'" | tr -d ',')
    if [ -n "$VAL" ]; then
      DB_URL="$VAL"
      echo "   Found in $f"
      break
    fi
  fi
done

if [ -z "$DB_URL" ]; then
  echo "ERROR: Could not find DATABASE_URL"
  exit 1
fi
echo "   DB URL: ${DB_URL:0:40}..."

cat > /tmp/reset-db.js << 'JSEOF'
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// 12 default satellites from mockData.ts
const DEFAULT_NORAD_IDS = [25544, 48274, 25338, 43013, 20580, 41883, 27451, 39418, 41174, 46984, 55908, 44897];

async function main() {
  const totalBefore = await prisma.spaceObject.count();
  const defaultBefore = await prisma.spaceObject.count({ where: { noradId: { in: DEFAULT_NORAD_IDS } } });
  const extraBefore = totalBefore - defaultBefore;
  console.log('Before reset: total=' + totalBefore + ' default=' + defaultBefore + ' extra=' + extraBefore);

  const deletedTLEs = await prisma.tLEData.deleteMany({
    where: { spaceObject: { noradId: { notIn: DEFAULT_NORAD_IDS } } }
  });
  console.log('Deleted TLE records: ' + deletedTLEs.count);

  const deletedSats = await prisma.spaceObject.deleteMany({
    where: { noradId: { notIn: DEFAULT_NORAD_IDS } }
  });
  console.log('Deleted extra satellites: ' + deletedSats.count);

  const totalAfter = await prisma.spaceObject.count();
  console.log('After reset: total=' + totalAfter);

  const sats = await prisma.spaceObject.findMany({ select: { noradId: true, name: true }, orderBy: { noradId: 'asc' } });
  sats.forEach(s => console.log('  ' + s.noradId + ' - ' + s.name));
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
JSEOF

echo ">> Running DB reset..."
NODE_PATH=/app/node_modules node /tmp/reset-db.js
rm -f /tmp/reset-db.js
echo ""
echo ">> Reset complete!"
