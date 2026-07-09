// Chinese translations for satellite names, countries, and object types.
// Satellite names are matched by keyword (case-insensitive partial match).

const SATELLITE_NAME_TRANSLATIONS: Record<string, string> = {
  TIANHE: '天河核心舱',
  WENTIAN: '问天实验舱',
  MENGTIAN: '梦天实验舱',
  TIANGONG: '天宫空间站',
  'INTERNATIONAL SPACE STATION': '国际空间站',
  ISS: '国际空间站',
  HUBBLE: '哈勃望远镜',
  HST: '哈勃望远镜',
  STARLINK: '星链',
  NAVSTAR: '导航星',
  GPS: '全球定位卫星',
  BEIDOU: '北斗',
  GLONASS: '格洛纳斯',
  GALILEO: '伽利略',
  NOAA: '诺阿气象卫星',
  IRIDIUM: '铱星',
  ONEWEB: '一网',
  SENTINEL: '哨兵卫星',
  AQUA: '水卫星',
  TERRA: '陆地卫星',
  LANDSAT: '陆地卫星',
  GOES: '静止环境观测卫星',
  COSMOS: '宇宙卫星',
  FENGYUN: '风云',
  YAOGAN: '遥感',
  SHIJIAN: '实践',
  METEOSAT: '气象卫星',
  GLOBALSTAR: '全球星',
  ORBCOMM: '轨道通信',
  SWARM: '蜂群',
  SKYSAT: '天星',
  WORLDVIEW: '世界视图',
  GEOEYE: '地球之眼',
  QUICKBIRD: '快鸟',
  ICEYE: '冰眼',
  CAPSTONE: '探路者',
  LUCY: '露西',
  DART: '飞镖',
  ARTEMIS: '阿尔忒弥斯',
  ORION: '猎户座',
  SOHO: '太阳观测台',
  SDO: '太阳动力学天文台',
  JUNO: '朱诺',
  MRO: '火星勘测轨道器',
  MARS: '火星',
  ROVER: '火星车',
  "CHANG'E": '嫦娥',
  CHANG_E: '嫦娥',
  'CHANG-E': '嫦娥',
  ZHUHONG: '珠海一号',
  GAOFEN: '高分',
  ZHOU: '周',
};

// Country code/name translations — exact match only (codes are short)
const COUNTRY_TRANSLATIONS: Record<string, string> = {
  US: '美国', USA: '美国', USN: '美国',
  CN: '中国', CHN: '中国', PRC: '中国',
  RU: '俄罗斯', RUS: '俄罗斯', RF: '俄罗斯', USSR: '苏联',
  JP: '日本', JPN: '日本',
  IN: '印度', IND: '印度',
  EU: '欧洲', ESA: '欧洲', EUM: '欧洲',
  KR: '韩国', KOR: '韩国',
  FR: '法国', FRA: '法国',
  DE: '德国', GER: '德国',
  UK: '英国', GB: '英国', GBR: '英国',
  CA: '加拿大', CAN: '加拿大',
  BR: '巴西', BRA: '巴西',
  AU: '澳大利亚', AUS: '澳大利亚',
  IT: '意大利', ITA: '意大利',
  ES: '西班牙', ESP: '西班牙',
  IL: '以色列', ISR: '以色列',
  AR: '阿根廷', ARG: '阿根廷',
  MX: '墨西哥', MEX: '墨西哥',
  ZA: '南非',
  TR: '土耳其', TUR: '土耳其',
  NG: '尼日利亚',
  ID: '印度尼西亚', IDN: '印度尼西亚',
  TH: '泰国', THA: '泰国',
  SA: '沙特阿拉伯',
  AE: '阿联酋',
  IR: '伊朗',
  PK: '巴基斯坦', PAK: '巴基斯坦',
  EG: '埃及',
};

const OBJECT_TYPE_TRANSLATIONS: Record<string, string> = {
  PAYLOAD: '有效载荷',
  ROCKET_BODY: '火箭残骸',
  ROCKET: '火箭',
  DEBRIS: '碎片',
  UNKNOWN: '未知',
};

/**
 * Returns the Chinese name for a satellite, or null if no translation is found.
 * Matches by keyword (case-insensitive partial match).
 */
export function translateSatelliteName(name: string): string | null {
  const upper = name.toUpperCase();
  // Try exact match first
  if (SATELLITE_NAME_TRANSLATIONS[upper]) {
    return SATELLITE_NAME_TRANSLATIONS[upper];
  }
  // Try partial match — longest keyword first to avoid false positives
  const sortedKeys = Object.keys(SATELLITE_NAME_TRANSLATIONS).sort(
    (a, b) => b.length - a.length
  );
  for (const key of sortedKeys) {
    if (upper.includes(key)) {
      return SATELLITE_NAME_TRANSLATIONS[key];
    }
  }
  return null;
}

/**
 * Returns the Chinese country name, or null if no translation is found.
 * Exact match only (country codes are short, partial match causes false positives).
 */
export function translateCountry(country: string): string | null {
  const upper = country.toUpperCase().trim();
  return COUNTRY_TRANSLATIONS[upper] || null;
}

/**
 * Returns the Chinese object type name, or null if no translation is found.
 */
export function translateObjectType(type: string): string | null {
  return OBJECT_TYPE_TRANSLATIONS[type] || null;
}
