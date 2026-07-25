// 详细验证 Neon 数据库与本地是否一致
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.hk') });

const NEON_URL = process.env.NEON_DATABASE_URL;
const { PrismaClient } = await import('@prisma/client');
const neon = new PrismaClient({ datasources: { db: { url: NEON_URL } } });

try {
  console.log('=== Neon 数据库详细验证 ===\n');

  // 1. 总数
  const total = await neon.spaceObject.count();
  console.log(`卫星总数: ${total}（本地: 297）`);

  // 2. 各星座
  const keywords = [
    ['Starlink', 'STARLINK'], ['GPS', 'GPS'], ['GLONASS', 'GLONASS'],
    ['Galileo', 'GALILEO'], ['北斗', 'BEIDOU'], ['风云', 'FENGYUN'],
    ['SBIRS', 'SBIRS'], ['SKYNET', 'SKYNET'],
  ];
  console.log('\n各星座:');
  for (const [label, kw] of keywords) {
    const count = await neon.spaceObject.count({
      where: { name: { contains: kw, mode: 'insensitive' } },
    });
    console.log(`  ${label.padEnd(10)} ${count} 颗`);
  }

  // 3. 风云详细（验证全部为 PAYLOAD）
  console.log('\n风云详细:');
  const fengyun = await neon.spaceObject.findMany({
    where: { name: { contains: 'FENGYUN', mode: 'insensitive' } },
    select: { noradId: true, name: true, objectType: true },
    orderBy: { noradId: 'asc' },
  });
  fengyun.forEach(s => console.log(`  ${s.noradId}\t${s.objectType.padEnd(8)}\t${s.name}`));

  // 4. 检查是否有非 PAYLOAD 的风云记录（应为 0）
  const nonPayloadFengyun = await neon.spaceObject.count({
    where: {
      AND: [
        { name: { contains: 'FENGYUN', mode: 'insensitive' } },
        { objectType: { not: 'PAYLOAD' } },
      ],
    },
  });
  console.log(`\n非 PAYLOAD 风云记录: ${nonPayloadFengyun}（应为 0）`);

  // 5. 检查 TLE 数据
  const tleCount = await neon.tLEData.count();
  console.log(`TLE 数据条数: ${tleCount}`);

  // 6. 检查 13 颗缺省卫星
  const defaultIds = [25544, 20580, 48274, 53239, 54216, 25994, 27424, 28376, 39084, 39634, 43013, 44714, 41270];
  const defaults = await neon.spaceObject.count({
    where: { noradId: { in: defaultIds } },
  });
  console.log(`缺省卫星: ${defaults}/13 颗`);

  console.log('\n✅ Neon 验证完成');
} catch (e) {
  console.error('❌ 验证失败:', e.message);
} finally {
  await neon.$disconnect();
}
