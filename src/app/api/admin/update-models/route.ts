import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSatelliteModel } from '@/lib/satellite-models';

// Batch update model3dUrl and imageUrl for all satellites based on name matching.
// Also removes the deprecated UNKNOWN OBJECT (NORAD 72341).
// Usage: POST /api/admin/update-models  (with header X-Admin-Token: <ADMIN_SEED_TOKEN>)
export async function POST(request: NextRequest) {
  const token = request.headers.get('x-admin-token');
  const expected = process.env.ADMIN_SEED_TOKEN;
  if (!expected || token !== expected) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. Remove deprecated UNKNOWN OBJECT (NORAD 72341)
    const deleted = await prisma.spaceObject.deleteMany({
      where: { noradId: 72341 },
    });

    // 2. Update model3dUrl and imageUrl for all remaining satellites
    const satellites = await prisma.spaceObject.findMany();
    let updated = 0;
    let noMatch = 0;
    const details: { name: string; noradId: number; model3dUrl: string }[] = [];

    for (const sat of satellites) {
      const model = getSatelliteModel(sat.name);
      if (model) {
        await prisma.spaceObject.update({
          where: { id: sat.id },
          data: {
            model3dUrl: model.model3dUrl || null,
            imageUrl: model.imageUrl || null,
          },
        });
        updated++;
        details.push({ name: sat.name, noradId: sat.noradId, model3dUrl: model.model3dUrl });
      } else {
        noMatch++;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        deletedUnknown: deleted.count,
        updatedModels: updated,
        noMatch,
        total: satellites.length,
        details,
      },
    });
  } catch (error) {
    console.error('Update models error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update models' },
      { status: 500 }
    );
  }
}
