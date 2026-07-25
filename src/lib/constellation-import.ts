// 星座导入 SSOT 业务逻辑 — fetch Celestrak + parse TLE + upsert DB
// 依赖注入 Prisma 实例，让 prisma/seed.ts 和 tle/import/constellation/route.ts 共用同一份代码。
// 不调用 invalidateCache（由 route 调用方决定）；不抛异常（返回 success:false + error，让 seed 循环继续其他星座）。

import type { PrismaClient } from '@prisma/client';
import { Source, ObjectType } from '@prisma/client';
import type { ConstellationMeta } from './constellation-metadata';
import { parseEpoch, parseTLEText } from './tle-utils';
import type { TLEParseFailure } from './tle-utils';

export const CELESTRAK_BASE_URL = 'https://celestrak.org/NORAD/elements/gp.php';
export const IMPORT_LIMIT = 100;

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/plain,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://celestrak.org/',
};

/**
 * 根据卫星名推断真实 objectType。
 * Celestrak NAME= 查询会返回同名卫星的所有关联物体，包括：
 *   - "FENGYUN 1C DEB" — 碎片（风云1C反卫星试验产生大量碎片）
 *   - "FENGYUN 2A AKM" — 远地点发动机（火箭体）
 * 此前 create 分支硬编码 meta.objectType(PAYLOAD)，导致碎片被误标为 PAYLOAD。
 */
function inferObjectTypeFromName(name: string, defaultType: string): ObjectType {
  const upper = name.toUpperCase();
  // 碎片优先判定（DEB / DEBRIS）
  if (upper.includes('DEB')) {
    return ObjectType.DEBRIS;
  }
  // 火箭体（AKM 远地点发动机 / R/B 火箭残骸 / ROCKET）
  if (upper.includes('AKM') || upper.includes('R/B') || upper.includes('ROCKET')) {
    return ObjectType.ROCKET_BODY;
  }
  return (defaultType as ObjectType);
}

export interface ImportOptions {
  prisma: PrismaClient;
  limit?: number; // 默认 IMPORT_LIMIT
  timeoutMs?: number; // 默认 15000
  skipIfExists?: boolean; // 默认 false；seed 用 true 跳过已入库星座（整体跳过）
  // 默认 false；route 用 true 跳过 DB 中已存在的 NORAD ID，仅导入新的（支持 Starlink 分批导入第二批 100 颗）
  // 与 skipIfExists 互斥（skipIfExists 整体跳过，不会走到过滤逻辑）
  skipExistingNoradIds?: boolean;
}

export interface SavedSatellite {
  noradId: number;
  name: string;
  line1: string;
  line2: string;
  // 完整元数据字段 — 让前端 normalizeSatellite 直接消费，无需 fallback 推断
  // (Celestrak 实时导入分支通过 upsert 返回值获取；早返回分支由 route.ts 直接从 DB 读取)
  country?: string | null;
  objectType?: string;
  launchDate?: string | null; // ISO 字符串
  launchSite?: string | null;
  owner?: string | null;
  isActive?: boolean;
  model3dUrl?: string | null;
  imageUrl?: string | null;
}

export interface ImportResult {
  constellation: string;
  success: boolean;
  error?: string; // 失败原因（Celestrak 不可达 / 解析失败等）
  total: number; // Celestrak 返回总数（含解析失败）
  upserted: number; // 实际 upsert 成功数
  skippedExisting?: number; // 因 skipExistingNoradIds 跳过的已入库卫星数
  skippedNonPayload: number; // 因非 PAYLOAD（碎片/火箭体）被过滤的卫星数
  parseFailures: TLEParseFailure[]; // Celestrak TLE 解析失败（无效 NORAD ID 等）
  dbFailures: { noradId: string; name: string; reason: string }[];
  truncated: boolean;
  skipped?: boolean; // skipIfExists 命中时为 true
  savedSatellites: SavedSatellite[];
}

