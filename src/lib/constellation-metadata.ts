// 星座元数据定义 — 单一数据源（SSOT），被后端 route 和前端 modal 共享
// 包含每个星座的国家、类型、图片映射等元数据
// 风云按批次区分图片（FY-1/2/3/4），SBIRS/SKYNET 所有卫星共享同一图片

export type CelestrakQueryType = 'GROUP' | 'NAME';

// 使用字符串字面量类型，避免 @prisma/client 打包到客户端 bundle
export type ObjectTypeString = 'PAYLOAD' | 'ROCKET_BODY' | 'DEBRIS' | 'UNKNOWN';

export interface ConstellationMeta {
  name: string;             // 唯一标识，前端传给后端（如 '风云'、'SBIRS'）
  label: string;            // 前端显示名
  description: string;      // 副标题（第二行说明）
  queryType: CelestrakQueryType;
  queryValue: string;       // GROUP 或 NAME 参数值
  country: string;          // ISO 国家代码（'US','CN','UK','RU','EU'）
  objectType: ObjectTypeString;
  model3dUrl: string | null;
  // 按卫星名获取图片（用于风云按批次区分）
  getImageUrl: (satelliteName: string) => string;
  // isConstellationSeeded 检测用的名称关键字（name ILIKE '%keyword%'）。
  // GROUP 类星座 Celestrak 返回的卫星名多样，无法用 queryValue 匹配，必须显式指定：
  //   starlink → 'STARLINK' / gps-ops → 'GPS' / glo-ops → 'GLONASS'（见 transformName）
  //   galileo → 'GALILEO' / beidou → 'BEIDOU'
  // NAME 类星座 queryValue 即名称关键字，通常与此字段相同。
  seededCheckNameKeyword: string;
  // 可选：导入时对卫星名做转换（在 upsert 前应用）。
  // 用于 GLONASS：Celestrak 返回 "COSMOS xxxx (nnn)"，转换为 "GLONASS nnn (COSMOS xxxx)"
  // 使前端 translateSatelliteName 匹配 'GLONASS' → "格洛纳斯"，而非匹配 'COSMOS' → "宇宙卫星"
  transformName?: (satelliteName: string) => string;
}

