import { PrismaClient, ObjectType, Source } from '@prisma/client';
import { mockSatellites, mockTags } from '../src/lib/mock/satellites';
import { CONSTELLATIONS_METADATA } from '../src/lib/constellation-metadata';
import { importConstellation, IMPORT_LIMIT } from '../src/lib/constellation-import';
import { parseEpoch } from '../src/lib/tle-utils';

const prisma = new PrismaClient();

/**
 * Seed script — 导入缺省卫星 + 标签 + 预导入星座到数据库。
 * Run with: npx prisma db seed
 * Or:       npx tsx prisma/seed.ts
 *
 * 幂等性：
 * - 缺省卫星用 upsert（重复运行只更新不重复创建）
 * - 星座预导入用 skipIfExists=true（已入库星座跳过，避免每次部署都打 Celestrak 8 次）
 * - 容错：单星座 Celestrak 拉取失败不中断，记录警告继续
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
    // parseEpoch 来自共享 tle-utils（含 1957 阈值判断，修正了原 seed.ts 的 bug）
    const epoch = parseEpoch(sat.tleData.line1);

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
        model3dUrl: sat.model3dUrl || null,
        imageUrl: sat.imageUrl || null,
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
        model3dUrl: sat.model3dUrl || null,
        imageUrl: sat.imageUrl || null,
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

  // 3. Seed constellations from Celestrak (best-effort, idempotent)
  // 预入库 8 个星座，使前端首次启动即有数据，不依赖用户手动点击导入。
  // skipIfExists=true：已入库星座跳过，避免每次部署都 fetch Celestrak。
  console.log('Seeding constellations from Celestrak...');
  let constellationImported = 0;
  let constellationSkipped = 0;
  let constellationFailed = 0;

  for (let i = 0; i < CONSTELLATIONS_METADATA.length; i++) {
    const meta = CONSTELLATIONS_METADATA[i];
    const progress = `[${i + 1}/${CONSTELLATIONS_METADATA.length}] ${meta.name}`;
    try {
      const result = await importConstellation(meta, {
        prisma,
        limit: IMPORT_LIMIT,
        timeoutMs: 15000,
        skipIfExists: true,
      });
      if (result.skipped) {
        console.log(`  ${progress}: skipped (already seeded)`);
        constellationSkipped++;
      } else if (result.success) {
        console.log(
          `  ${progress}: ${result.upserted} satellites${result.truncated ? ' (truncated)' : ''}${
            result.dbFailures.length > 0 ? `, ${result.dbFailures.length} db failures` : ''
          }`
        );
        constellationImported++;
      } else {
        console.warn(`  ${progress}: FAILED — ${result.error}`);
        constellationFailed++;
      }
    } catch (e) {
      console.warn(`  ${progress}: ERROR — ${(e as Error).message}`);
      constellationFailed++;
    }
  }
  console.log(
    `  Constellations: ${constellationImported} imported, ${constellationSkipped} skipped, ${constellationFailed} failed`
  );

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
