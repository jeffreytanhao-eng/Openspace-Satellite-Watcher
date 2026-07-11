import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ObjectType, Source } from '@prisma/client';
import { mockSatellites } from '@/lib/mock/satellites';
import { verifyPassword } from '@/lib/security';

function parseTLEEpoch(line1: string): Date {
  const yearStr = line1.slice(18, 20).trim();
  const dayStr = line1.slice(20, 32).trim();
  const fullYear = parseInt(yearStr, 10) >= 57 ? 1900 + parseInt(yearStr, 10) : 2000 + parseInt(yearStr, 10);
  const dayOfYear = parseFloat(dayStr);
  const start = new Date(Date.UTC(fullYear, 0, 1));
  return new Date(start.getTime() + (dayOfYear - 1) * 86400000);
}

function getMockSatellites() {
  return mockSatellites.map((sat, idx) => {
    const epoch = parseTLEEpoch(sat.tleData.line1);
    return {
      id: `mock-${idx}`,
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
      createdAt: new Date(),
      updatedAt: new Date(),
      tleData: [{
        id: `tle-mock-${idx}`,
        spaceObjectId: `mock-${idx}`,
        name: sat.tleData.name || sat.name,
        line1: sat.tleData.line1,
        line2: sat.tleData.line2,
        epoch,
        fetchedAt: new Date(),
        source: Source.CELESTRAK_API,
      }],
      tags: [],
    };
  });
}

function serializeSatellite(s: any) {
  return {
    ...s,
    launchDate: s.launchDate ? (s.launchDate instanceof Date ? s.launchDate.toISOString() : s.launchDate) : null,
    createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
    updatedAt: s.updatedAt instanceof Date ? s.updatedAt.toISOString() : s.updatedAt,
    tleData: (s.tleData || []).map((t: any) => ({
      ...t,
      epoch: t.epoch instanceof Date ? t.epoch.toISOString() : t.epoch,
      fetchedAt: t.fetchedAt instanceof Date ? t.fetchedAt.toISOString() : t.fetchedAt,
    })),
  };
}

// GET：从数据库读取所有默认卫星（无需密码），DB不可用时返回内置默认数据
export async function GET() {
  try {
    const satellites = await prisma.spaceObject.findMany({
      include: {
        tleData: { take: 1, orderBy: { epoch: 'desc' } },
        tags: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const data = satellites.map(serializeSatellite);
    return NextResponse.json({
      success: true,
      data,
      pagination: { page: 1, pageSize: 500, total: data.length, totalPages: 1 },
    });
  } catch (error) {
    console.warn('DB unavailable, returning mock satellites:', (error as Error).message);
    const data = getMockSatellites().map(serializeSatellite);
    return NextResponse.json({
      success: true,
      data,
      pagination: { page: 1, pageSize: 500, total: data.length, totalPages: 1 },
      notice: '使用内置默认数据（数据库连接失败）',
    });
  }
}

// POST/PUT/DELETE 暂不开放（等用户系统引入后再开放）
export async function POST() {
  return NextResponse.json({ success: false, error: '卫星数据写入功能将在下个版本开放' }, { status: 403 });
}
export async function PUT() {
  return NextResponse.json({ success: false, error: '卫星数据写入功能将在下个版本开放' }, { status: 403 });
}
export async function PATCH() {
  return NextResponse.json({ success: false, error: '卫星数据写入功能将在下个版本开放' }, { status: 403 });
}
export async function DELETE() {
  return NextResponse.json({ success: false, error: '卫星数据删除功能将在下个版本开放' }, { status: 403 });
}
