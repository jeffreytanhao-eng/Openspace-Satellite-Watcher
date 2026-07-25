// 删除全部风云记录（含 PAYLOAD），以便重新 seed 获取完整的 23 颗 PAYLOAD
// 原始 seed 没有 PAYLOAD 过滤，前 100 颗里只有 8 颗 PAYLOAD
// 现在加入过滤后，seed 会获取全部 23 颗 PAYLOAD（FY-1/2/3/4 系列）
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const before = await prisma.spaceObject.count({
    where: { name: { contains: 'FENGYUN', mode: 'insensitive' } },
  });
  console.log(`删除前: ${before} 颗风云卫星`);

  // 先删除关联的 TLEData（外键约束）
  const fengyunSats = await prisma.spaceObject.findMany({
    where: { name: { contains: 'FENGYUN', mode: 'insensitive' } },
    select: { id: true, noradId: true, name: true, objectType: true },
  });
  console.log('即将删除:');
  fengyunSats.forEach(s => console.log(`  ${s.noradId}\t${s.objectType.padEnd(8)}\t${s.name}`));

  const ids = fengyunSats.map(s => s.id);
  if (ids.length > 0) {
    await prisma.tLEData.deleteMany({ where: { spaceObjectId: { in: ids } } });
    const deleted = await prisma.spaceObject.deleteMany({
      where: { id: { in: ids } },
    });
    console.log(`\n已删除 ${deleted.count} 颗风云卫星（含 TLEData）`);
  }

  const after = await prisma.spaceObject.count({
    where: { name: { contains: 'FENGYUN', mode: 'insensitive' } },
  });
  console.log(`删除后: ${after} 颗风云卫星（应为 0，下一步运行 seed 重新导入）`);
}

main().finally(() => prisma.$disconnect());
