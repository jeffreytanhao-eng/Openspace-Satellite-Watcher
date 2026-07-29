// TLE 字符串格式化与字段操作工具(纯函数,无副作用)
// 供 generateMissionTle.ts / maneuver.ts / 未来的 TLE 工具复用
//
// TLE 第二行格式(69 字符, 0-indexed):
//   0: '2'
//   1: ' '
//   2-6: 卫星编号 (5 字符)
//   7: ' '
//   8-15: 倾角 i (8 字符, "NN.NNNN")
//   16: ' '
//   17-24: RAAN Ω (8 字符, "NNN.NNNN")
//   25: ' '
//   26-32: 偏心率 e (7 字符, "NNNNNNN")
//   33: ' '
//   34-41: 近地点幅角 ω (8 字符, "NN.NNNN")
//   42: ' '
//   43-50: 平近点角 M (8 字符, "NN.NNNN")
//   51: ' '
//   52-62: 平均运动 n (11 字符, "NN.NNNNNNNN")
//   63: ' '
//   64-67: 历元圈数
//   68: 校验和

/** 计算 TLE 行校验和(位置 0-67 字符值之和 mod 10) */
export function computeTleChecksum(line: string): number {
  let sum = 0;
  for (let i = 0; i < line.length && i < 68; i++) {
    const char = line[i];
    if (char >= '0' && char <= '9') {
      sum += parseInt(char, 10);
    } else if (char === '-') {
      sum += 1;
    }
    // 空格、字母、'.' 贡献 0
  }
  return sum % 10;
}

/** 重算并写入 TLE 行末位校验和(位置 68) */
export function reapplyChecksum(line: string): string {
  const checksum = computeTleChecksum(line);
  return line.substring(0, 68) + String(checksum);
}

/** 格式化日期为 TLE 历元字符串 "YYDDD.DDDDDDDD"(14 字符,UTC) */
export function formatTleEpoch(date: Date): string {
  const year = date.getUTCFullYear();
  const yy = String(year % 100).padStart(2, '0');
  const startOfYear = Date.UTC(year, 0, 1, 0, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;
  // TLE 年积日从 1 开始(1月1日 = 第 1 天)
  const dayOfYear = (date.getTime() - startOfYear) / dayMs + 1;
  const intDay = Math.floor(dayOfYear);
  const fraction = dayOfYear - intDay;
  const ddd = String(intDay).padStart(3, '0');
  const fracStr = fraction.toFixed(8).slice(2); // 8 位小数
  return `${yy}${ddd}.${fracStr}`;
}

/** 格式化为 8 字符角度字段 "NNN.NNNN"(右对齐,前导空格补齐) */
export function formatAngleField8(deg: number): string {
  // 归一化到 [0, 360)
  const normalized = ((deg % 360) + 360) % 360;
  let str = normalized.toFixed(4); // "NN.NNNN" 或 "NNN.NNNN"
  if (str.length > 8) {
    str = str.substring(0, 8); // 防御性截断
  }
  return str.padStart(8, ' '); // 右对齐,左侧补空格
}

/** 替换 line1 历元字段(indices 18-31, 14 字符)并重算校验和 */
export function rebuildLine1WithEpoch(originalLine1: string, newEpoch: Date): string {
  const epochStr = formatTleEpoch(newEpoch);
  if (epochStr.length !== 14) {
    throw new Error(`TLE 历元格式长度错误:期望 14,实际 ${epochStr.length}`);
  }
  const newLine = originalLine1.substring(0, 18) + epochStr + originalLine1.substring(32);
  return reapplyChecksum(newLine);
}

/** 替换 line2 RAAN 字段(indices 17-24, 8 字符)并重算校验和 */
export function rebuildLine2WithRaan(originalLine2: string, newRaanDeg: number): string {
  const raanStr = formatAngleField8(newRaanDeg);
  if (raanStr.length !== 8) {
    throw new Error(`RAAN 字段长度错误:期望 8,实际 ${raanStr.length}`);
  }
  const newLine = originalLine2.substring(0, 17) + raanStr + originalLine2.substring(25);
  return reapplyChecksum(newLine);
}

/** 替换 line2 平近点角字段(indices 43-50, 8 字符)并重算校验和 */
export function rebuildLine2WithMeanAnomaly(originalLine2: string, newMeanAnomalyDeg: number): string {
  const maStr = formatAngleField8(newMeanAnomalyDeg);
  if (maStr.length !== 8) {
    throw new Error(`M 字段长度错误:期望 8,实际 ${maStr.length}`);
  }
  const newLine = originalLine2.substring(0, 43) + maStr + originalLine2.substring(51);
  return reapplyChecksum(newLine);
}
