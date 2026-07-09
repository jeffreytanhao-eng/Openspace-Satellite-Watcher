import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ObjectType } from '@prisma/client';
import { parseTLE } from '@/lib/tle/parser';
import { createSatrec, calculateOrbitParams } from '@/lib/tle/orbit';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const {
      noradId,
      name,
      country,
      objectType,
      launchYear,
      minAltitude,
      maxAltitude,
      isActive,
      page = 1,
      pageSize = 20
    } = body;
    
    const skip = (page - 1) * pageSize;
    const filters: Record<string, unknown> = {};
    
    if (noradId) {
      filters.noradId = parseInt(noradId);
    }
    
    if (name) {
      filters.name = { contains: name, mode: 'insensitive' };
    }
    
    if (country) {
      filters.country = { contains: country, mode: 'insensitive' };
    }
    
    if (objectType && ObjectType[objectType as keyof typeof ObjectType]) {
      filters.objectType = objectType;
    }
    
    if (isActive !== undefined) {
      filters.isActive = isActive;
    }
    
    if (launchYear) {
      const year = parseInt(launchYear);
      filters.launchDate = {
        gte: new Date(year, 0, 1),
        lte: new Date(year, 11, 31)
      };
    }
    
    const spaceObjects = await prisma.spaceObject.findMany({
      where: filters,
      include: {
        tleData: { take: 1, orderBy: { epoch: 'desc' } }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    let filteredObjects = spaceObjects;
    
    if ((minAltitude !== undefined && minAltitude !== null) || 
        (maxAltitude !== undefined && maxAltitude !== null)) {
      filteredObjects = spaceObjects.filter(obj => {
        if (!obj.tleData || obj.tleData.length === 0) return false;
        
        const tle = obj.tleData[0];
        const tleText = `${tle.line1}\n${tle.line2}`;
        const parseResult = parseTLE(tleText);
        
        if (!parseResult.success || !parseResult.data) return false;
        
        try {
          const satrec = createSatrec(parseResult.data);
          const orbitParams = calculateOrbitParams(satrec);
          const avgAltitude = (orbitParams.perigeeAltitude + orbitParams.apogeeAltitude) / 2;
          
          const passesMin = !minAltitude || avgAltitude >= minAltitude;
          const passesMax = !maxAltitude || avgAltitude <= maxAltitude;
          
          return passesMin && passesMax;
        } catch {
          return false;
        }
      });
    }
    
    const total = filteredObjects.length;
    const paginatedObjects = filteredObjects.slice(skip, skip + pageSize);
    
    const resultsWithOrbitInfo = await Promise.all(
      paginatedObjects.map(async obj => {
        let orbitInfo = null;
        
        if (obj.tleData && obj.tleData.length > 0) {
          const tle = obj.tleData[0];
          const tleText = `${tle.line1}\n${tle.line2}`;
          const parseResult = parseTLE(tleText);
          
          if (parseResult.success && parseResult.data) {
            try {
              const satrec = createSatrec(parseResult.data);
              orbitInfo = calculateOrbitParams(satrec);
            } catch {
              orbitInfo = null;
            }
          }
        }
        
        return {
          ...obj,
          orbitInfo
        };
      })
    );
    
    return NextResponse.json({
      success: true,
      data: resultsWithOrbitInfo,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize)
      }
    });
  } catch (error) {
    console.error('POST space-objects search error:', error);
    return NextResponse.json(
      { success: false, error: '搜索失败，请稍后重试' },
      { status: 500 }
    );
  }
}