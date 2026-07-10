import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// POST /api/admin/upload-image
// Upload a satellite image as admin. Requires admin password in x-admin-password header.
// Image is stored as base64 data URL in the database (works on Vercel serverless).
export async function POST(request: NextRequest) {
  const password = request.headers.get('x-admin-password');
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || password !== expected) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const noradId = formData.get('noradId') as string | null;
    const file = formData.get('file') as File | null;

    if (!noradId || !file) {
      return NextResponse.json({ success: false, error: 'noradId 和 file 为必填项' }, { status: 400 });
    }

    const noradIdNum = parseInt(noradId);
    if (isNaN(noradIdNum)) {
      return NextResponse.json({ success: false, error: '无效的 NORAD ID' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ success: false, error: '只支持 PNG/JPEG/WebP/GIF 格式' }, { status: 400 });
    }

    // Validate file size (max 2MB for base64 storage)
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: '图片大小不能超过 2MB' }, { status: 400 });
    }

    // Convert to base64 data URL
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString('base64');
    const dataUrl = `data:${file.type};base64,${base64}`;

    // Update satellite record with the data URL
    const updated = await prisma.spaceObject.update({
      where: { noradId: noradIdNum },
      data: { imageUrl: dataUrl },
    });

    return NextResponse.json({
      success: true,
      data: { id: updated.id, noradId: noradIdNum, imageUrl: dataUrl },
    });
  } catch (error) {
    console.error('Upload image error:', error);
    return NextResponse.json({ success: false, error: '上传失败' }, { status: 500 });
  }
}
