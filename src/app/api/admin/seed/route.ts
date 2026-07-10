import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ObjectType, Source } from '@prisma/client';
import { mockSatellites, mockTags } from '@/lib/mock/satellites';

// Re-seed the database with default LEO satellites.
// Usage: POST /api/admin/seed  (with header X-Admin-Token: <ADMIN_SEED_TOKEN>)
export async function POST(request: NextRequest) {
  const token = request.headers.get('x-admin-token');
  const expected = process.env.ADMIN_SEED_TOKEN;
  if (!expected || token !== expected) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. Remove non-LEO satellites no longer in the default dataset
    const nonLeoNoradIds = [40730, 44231]; // GPS BIIF-10 (MEO), BEIDOU-2 G8 (GEO)
    const deleted = await prisma.spaceObject.deleteMany({
      where: { noradId: { in: nonLeoNoradIds } },
    });

    // 2. Remove orphaned tag
    await prisma.userTag.deleteMany({ where: { name: '导航卫星' } });

    // 3. Upsert default satellites + TLE data
    let satCount = 0;
    let tleCount = 0;

    for (const sat of mockSatellites) {
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

    // 4. Upsert tags
    let tagCount = 0;
    for (const tag of mockTags) {
      await prisma.userTag.upsert({
        where: { name: tag.name },
        update: { color: tag.color },
        create: { name: tag.name, color: tag.color },
      });
      tagCount++;
    }

    return NextResponse.json({
      success: true,
      data: {
        deletedNonLeo: deleted.count,
        satellites: satCount,
        tleRecords: tleCount,
        tags: tagCount,
      },
    });
  } catch (error) {
    console.error('Seed error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Seed failed' },
      { status: 500 }
    );
  }
}
