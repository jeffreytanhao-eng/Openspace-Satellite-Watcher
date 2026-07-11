import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { mockSatellites, mockTags } from '@/lib/mock/satellites';
import { Source, ObjectType } from '@prisma/client';
import { verifyPassword } from '@/lib/security';

function parseTLEEpoch(line1: string): Date {
  const yearStr = line1.slice(18, 20).trim();
  const dayStr = line1.slice(20, 32).trim();
  const fullYear = parseInt(yearStr, 10) >= 57 ? 1900 + parseInt(yearStr, 10) : 2000 + parseInt(yearStr, 10);
  const dayOfYear = parseFloat(dayStr);
  const start = new Date(Date.UTC(fullYear, 0, 1));
  return new Date(start.getTime() + (dayOfYear - 1) * 86400000);
}

// POST：管理员初始化种子数据
export async function POST(request: NextRequest) {
  if (!verifyPassword(request)) {
    return NextResponse.json({ success: false, error: '需要管理员权限' }, { status: 401 });
  }

  try {
    let satellitesCreated = 0;
    let tleCreated = 0;
    let tagsCreated = 0;

    for (const sat of mockSatellites) {
      const epoch = parseTLEEpoch(sat.tleData.line1);
      await prisma.spaceObject.upsert({
        where: { noradId: sat.noradId },
        update: {
          name: sat.name,
          country: sat.country || null,
          objectType: (sat.objectType as ObjectType) || ObjectType.PAYLOAD,
          launchDate: sat.launchDate ? new Date(sat.launchDate) : null,
          launchSite: sat.launchSite || null,
          owner: sat.owner || null,
          isActive: sat.isActive !== false,
          model3dUrl: sat.model3dUrl || null,
          imageUrl: sat.imageUrl || null,
        },
        create: {
          noradId: sat.noradId,
          name: sat.name,
          country: sat.country || null,
          objectType: (sat.objectType as ObjectType) || ObjectType.PAYLOAD,
          launchDate: sat.launchDate ? new Date(sat.launchDate) : null,
          launchSite: sat.launchSite || null,
          owner: sat.owner || null,
          isActive: sat.isActive !== false,
          model3dUrl: sat.model3dUrl || null,
          imageUrl: sat.imageUrl || null,
        },
      });
      satellitesCreated++;

      const spaceObject = await prisma.spaceObject.findUnique({ where: { noradId: sat.noradId } });
      if (spaceObject) {
        await prisma.tLEData.upsert({
          where: {
            spaceObjectId_epoch: { spaceObjectId: spaceObject.id, epoch },
          },
          update: {
            line1: sat.tleData.line1,
            line2: sat.tleData.line2,
            name: sat.tleData.name || sat.name,
            source: Source.CELESTRAK_API,
          },
          create: {
            spaceObjectId: spaceObject.id,
            name: sat.tleData.name || sat.name,
            line1: sat.tleData.line1,
            line2: sat.tleData.line2,
            epoch,
            source: Source.CELESTRAK_API,
          },
        });
        tleCreated++;
      }
    }

    for (const tag of mockTags) {
      await prisma.userTag.upsert({
        where: { name: tag.name },
        update: { color: tag.color },
        create: { name: tag.name, color: tag.color },
      });
      tagsCreated++;
    }

    return NextResponse.json({
      success: true,
      data: { satellites: satellitesCreated, tleRecords: tleCreated, tags: tagsCreated },
    });
  } catch (error) {
    console.error('Seed error:', error);
    return NextResponse.json({ success: false, error: '种子数据初始化失败' }, { status: 500 });
  }
}
