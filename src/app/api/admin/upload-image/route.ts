import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/security';

// POST：上传图片到数据库（需要密码）
export async function POST(request: NextRequest) {
  try {
    if (!verifyPassword(request)) {
      return NextResponse.json({ success: false, error: '需要密码验证' }, { status: 401 });
    }

    const formData = await request.formData();
    const noradIdStr = formData.get('noradId') as string | null;
    const file = formData.get('file') as File | null;

    if (!noradIdStr) {
      return NextResponse.json({ success: false, error: '缺少 noradId' }, { status: 400 });
    }
    if (!file) {
      return NextResponse.json({ success: false, error: '未选择文件' }, { status: 400 });
    }

    const noradId = parseInt(noradIdStr, 10);
    if (isNaN(noradId)) {
      return NextResponse.json({ success: false, error: 'NORAD ID 无效' }, { status: 400 });
    }

    // 文件类型校验
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ success: false, error: '仅支持 PNG / JPEG / WebP / GIF 格式' }, { status: 400 });
    }

    // 文件大小校验（2MB）
    const MAX_SIZE = 2 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ success: false, error: '图片大小不能超过 2MB' }, { status: 400 });
    }

    // 转为 base64 data URL 存入数据库
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString('base64');
    const dataUrl = `data:${file.type};base64,${base64}`;

    const existing = await prisma.spaceObject.findUnique({ where: { noradId } });
    if (!existing) {
      return NextResponse.json({ success: false, error: `NORAD ID ${noradId} 不存在` }, { status: 404 });
    }

    const updated = await prisma.spaceObject.update({
      where: { noradId },
      data: { imageUrl: dataUrl },
      select: { id: true, noradId: true, imageUrl: true },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Upload image error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorName = error instanceof Error ? error.constructor.name : 'Unknown';
    return NextResponse.json({
      success: false,
      error: `上传失败 [${errorName}]: ${errorMessage}`,
    }, { status: 500 });
  }
}
