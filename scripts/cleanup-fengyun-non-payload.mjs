// 清理风云非 PAYLOAD 卫星（碎片 + 火箭体），只保留 PAYLOAD
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const before = await prisma.spaceObject.count({
    where: { name: { contains: 'FENGYUN', mode: 'insensitive' } },
  });
  console.log(`风云清理前: ${before} 颗`);

  const deleted = await prisma.spaceObject.deleteMany({
    where: {
      AND: [
        { name: { contains: 'FENGYUN', mode: 'insensitive' } },
        { objectType: { not: 'PAYLOAD' } },
      ],
    },
  });
  console.log(`删除非 PAYLOAD（碎片/火箭体）: ${deleted.count} 颗`);

  const after = await prisma.spaceObject.count({
    where: { name: { contains: 'FENGYUN', mode: 'insensitive' } },
  });
  console.log(`风云清理后: ${after} 颗（应只剩 PAYLOAD）`);

  // 验证全库 objectType 分布
  const byType = await prisma.spaceObject.groupBy({
    by: ['objectType'],
    _count: { noradId: true },
    orderBy: { _count: { noradId: 'desc' } },
  });
  console.log('\n全库 objectType 分布:');
  byType.forEach(g => console.log(`  ${g.objectType.padEnd(12)} ${g._count.noradId}`));
}
main().finally(() => prisma.$disconnect());
