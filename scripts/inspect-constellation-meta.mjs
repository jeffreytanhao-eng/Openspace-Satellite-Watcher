// 临时诊断脚本：检查预导入星座卫星的元数据完整性
// 用法：node scripts/inspect-constellation-meta.mjs
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CONSTELLATIONS = [
  { name: 'Starlink', keyword: 'STARLINK' },
  { name: 'GPS', keyword: 'GPS' },
  { name: 'GLONASS', keyword: 'GLONASS' },
  { name: 'Galileo', keyword: 'GALILEO' },
  { name: '北斗', keyword: 'BEIDOU' },
  { name: '风云', keyword: 'FENGYUN' },
  { name: 'SBIRS', keyword: 'SBIRS' },
  { name: 'SKYNET', keyword: 'SKYNET' },
];

async function main() {
  console.log('\n=== 预导入星座元数据完整性检查 ===\n');
  for (const c of CONSTELLATIONS) {
    const sats = await prisma.spaceObject.findMany({
      where: { name: { contains: c.keyword, mode: 'insensitive' } },
      select: {
        noradId: true, name: true, country: true, objectType: true,
        launchDate: true, launchSite: true, owner: true,
        model3dUrl: true, imageUrl: true, isActive: true,
      },
      orderBy: { noradId: 'asc' },
    });
    if (sats.length === 0) {
      console.log(`[${c.name}] 未入库 (0 颗)`);
      continue;
    }
    const total = sats.length;
    const noCountry = sats.filter(s => !s.country).length;
    const noLaunch = sats.filter(s => !s.launchDate).length;
    const noImg = sats.filter(s => !s.imageUrl).length;
    const noModel = sats.filter(s => !s.model3dUrl).length;
    const notPayload = sats.filter(s => s.objectType !== 'PAYLOAD').length;
    console.log(`[${c.name}] 共 ${total} 颗:`);
    console.log(`  缺 country:    ${noCountry}/${total}`);
    console.log(`  缺 launchDate: ${noLaunch}/${total}`);
    console.log(`  缺 imageUrl:   ${noImg}/${total}`);
    console.log(`  缺 model3dUrl: ${noModel}/${total}`);
    console.log(`  非 PAYLOAD:    ${notPayload}/${total}`);
    const sample = sats[0];
    console.log(`  样本: noradId=${sample.noradId} name="${sample.name}" country=${sample.country} objectType=${sample.objectType} launchDate=${sample.launchDate} imgLen=${sample.imageUrl?.length || 0}`);
    console.log('');
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