/**
 * 检测某星座是否已入库（用于 skipIfExists）。
 * 用 meta.seededCheckNameKeyword 在 SpaceObject.name 上做 ILIKE 匹配，count > 0 视为已入库。
 */
export async function isConstellationSeeded(
  prisma: PrismaClient,
  meta: ConstellationMeta
): Promise<boolean> {
  const count = await prisma.spaceObject.count({
    where: {
      name: { contains: meta.seededCheckNameKeyword, mode: 'insensitive' },
    },
  });
  return count > 0;
}

/**
 * 单星座完整导入流程：fetch → parse → [过滤非PAYLOAD] → [过滤已入库] → truncate → upsert
 *
 * 过滤逻辑（默认对所有星座启用）：
 * - 非 PAYLOAD（碎片 DEB / 火箭体 AKM/R/B）被过滤，不计入 upsert
 *   风云 NAME= 查询会返回 1C 反卫星试验碎片，这些不属于星座，导入会混淆用户
 * - skipExistingNoradIds=true 时，跳过 DB 已存在的 NORAD ID（支持 Starlink 分批导入）
 *
 * upsert 行为：
 * - update 分支更新 name + objectType（修复已入库的错误类型）
 *   不覆盖 imageUrl/model3dUrl/country（保留用户上传的图片和修改）
 * - create 分支写入完整元数据（country, objectType, model3dUrl, imageUrl）
 * - objectType 由 inferObjectTypeFromName 推断（过滤后理论上都是 PAYLOAD，但保留推断以防边缘情况）
 * - 若 meta.transformName 存在，name 会先经过转换（如 GLONASS 的 COSMOS→GLONASS 前缀）
 *
 * 图片共享：meta.getImageUrl(name) 在模块加载时已预生成 SVG data URI，
 * 同星座卫星共享同一字符串引用，无重复编码/网络请求。
 */
