import { PrismaClient } from '@prisma/client';
import { prisma } from './prisma';

export interface SyncResult {
  success: boolean;
  direction: 'hk-to-neon' | 'neon-to-hk' | 'none';
  count: number;
  error?: string;
}

/**
 * HK 与 Neon 数据库双向同步
 * - HK 为基准：将 HK 数据同步到 Neon
 * - 如果 HK 表为空但 Neon 有数据，则反向从 Neon 同步到 HK
 */
export async function syncDatabases(): Promise<SyncResult> {
  const neonUrl = process.env.NEON_DATABASE_URL;
  if (!neonUrl) {
    return { success: false, direction: 'none', count: 0, error: 'NEON_DATABASE_URL 未配置，跳过同步' };
  }

  let neon: PrismaClient | null = null;
  try {
    neon = new PrismaClient({ datasources: { db: { url: neonUrl } } });

    // 读取 HK 本地数据（含最新 TLE）
    const hkSats = await prisma.spaceObject.findMany({
      include: { tleData: { take: 1, orderBy: { epoch: 'desc' } } },
    });

    // 读取 Neon 远程数据
    const neonSats = await neon.spaceObject.findMany({
      include: { tleData: { take: 1, orderBy: { epoch: 'desc' } } },
    });

    if (hkSats.length === 0 && neonSats.length > 0) {
      // HK 空，Neon 有数据 → Neon → HK
      for (const sat of neonSats) {
        const tle = sat.tleData[0];
        const data = extractSatFields(sat);
        await prisma.spaceObject.upsert({
          where: { noradId: sat.noradId },
          create: {
            ...data,
            tleData: tle ? { create: [extractTleFields(tle)] } : undefined,
          },
          update: {
            ...data,
            tleData: tle ? { deleteMany: {}, create: [extractTleFields(tle)] } : undefined,
          },
        });
      }
      return { success: true, direction: 'neon-to-hk', count: neonSats.length };
    } else {
      // HK 为基准 → HK → Neon
      for (const sat of hkSats) {
        const tle = sat.tleData[0];
        const data = extractSatFields(sat);
        await neon.spaceObject.upsert({
          where: { noradId: sat.noradId },
          create: {
            ...data,
            tleData: tle ? { create: [extractTleFields(tle)] } : undefined,
          },
          update: {
            ...data,
            tleData: tle ? { deleteMany: {}, create: [extractTleFields(tle)] } : undefined,
          },
        });
      }
      return { success: true, direction: 'hk-to-neon', count: hkSats.length };
    }
  } catch (error) {
    return { success: false, direction: 'none', count: 0, error: (error as Error).message };
  } finally {
    if (neon) await neon.$disconnect();
  }
}

function extractSatFields(sat: {
  noradId: number; name: string; country: string | null;
  objectType: any; launchDate: Date | null; launchSite: string | null;
  owner: string | null; isActive: boolean;
  model3dUrl: string | null; imageUrl: string | null;
}) {
  return {
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
}

function extractTleFields(tle: {
  line1: string; line2: string; epoch: Date; source: any;
}) {
  return {
    line1: tle.line1,
    line2: tle.line2,
    epoch: tle.epoch,
    source: tle.source,
  };
}
