/**
 * 将本地 PostgreSQL 数据导入到 Neon 云数据库
 *
 * 流程：
 * 1. 用 Prisma CLI 在 Neon 上创建表结构（prisma db push --url=$NEON_DATABASE_URL）
 * 2. 调用 syncDatabases() 将本地数据推送到 Neon
 * 3. 验证 Neon 中的数据
 *
 * 使用方式：
 *   node scripts/import-to-neon.mjs
 *
 * 前提：
 * - .env.hk 中有 NEON_DATABASE_URL（已配置）
 * - 本地 Docker PostgreSQL 已运行且有数据（297 颗卫星）
 */
import { execSync } from 'child_process';
import { config } from 'dotenv';
import { resolve } from 'path';

// 加载 .env（本地 DB）和 .env.hk（Neon URL）
config({ path: resolve(process.cwd(), '.env') });
config({ path: resolve(process.cwd(), '.env.hk'), override: true });

const NEON_URL = process.env.NEON_DATABASE_URL;
const LOCAL_URL = process.env.DATABASE_URL;

console.log('=== Neon 数据导入脚本 ===\n');

if (!NEON_URL) {
  console.error('❌ NEON_DATABASE_URL 未配置（请检查 .env.hk）');
  process.exit(1);
}
if (!LOCAL_URL) {
  console.error('❌ DATABASE_URL 未配置（请检查 .env）');
  process.exit(1);
}

// 脱敏显示连接信息
const neonHost = NEON_URL.match(/@([^/]+)\//)?.[1] || 'unknown';
const localHost = LOCAL_URL.match(/@([^/]+)\//)?.[1] || 'unknown';
console.log(`本地 DB: ${localHost}`);
console.log(`Neon  DB: ${neonHost}`);
console.log();

// 步骤 1：在 Neon 上创建表结构
// prisma db push 不支持 --url 参数，用 DATABASE_URL 环境变量覆盖
console.log('[1/3] 在 Neon 上创建表结构 (prisma db push)...');
try {
  execSync(`npx prisma db push --accept-data-loss`, {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: NEON_URL, POSTGRES_URL_NON_POOLING: NEON_URL },
  });
  console.log('✅ Neon 表结构已创建\n');
} catch (e) {
  console.error('❌ prisma db push 失败:', e.message);
  process.exit(1);
}

// 步骤 2：同步数据
console.log('[2/3] 同步本地数据到 Neon (HK → Neon)...');
const { PrismaClient } = await import('@prisma/client');

const local = new PrismaClient({ datasources: { db: { url: LOCAL_URL } } });
const neon = new PrismaClient({ datasources: { db: { url: NEON_URL } } });

try {
  const localSats = await local.spaceObject.findMany({
    include: { tleData: { take: 1, orderBy: { epoch: 'desc' } } },
  });
  console.log(`本地卫星数: ${localSats.length}`);

  let upserted = 0;
  let failed = 0;
  for (const sat of localSats) {
    try {
      const tle = sat.tleData[0];
      const data = {
        noradId: sat.noradId,
        name: sat.name,
        country: sat.country,
        objectType: sat.objectType,
        launchDate: sat.launchDate,
        launchSite: sat.launchSite,
        owner: sat.owner,
        isActive: sat.isActive,
        model3dUrl: sat.model3dUrl,
        imageUrl: sat.imageUrl,
      };
      await neon.spaceObject.upsert({
        where: { noradId: sat.noradId },
        create: {
          ...data,
          tleData: tle ? { create: [{ line1: tle.line1, line2: tle.line2, epoch: tle.epoch, source: tle.source }] } : undefined,
        },
        update: {
          ...data,
          tleData: tle ? { deleteMany: {}, create: [{ line1: tle.line1, line2: tle.line2, epoch: tle.epoch, source: tle.source }] } : undefined,
        },
      });
      upserted++;
      if (upserted % 50 === 0) console.log(`  已同步 ${upserted}/${localSats.length}...`);
    } catch (e) {
      failed++;
      console.error(`  ❌ ${sat.noradId} ${sat.name}: ${e.message}`);
    }
  }
  console.log(`✅ 同步完成: ${upserted} 成功, ${failed} 失败\n`);
} finally {
  await local.$disconnect();
}

// 步骤 3：验证 Neon 数据
console.log('[3/3] 验证 Neon 数据...');
try {
  const neonSats = await neon.spaceObject.findMany({
    include: { tleData: { take: 1 } },
  });
  console.log(`Neon 卫星总数: ${neonSats.length}`);

  const byType = {};
  for (const s of neonSats) {
    byType[s.objectType] = (byType[s.objectType] || 0) + 1;
  }
  console.log('objectType 分布:');
  for (const [type, count] of Object.entries(byType)) {
    console.log(`  ${type.padEnd(12)} ${count}`);
  }

  // 检查风云
  const fengyun = neonSats.filter(s => s.name?.toUpperCase().includes('FENGYUN'));
  console.log(`\n风云卫星: ${fengyun.length} 颗（应为 23 颗 PAYLOAD）`);

  // 检查缺省卫星
  const defaults = neonSats.filter(s => [25544, 20580, 48274, 53239, 54216, 25994, 27424, 28376, 39084, 39634, 43013, 44714, 41270].includes(s.noradId));
  console.log(`缺省卫星: ${defaults.length} 颗（应为 13 颗）`);

  console.log('\n✅ Neon 导入完成！');
} finally {
  await neon.$disconnect();
}