// 占位图生成：使用 encodeURIComponent 编码 SVG，浏览器和 Node.js 都可用
function makePlaceholder(label: string, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" fill="${color}"/><circle cx="100" cy="100" r="60" fill="rgba(255,255,255,0.15)"/><text x="100" y="110" font-family="Arial,sans-serif" font-size="28" font-weight="bold" fill="white" text-anchor="middle">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// 占位图常量 — 导出供 mock/satellites.ts（缺省卫星补图）与星座导入逻辑复用
export const PLACEHOLDER_IMAGES = {
  starlink:  makePlaceholder('STARLINK', '#1e3a8a'),
  gps:       makePlaceholder('GPS', '#1e40af'),
  glonass:   makePlaceholder('GLONASS', '#991b1b'),
  galileo:   makePlaceholder('GALILEO', '#1e7a3d'),
  beidou:    makePlaceholder('北斗', '#b45309'),
  fengyun1:  makePlaceholder('FY-1', '#0e7490'),
  fengyun2:  makePlaceholder('FY-2', '#0f766e'),
  fengyun3:  makePlaceholder('FY-3', '#15803d'),
  fengyun4:  makePlaceholder('FY-4', '#7c3aed'),
  sbirs:     makePlaceholder('SBIRS', '#7f1d1d'),
  skynet:    makePlaceholder('SKYNET', '#374151'),
  css:       makePlaceholder('CSS', '#b91c1c'),       // 中国空间站三舱（天和/问天/梦天）共用
  sentinel:  makePlaceholder('SENTINEL', '#1e40af'), // ESA 哨兵系列
};

// 风云批次匹配：Celestrak 名称形如 "FENGYUN 1A"、"FENGYUN 3C"、"FENGYUN 4B"
function getFengyunImage(name: string): string {
  const m = name.toUpperCase().match(/FENGYUN\s*(\d)/);
  if (!m) return PLACEHOLDER_IMAGES.fengyun3; // 默认
  switch (m[1]) {
    case '1': return PLACEHOLDER_IMAGES.fengyun1;
    case '2': return PLACEHOLDER_IMAGES.fengyun2;
    case '3': return PLACEHOLDER_IMAGES.fengyun3;
    case '4': return PLACEHOLDER_IMAGES.fengyun4;
    default:  return PLACEHOLDER_IMAGES.fengyun3;
  }
}

// GLONASS 卫星名转换：Celestrak GROUP=glo-ops 返回 "COSMOS 2433 (720)"
// 转换为 "GLONASS 720 (COSMOS 2433)"，使前端分类显示"格洛纳斯"而非"宇宙卫星"
// 保留 COSMOS 编号用于追溯 NORAD 原始数据
function transformGlonassName(name: string): string {
  const m = name.match(/^COSMOS\s+(\d+)\s*\((\d+)\)/i);
  if (m) {
    return `GLONASS ${m[2]} (COSMOS ${m[1]})`;
  }
  // 非标准格式（如直接含 GLONASS 的）保持原样
  return name;
}

export const CONSTELLATIONS_METADATA: ConstellationMeta[] = [
  {
    name: 'Starlink', label: 'Starlink', description: 'SpaceX Starlink 星座（截断至100颗）',
    queryType: 'GROUP', queryValue: 'starlink',
    country: 'US', objectType: 'PAYLOAD', model3dUrl: null,
    getImageUrl: () => PLACEHOLDER_IMAGES.starlink,
    seededCheckNameKeyword: 'STARLINK',
  },
  {
    name: 'GPS', label: 'GPS', description: '美国 GPS 导航星座',
    queryType: 'GROUP', queryValue: 'gps-ops',
    country: 'US', objectType: 'PAYLOAD', model3dUrl: null,
    getImageUrl: () => PLACEHOLDER_IMAGES.gps,
    seededCheckNameKeyword: 'GPS',
  },
  {
    name: 'GLONASS', label: 'GLONASS', description: '俄罗斯 GLONASS 导航星座',
    queryType: 'GROUP', queryValue: 'glo-ops',
    country: 'RU', objectType: 'PAYLOAD', model3dUrl: null,
    getImageUrl: () => PLACEHOLDER_IMAGES.glonass,
    // Celestrak GROUP=glo-ops 返回的卫星命名为 "COSMOS xxxx (nnn)"
    // transformName 转换为 "GLONASS nnn (COSMOS xxxx)"，使前端分类显示"格洛纳斯"
    transformName: transformGlonassName,
    seededCheckNameKeyword: 'GLONASS',
  },
  {
    name: 'Galileo', label: 'Galileo', description: '欧洲 Galileo 导航星座',
    queryType: 'GROUP', queryValue: 'galileo',
    country: 'EU', objectType: 'PAYLOAD', model3dUrl: null,
    getImageUrl: () => PLACEHOLDER_IMAGES.galileo,
    seededCheckNameKeyword: 'GALILEO',
  },
  {
    name: '北斗', label: '北斗', description: '中国北斗导航星座',
    queryType: 'GROUP', queryValue: 'beidou',
    country: 'CN', objectType: 'PAYLOAD', model3dUrl: null,
    getImageUrl: () => PLACEHOLDER_IMAGES.beidou,
    seededCheckNameKeyword: 'BEIDOU',
  },
  // ===== 新增三个星座 =====
  {
    name: '风云', label: '风云', description: '中国遥感卫星',
    queryType: 'NAME', queryValue: 'FENGYUN',
    country: 'CN', objectType: 'PAYLOAD', model3dUrl: null,
    getImageUrl: getFengyunImage,
    seededCheckNameKeyword: 'FENGYUN',
  },
  {
    name: 'SBIRS', label: 'SBIRS', description: '美国军用导弹预警卫星',
    queryType: 'NAME', queryValue: 'SBIRS',
    country: 'US', objectType: 'PAYLOAD', model3dUrl: null,
    getImageUrl: () => PLACEHOLDER_IMAGES.sbirs,
    seededCheckNameKeyword: 'SBIRS',
  },
  {
    name: 'SKYNET', label: 'SKYNET', description: '英国军事通信卫星',
    queryType: 'NAME', queryValue: 'SKYNET',
    country: 'UK', objectType: 'PAYLOAD', model3dUrl: null,
    getImageUrl: () => PLACEHOLDER_IMAGES.skynet,
    seededCheckNameKeyword: 'SKYNET',
  },
];

export function getConstellationMeta(name: string): ConstellationMeta | undefined {
  return CONSTELLATIONS_METADATA.find(c => c.name === name);
}
