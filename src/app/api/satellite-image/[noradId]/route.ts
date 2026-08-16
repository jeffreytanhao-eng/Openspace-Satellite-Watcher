import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// 按需返回卫星图片，避免在 /api/space-objects 和星座导入响应中嵌入大段 base64 data URI。
// 浏览器通过 <img src="/api/satellite-image/12345"> 并行加载图片，且可被浏览器缓存。
export async function GET(
  _request: NextRequest,
  { params }: { params: { noradId: string } }
) {
  const noradId = parseInt(params.noradId, 10);
  if (isNaN(noradId)) {
    return NextResponse.json({ error: 'Invalid noradId' }, { status: 400 });
  }

  try {
    const sat = await prisma.spaceObject.findUnique({
      where: { noradId },
      select: { imageUrl: true },
    });

    const imageUrl = sat?.imageUrl;
    if (!imageUrl || !imageUrl.startsWith('data:')) {
      return NextResponse.json({ error: 'No image' }, { status: 404 });
    }

    // 解析 data URI：data:image/jpeg;base64,/9j/4AAQ...
    const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      // 非 base64 的 data URI（如 SVG），直接 302 重定向
      return NextResponse.redirect(imageUrl);
    }

    const contentType = match[1];
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, 'base64');

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch {
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}
