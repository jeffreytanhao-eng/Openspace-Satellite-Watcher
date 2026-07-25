import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/security';
import { invalidateCache } from '@/lib/cache';
import { getConstellationKeyword } from '@/lib/constellation-metadata';

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

    // 判断是否属于星座(同星座卫星共享图片)
    // 例如上传 Starlink 卫星图片 → 所有 Starlink 卫星的 imageUrl 都更新
    const constellationKeyword = getConstellationKeyword(existing.name);

    let updatedCount = 1;
    if (constellationKeyword) {
      // 星座卫星:批量更新同星座所有卫星的 imageUrl(共享同一张图片)
      const result = await prisma.spaceObject.updateMany({
        where: { name: { contains: constellationKeyword, mode: 'insensitive' } },
        data: { imageUrl: dataUrl },
      });
      updatedCount = result.count;
    } else {
      // 默认卫星(不属于星座):只更新当前卫星
      await prisma.spaceObject.update({
        where: { noradId },
        data: { imageUrl: dataUrl },
      });
    }

    // 失效缓存，让下次 GET /api/space-objects 返回最新数据（包含新图片）
    invalidateCache();

    return NextResponse.json({
      success: true,
      data: { noradId, imageUrl: dataUrl },
      updatedCount,
      shared: !!constellationKeyword,
    });
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
