// 检查数据库当前状态：各星座卫星数 + objectType 分布
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const total = await prisma.spaceObject.count();
  console.log(`数据库卫星总数: ${total}\n`);

  // 各 objectType 分布
  const byType = await prisma.spaceObject.groupBy({
    by: ['objectType'],
    _count: { noradId: true },
    orderBy: { _count: { noradId: 'desc' } },
  });
  console.log('全库 objectType 分布:');
  byType.forEach(g => console.log(`  ${g.objectType.padEnd(12)} ${g._count.noradId}`));
  console.log('');

  // 各星座关键字计数（与 CONSTELLATIONS_METADATA 对应）
  const keywords = [
    ['Starlink', 'STARLINK'],
    ['GPS', 'GPS'],
    ['GLONASS', 'GLONASS'],
    ['Galileo', 'GALILEO'],
    ['北斗', 'BEIDOU'],
    ['风云', 'FENGYUN'],
    ['SBIRS', 'SBIRS'],
    ['SKYNET', 'SKYNET'],
  ];
  console.log('各星座入库情况:');
  for (const [label, kw] of keywords) {
    const count = await prisma.spaceObject.count({
      where: { name: { contains: kw, mode: 'insensitive' } },
    });
    console.log(`  ${label.padEnd(10)} (${kw}) ${count} 颗`);
  }

  // 风云详细列表
  console.log('\n风云详细列表:');
  const fengyun = await prisma.spaceObject.findMany({
    where: { name: { contains: 'FENGYUN', mode: 'insensitive' } },
    select: { noradId: true, name: true, objectType: true },
    orderBy: { noradId: 'asc' },
  });
  fengyun.forEach(s => console.log(`  ${s.noradId}\t${s.objectType.padEnd(8)}\t${s.name}`));

  // 检查 DEBRIS 那一颗是谁
  const debris = await prisma.spaceObject.findMany({
    where: { objectType: 'DEBRIS' },
    select: { noradId: true, name: true, objectType: true },
  });
  console.log('\n残留 DEBRIS 记录:');
  debris.forEach(s => console.log(`  ${s.noradId}\t${s.name}`));
}

main().finally(() => prisma.$disconnect());
