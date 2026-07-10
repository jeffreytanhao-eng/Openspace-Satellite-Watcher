import { PrismaClient, ObjectType, Source } from '@prisma/client';
import { mockSatellites, mockTags } from '../src/lib/mock/satellites';

const prisma = new PrismaClient();

/**
 * Seed script — imports mock satellite data and tags into the database.
 * Run with: npx prisma db seed
 * Or:       npx tsx prisma/seed.ts
 */
async function main() {
  console.log('Seeding database...');

  // 0. Remove non-LEO satellites that are no longer in the default dataset
  const nonLeoNoradIds = [40730, 44231]; // GPS BIIF-10 (MEO), BEIDOU-2 G8 (GEO)
  const deleted = await prisma.spaceObject.deleteMany({
    where: { noradId: { in: nonLeoNoradIds } },
  });
  if (deleted.count > 0) {
    console.log(`  Removed ${deleted.count} non-LEO satellites`);
  }

  // Remove the now-orphaned "导航卫星" tag
  await prisma.userTag.deleteMany({ where: { name: '导航卫星' } });

  // 1. Seed satellites + TLE data
  let satCount = 0;
  let tleCount = 0;

  for (const sat of mockSatellites) {
    // Parse TLE epoch from line1 (columns 19-32: YYDDD.FFFFFFF)
    // e.g. "26189.15353387" → year 2026, day 189
    const epochStr = sat.tleData.line1.substring(18, 32).trim();
    const year = 2000 + parseInt(epochStr.substring(0, 2));
    const dayOfYear = parseFloat(epochStr.substring(2));
    const epoch = new Date(year, 0, 1);
    epoch.setDate(epoch.getDate() + dayOfYear - 1);

    const spaceObject = await prisma.spaceObject.upsert({
      where: { noradId: sat.noradId },
      update: {
        name: sat.name,
        country: sat.country,
        objectType: sat.objectType as ObjectType,
        launchDate: sat.launchDate ? new Date(sat.launchDate) : null,
        launchSite: sat.launchSite || null,
        owner: sat.owner || null,
        isActive: sat.isActive,
        model3dUrl: (sat as any).model3dUrl || null,
        imageUrl: (sat as any).imageUrl || null,
      },
      create: {
        noradId: sat.noradId,
        name: sat.name,
        country: sat.country,
        objectType: sat.objectType as ObjectType,
        launchDate: sat.launchDate ? new Date(sat.launchDate) : null,
        launchSite: sat.launchSite || null,
        owner: sat.owner || null,
        isActive: sat.isActive,
        model3dUrl: (sat as any).model3dUrl || null,
        imageUrl: (sat as any).imageUrl || null,
      },
    });

    // Insert TLE data
    await prisma.tLEData.upsert({
      where: {
        spaceObjectId_epoch: {
          spaceObjectId: spaceObject.id,
          epoch,
        },
      },
      update: {
        line1: sat.tleData.line1,
        line2: sat.tleData.line2,
        source: Source.CELESTRAK_API,
      },
      create: {
        spaceObjectId: spaceObject.id,
        line1: sat.tleData.line1,
        line2: sat.tleData.line2,
        epoch,
        source: Source.CELESTRAK_API,
      },
    });

    satCount++;
    tleCount++;
  }

  console.log(`  Satellites: ${satCount}`);
  console.log(`  TLE records: ${tleCount}`);

  // 2. Seed tags
  let tagCount = 0;
  for (const tag of mockTags) {
    await prisma.userTag.upsert({
      where: { name: tag.name },
      update: { color: tag.color },
      create: {
        name: tag.name,
        color: tag.color,
      },
    });
    tagCount++;
  }

  console.log(`  Tags: ${tagCount}`);
  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