export async function importConstellation(
  meta: ConstellationMeta,
  options: ImportOptions
): Promise<ImportResult> {
  const {
    prisma,
    limit = IMPORT_LIMIT,
    timeoutMs = 15000,
    skipIfExists = false,
    skipExistingNoradIds = false,
  } = options;

  const baseResult: ImportResult = {
    constellation: meta.name,
    success: false,
    total: 0,
    upserted: 0,
    skippedExisting: 0,
    skippedNonPayload: 0,
    parseFailures: [],
    dbFailures: [],
    truncated: false,
    savedSatellites: [],
  };

  // 跳过已入库星座（整体跳过，用于 seed 幂等性）
  if (skipIfExists) {
    try {
      const seeded = await isConstellationSeeded(prisma, meta);
      if (seeded) {
        return { ...baseResult, success: true, skipped: true };
      }
    } catch {
      // 检测失败不中断，继续尝试导入
    }
  }

  // 构造 Celestrak URL：GROUP 或 NAME
  const queryParam =
    meta.queryType === 'GROUP'
      ? `GROUP=${encodeURIComponent(meta.queryValue)}`
      : `NAME=${encodeURIComponent(meta.queryValue)}`;
  const url = `${CELESTRAK_BASE_URL}?${queryParam}&FORMAT=tle`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { ...baseResult, error: '无法连接到 Celestrak 服务器' };
  }

  if (!response.ok) {
    const errorMsg =
      response.status === 403
        ? `Celestrak 拒绝了请求 (403)，该星座可能因访问限制暂时不可用`
        : `Celestrak 请求失败: ${response.status}`;
    return { ...baseResult, error: errorMsg };
  }

  const tleText = await response.text();
  const parsed = parseTLEText(tleText);

  // 应用 name 转换（如 GLONASS 的 COSMOS→GLONASS 前缀）
  let satellites = parsed.satellites.map(sat => ({
    ...sat,
    name: meta.transformName ? meta.transformName(sat.name) : sat.name,
  }));

  // 过滤非 PAYLOAD 卫星（碎片/火箭体）— 预导入星座只保留运行中的有效载荷
  // 例如风云 NAME= 查询会返回 "FENGYUN 1C DEB" 反卫星试验碎片（2007年产生大量碎片）
  // 这些碎片不属于星座，导入会混淆用户。用 inferObjectTypeFromName 推断后过滤掉。
  const beforePayloadFilter = satellites.length;
  satellites = satellites.filter(
    sat => inferObjectTypeFromName(sat.name, meta.objectType) === ObjectType.PAYLOAD
  );
  const skippedNonPayload = beforePayloadFilter - satellites.length;

  // 过滤已入库 NORAD ID（支持 Starlink 分批导入第二批）
  let skippedExisting = 0;
  if (skipExistingNoradIds) {
    try {
      const existing = await prisma.spaceObject.findMany({
        where: { noradId: { in: satellites.map(s => s.noradId) } },
        select: { noradId: true },
      });
      const existingIds = new Set(existing.map(s => s.noradId));
      const before = satellites.length;
      satellites = satellites.filter(s => !existingIds.has(s.noradId));
      skippedExisting = before - satellites.length;
    } catch {
      // 过滤失败不中断，按不过滤处理
    }
  }

  // 限制单次导入数量
  let truncated = false;
  if (satellites.length > limit) {
    satellites = satellites.slice(0, limit);
    truncated = true;
  }

  const dbFailures: ImportResult['dbFailures'] = [];
  const savedSatellites: ImportResult['savedSatellites'] = [];

  for (const sat of satellites) {
    try {
      const epoch = parseEpoch(sat.line1);
      const imageUrl = meta.getImageUrl(sat.name);
      const objectType = inferObjectTypeFromName(sat.name, meta.objectType);

      // upsert SpaceObject：
      // - update 分支更新 name + objectType（修复已入库的错误类型）
      //   不覆盖 imageUrl/model3dUrl/country（保留用户上传的图片和修改）
      // - create 分支写入完整元数据
      const spaceObject = await prisma.spaceObject.upsert({
        where: { noradId: sat.noradId },
        update: { name: sat.name, objectType },
        create: {
          noradId: sat.noradId,
          name: sat.name,
          country: meta.country,
          objectType,
          model3dUrl: meta.model3dUrl,
          imageUrl,
        },
      });

      // upsert TLEData
      await prisma.tLEData.upsert({
        where: {
          spaceObjectId_epoch: { spaceObjectId: spaceObject.id, epoch },
        },
        update: {
          line1: sat.line1,
          line2: sat.line2,
          source: Source.CELESTRAK_API,
        },
        create: {
          spaceObjectId: spaceObject.id,
          line1: sat.line1,
          line2: sat.line2,
          epoch,
          source: Source.CELESTRAK_API,
        },
      });

      // 推入完整元数据，让前端 normalizeSatellite 直接消费
      // (country/imageUrl 在 update 分支不会被覆盖，但 upsert 返回的是完整行，所以这里读取的是 DB 当前值)
      savedSatellites.push({
        noradId: sat.noradId,
        name: sat.name,
        line1: sat.line1,
        line2: sat.line2,
        country: spaceObject.country,
        objectType: spaceObject.objectType,
        launchDate: spaceObject.launchDate ? spaceObject.launchDate.toISOString() : null,
        launchSite: spaceObject.launchSite,
        owner: spaceObject.owner,
        isActive: spaceObject.isActive,
        model3dUrl: spaceObject.model3dUrl,
        imageUrl: spaceObject.imageUrl,
      });
    } catch (e) {
      dbFailures.push({
        noradId: String(sat.noradId),
        name: sat.name,
        reason: (e as Error).message,
      });
    }
  }

  return {
    ...baseResult,
    success: true,
    total: parsed.total,
    upserted: savedSatellites.length,
    skippedExisting,
    skippedNonPayload,
    parseFailures: parsed.failures,
    dbFailures,
    truncated,
    savedSatellites,
  };
}
