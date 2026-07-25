import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { CONSTELLATIONS_METADATA, getConstellationMeta } from '@/lib/constellation-metadata';
import { invalidateCache } from '@/lib/cache';
import { importConstellation, isConstellationSeeded, IMPORT_LIMIT } from '@/lib/constellation-import';

export async function GET() {
  return NextResponse.json({
    success: true,
    data: CONSTELLATIONS_METADATA.map(c => ({ name: c.name, label: c.label, description: c.description })),
  });
}

export async function POST(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const constellation = searchParams.get('constellation');

    if (!constellation) {
      return NextResponse.json(
        { success: false, error: '星座名称为必填项' },
        { status: 400 }
      );
    }

    const meta = getConstellationMeta(constellation);
    if (!meta) {
      return NextResponse.json(
        { success: false, error: `无效的星座: ${constellation}` },
        { status: 400 }
      );
    }

    // 优化：先用 isConstellationSeeded 检测数据库是否已预导入该星座。
    // 若已预导入（seed.ts 部署时已批量入库），从 DB 读取该星座卫星返回给前端，
    // 前端 merge 到当前视图（不替换全部）。避免每次都请求 Celestrak 造成 429 限流和长时间等待。
    // 注意：此早返回会跳过 TLE 数据刷新 — 如需刷新 TLE，请使用"轨道数据刷新"按钮（高级功能）。
    try {
      const alreadySeeded = await isConstellationSeeded(prisma, meta);
      if (alreadySeeded) {
        // 从 DB 读取该星座的全部卫星（含最新 TLE），返回给前端 merge 到当前视图
        // 返回完整元数据字段（country/imageUrl/objectType/launchDate 等），
        // 避免前端因缺失 country 而 fallback 到 inferCountryFromName 推断出 'UNK'
        const constellationSats = await prisma.spaceObject.findMany({
          where: { name: { contains: meta.seededCheckNameKeyword, mode: 'insensitive' } },
          include: { tleData: { take: 1, orderBy: { epoch: 'desc' } } },
          orderBy: { noradId: 'asc' },
        });
        return NextResponse.json({
          success: true,
          data: {
            importReport: {
              total: constellationSats.length,
              success: constellationSats.length,
              failed: 0,
              failures: [],
              truncated: false,
              limit: IMPORT_LIMIT,
              skippedExisting: constellationSats.length,
              skippedNonPayload: 0,
              allAlreadyImported: true,
            },
            satellites: constellationSats.map(s => ({
              noradId: s.noradId,
              name: s.name,
              country: s.country,
              objectType: s.objectType,
              launchDate: s.launchDate ? s.launchDate.toISOString() : null,
              launchSite: s.launchSite,
              owner: s.owner,
              isActive: s.isActive,
              model3dUrl: s.model3dUrl,
              imageUrl: s.imageUrl,
              line1: s.tleData[0]?.line1 || '',
              line2: s.tleData[0]?.line2 || '',
            })),
          },
        });
      }
    } catch {
      // DB 检测失败（如本地无 PostgreSQL）：不中断，继续走 Celestrak 导入流程
      // 这种情况下用户会看到 DB 写入失败的报错，明确知道是环境问题
    }

    // 调用共享导入逻辑
    // skipExistingNoradIds=true：跳过 DB 中已存在的 NORAD ID，仅导入新的
    // 支持分批导入 — Starlink 有 5000+ 颗，每次点击导入 100 颗新的，第二次点击导入下一批 100 颗
    const result = await importConstellation(meta, {
      prisma,
      limit: IMPORT_LIMIT,
      timeoutMs: 15000,
      skipExistingNoradIds: true,
    });

    if (!result.success) {
      const status = result.error?.includes('Celestrak') ? 503 : 500;
      return NextResponse.json(
        { success: false, error: result.error || '导入失败' },
        { status }
      );
    }

    // 失效 space-objects 缓存，让下次 GET 返回新数据
    invalidateCache('space-objects');

    // 当所有卫星都已入库（skippedExisting === total），提示用户已全部导入
    const allAlreadyImported =
      result.upserted === 0 &&
      (result.skippedExisting ?? 0) > 0 &&
      result.total > 0;

    return NextResponse.json({
      success: true,
      data: {
        importReport: {
          total: result.total,
          success: result.upserted,
          failed: result.parseFailures.length + result.dbFailures.length,
          failures: [...result.parseFailures, ...result.dbFailures],
          truncated: result.truncated,
          limit: IMPORT_LIMIT,
          skippedExisting: result.skippedExisting ?? 0,
          skippedNonPayload: result.skippedNonPayload,
          allAlreadyImported,
        },
        satellites: result.savedSatellites,
      },
    });
  } catch (error) {
    console.error('Constellation import error:', error);
    return NextResponse.json(
      { success: false, error: '导入失败，请稍后重试' },
      { status: 500 }
    );
  }
}
