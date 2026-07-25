// TLE 解析工具 — 单一数据源（SSOT）
// 纯函数模块，无 Prisma / next 依赖，client + server 双端安全。
// 此前 prisma/seed.ts、tle/import/constellation/route.ts、default-satellites.ts、
// space-objects/route.ts 各有一份 parseEpoch 副本（部分缺 1957 阈值判断），
// 统一为此模块以消除重复并修正历史 bug。

/**
 * 从 TLE line1 解析 epoch 时间。
 * line1 第 19-32 列为 YYDDD.FFFFFFF 格式（YY 两位年份，DDD 年内日）。
 * 年份 ≥ 57 视为 19YY（1957 起算 Sputnik），否则视为 20YY。
 */
export function parseEpoch(line1: string): Date {
  const yearStr = line1.slice(18, 20).trim();
  const dayStr = line1.slice(20, 32).trim();
  const fullYear =
    parseInt(yearStr, 10) >= 57
      ? 1900 + parseInt(yearStr, 10)
      : 2000 + parseInt(yearStr, 10);
  const dayOfYear = parseFloat(dayStr);
  const start = new Date(Date.UTC(fullYear, 0, 1));
  return new Date(start.getTime() + (dayOfYear - 1) * 86400000);
}

export interface ParsedTLESatellite {
  noradId: number;
  name: string;
  line1: string;
  line2: string;
}

export interface TLEParseFailure {
  noradId: string;
  name: string;
  reason: string;
}

export interface ParsedTLE {
  total: number;
  success: number;
  failed: number;
  satellites: ParsedTLESatellite[];
  failures: TLEParseFailure[];
}

/**
 * 解析三行格式 TLE 文本（name / line1 / line2 分组）。
 * line1 第 3-7 列为 NORAD ID。无效 NORAD ID 计入 failures。
 */
export function parseTLEText(tleText: string): ParsedTLE {
  const lines = tleText.trim().split('\n');
  const results: ParsedTLE = {
    total: 0,
    success: 0,
    failed: 0,
    satellites: [],
    failures: [],
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // 非数据行视为卫星名
    if (!line.startsWith('1') && !line.startsWith('2')) {
      const name = line;
      const line1 = lines[i + 1]?.trim();
      const line2 = lines[i + 2]?.trim();

      if (line1?.startsWith('1') && line2?.startsWith('2')) {
        results.total++;
        const noradId = parseInt(line1.slice(2, 7).trim());

        if (!isNaN(noradId)) {
          results.satellites.push({ noradId, name, line1, line2 });
          results.success++;
        } else {
          results.failed++;
          results.failures.push({
            noradId: '未知',
            name,
            reason: '无效的 NORAD ID',
          });
        }
        i += 2;
      }
    }
  }

  return results;
}
