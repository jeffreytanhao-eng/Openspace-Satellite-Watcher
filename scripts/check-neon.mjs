// 检查 Neon 数据库当前状态（是否已有数据、表结构是否存在）
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.hk') });

const NEON_URL = process.env.NEON_DATABASE_URL;
if (!NEON_URL) {
  console.error('❌ NEON_DATABASE_URL 未配置');
  process.exit(1);
}

const { PrismaClient } = await import('@prisma/client');
const neon = new PrismaClient({ datasources: { db: { url: NEON_URL } } });

try {
  console.log('连接 Neon:', NEON_URL.match(/@([^/]+)\//)?.[1] || 'unknown');
  const count = await neon.spaceObject.count();
  console.log(`Neon SpaceObject 数量: ${count}`);

  if (count > 0) {
    const byType = await neon.spaceObject.groupBy({
      by: ['objectType'],
      _count: { noradId: true },
    });
    console.log('objectType 分布:');
    byType.forEach(g => console.log(`  ${g.objectType.padEnd(12)} ${g._count.noradId}`));

    const fengyun = await neon.spaceObject.count({
      where: { name: { contains: 'FENGYUN', mode: 'insensitive' } },
    });
    console.log(`风云卫星: ${fengyun} 颗`);
  } else {
    console.log('Neon 数据库为空（需要运行 import-to-neon.mjs 导入数据）');
  }
} catch (e) {
  console.error('❌ Neon 连接失败:', e.message);
  if (e.message.includes('does not exist') || e.message.includes('relation')) {
    console.error('表结构不存在，需要先运行 prisma db push');
  }
} finally {
  await neon.$disconnect();
}
