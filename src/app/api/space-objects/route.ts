import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ObjectType, Source } from '@prisma/client';
import { mockSatellites } from '@/lib/mock/satellites';

// Parse TLE line2 to extract orbital elements
function parseTLEElements(line2: string, noradId: number) {
  const inclination = parseFloat(line2.substring(8, 16).trim()) || 0;
  const raan = parseFloat(line2.substring(17, 25).trim()) || 0;
  const eccentricity = parseFloat('0.' + line2.substring(26, 33).trim()) || 0;
  const argPerigee = parseFloat(line2.substring(34, 42).trim()) || 0;
  const meanAnomaly = parseFloat(line2.substring(43, 51).trim()) || 0;
  const meanMotion = parseFloat(line2.substring(52, 63).trim()) || 0;
  return {
    noradId: String(noradId),
    inclination, raan, eccentricity, argPerigee, meanAnomaly, meanMotion,
    revolutionNumber: 0
  };
}

// Parse TLE epoch from line1 (columns 19-32: YYDDD.FFFFFFF)
function parseTLEEpoch(line1: string): Date {
  const epochStr = line1.substring(18, 32).trim();
  const year = 2000 + parseInt(epochStr.substring(0, 2));
  const dayOfYear = parseFloat(epochStr.substring(2));
  const epoch = new Date(year, 0, 1);
  epoch.setDate(epoch.getDate() + dayOfYear - 1);
  return epoch;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');
    const skip = (page - 1) * pageSize;
    
    const filters: Record<string, unknown> = {};
    
    const name = searchParams.get('name');
    if (name) filters.name = { contains: name, mode: 'insensitive' };
    
    const noradId = searchParams.get('noradId');
    if (noradId) filters.noradId = parseInt(noradId);
    
    const country = searchParams.get('country');
    if (country) filters.country = { contains: country, mode: 'insensitive' };
    
    const objectType = searchParams.get('objectType');
    if (objectType && ObjectType[objectType as keyof typeof ObjectType]) {
      filters.objectType = objectType;
    }
    
    const isActive = searchParams.get('isActive');
    if (isActive) filters.isActive = isActive === 'true';
    
    const [items, total] = await Promise.all([
      prisma.spaceObject.findMany({
        where: filters,
        skip,
        take: pageSize,
        include: { tleData: { take: 1, orderBy: { epoch: 'desc' } }, tags: true },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.spaceObject.count({ where: filters })
    ]);
    
    return NextResponse.json({
      success: true,
      data: items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize)
      }
    });
  } catch (error) {
    console.warn('Database unavailable, using mock data:', error);
    const { searchParams } = new URL(request.url);
    const mockItems = mockSatellites.map((sat, index) => ({
      ...sat,
      id: `mock-${index}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: [],
      tleData: sat.tleData ? [{
        name: sat.tleData.name,
        noradId: String(sat.noradId),
        line1: sat.tleData.line1,
        line2: sat.tleData.line2,
        epoch: new Date(),
        elements: parseTLEElements(sat.tleData.line2, sat.noradId)
      }] : []
    }));
    
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');
    const skip = (page - 1) * pageSize;
    
    return NextResponse.json({
      success: true,
      data: mockItems.slice(skip, skip + pageSize),
      pagination: {
        page,
        pageSize,
        total: mockItems.length,
        totalPages: Math.ceil(mockItems.length / pageSize)
      }
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.noradId || !body.name) {
      return NextResponse.json(
        { success: false, error: 'NORAD ID 和名称为必填项' },
        { status: 400 }
      );
    }

    const existing = await prisma.spaceObject.findUnique({
      where: { noradId: body.noradId }
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: `NORAD ID ${body.noradId} 已存在` },
        { status: 409 }
      );
    }

    // Optional TLE data passed from the client (batch import)
    const tle = body.tleData as { line1: string; line2: string } | undefined;
    const epoch = tle ? parseTLEEpoch(tle.line1) : undefined;

    const spaceObject = await prisma.spaceObject.create({
      data: {
        noradId: body.noradId,
        name: body.name,
        country: body.country,
        objectType: body.objectType || ObjectType.UNKNOWN,
        launchDate: body.launchDate ? new Date(body.launchDate) : undefined,
        launchSite: body.launchSite,
        owner: body.owner,
        isActive: body.isActive !== undefined ? body.isActive : true,
        // Atomically create the TLE record in the same transaction
        ...(tle && epoch
          ? {
              tleData: {
                create: {
                  line1: tle.line1,
                  line2: tle.line2,
                  epoch,
                  source: Source.CELESTRAK_API,
                },
              },
            }
          : {}),
      },
      include: { tleData: { take: 1, orderBy: { epoch: 'desc' } }, tags: true }
    });

    return NextResponse.json({ success: true, data: spaceObject }, { status: 201 });
  } catch (error) {
    console.error('POST space-objects error:', error);
    return NextResponse.json(
      { success: false, error: '创建目标失败' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!body.id) {
      return NextResponse.json(
        { success: false, error: '目标 ID 为必填项' },
        { status: 400 }
      );
    }
    
    const spaceObject = await prisma.spaceObject.update({
      where: { id: body.id },
      data: {
        name: body.name,
        country: body.country,
        objectType: body.objectType,
        launchDate: body.launchDate ? new Date(body.launchDate) : undefined,
        launchSite: body.launchSite,
        owner: body.owner,
        isActive: body.isActive
      },
      include: { tleData: { take: 1, orderBy: { epoch: 'desc' } }, tags: true }
    });
    
    return NextResponse.json({ success: true, data: spaceObject });
  } catch (error) {
    console.error('PUT space-objects error:', error);
    return NextResponse.json(
      { success: false, error: '更新目标失败' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!body.id) {
      return NextResponse.json(
        { success: false, error: '目标 ID 为必填项' },
        { status: 400 }
      );
    }
    
    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.country !== undefined) updateData.country = body.country;
    if (body.objectType !== undefined) updateData.objectType = body.objectType;
    if (body.launchDate !== undefined) updateData.launchDate = new Date(body.launchDate);
    if (body.launchSite !== undefined) updateData.launchSite = body.launchSite;
    if (body.owner !== undefined) updateData.owner = body.owner;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    
    const spaceObject = await prisma.spaceObject.update({
      where: { id: body.id },
      data: updateData,
      include: { tleData: { take: 1, orderBy: { epoch: 'desc' } }, tags: true }
    });
    
    return NextResponse.json({ success: true, data: spaceObject });
  } catch (error) {
    console.error('PATCH space-objects error:', error);
    return NextResponse.json(
      { success: false, error: '更新目标失败' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: '目标 ID 为必填项' },
        { status: 400 }
      );
    }
    
    await prisma.spaceObject.delete({ where: { id } });
    
    return NextResponse.json({ success: true, message: '删除成功' });
  } catch (error) {
    console.error('DELETE space-objects error:', error);
    return NextResponse.json(
      { success: false, error: '删除目标失败' },
      { status: 500 }
    );
  }
}