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

// Satellite-name keyword → ISO country code mapping (longest first).
// Used to infer the country/owner of an imported satellite from its name.
const COUNTRY_KEYWORD_MAP: { keyword: string; country: string }[] = [
  // 中国
  { keyword: 'BEIDOU', country: 'CN' },
  { keyword: 'BDS', country: 'CN' },
  { keyword: 'COMPASS', country: 'CN' },
  { keyword: 'TIANGONG', country: 'CN' },
  { keyword: 'TIANHE', country: 'CN' },
  { keyword: 'WENTIAN', country: 'CN' },
  { keyword: 'MENGTIAN', country: 'CN' },
  { keyword: 'CHANG', country: 'CN' }, // CHANG'E / CHANG-E
  { keyword: 'YAOGAN', country: 'CN' },
  { keyword: 'GAOFEN', country: 'CN' },
  { keyword: 'FENGYUN', country: 'CN' },
  { keyword: 'SHIJIAN', country: 'CN' },
  { keyword: 'ZHUHONG', country: 'CN' },
  { keyword: 'HAIYANG', country: 'CN' },
  { keyword: 'ZIYUAN', country: 'CN' },
  { keyword: 'ZHONGXING', country: 'CN' },
  { keyword: 'CHINASAT', country: 'CN' },
  // 美国
  { keyword: 'GPS', country: 'US' },
  { keyword: 'NAVSTAR', country: 'US' },
  { keyword: 'STARLINK', country: 'US' },
  { keyword: 'IRIDIUM', country: 'US' },
  { keyword: 'GLOBALSTAR', country: 'US' },
  { keyword: 'ORBCOMM', country: 'US' },
  { keyword: 'ONEWEB', country: 'US' },
  { keyword: 'HUBBLE', country: 'US' },
  { keyword: 'HST', country: 'US' },
  { keyword: 'TERRA', country: 'US' },
  { keyword: 'AQUA', country: 'US' },
  { keyword: 'AURA', country: 'US' },
  { keyword: 'LANDSAT', country: 'US' },
  { keyword: 'NOAA', country: 'US' },
  { keyword: 'GOES', country: 'US' },
  { keyword: 'WGS', country: 'US' },
  { keyword: 'USA-', country: 'US' },
  { keyword: 'ISS', country: 'US' },
  { keyword: 'SPACEX', country: 'US' },
  { keyword: 'SKYSAT', country: 'US' },
  { keyword: 'WORLDVIEW', country: 'US' },
  { keyword: 'GEOEYE', country: 'US' },
  { keyword: 'QUICKBIRD', country: 'US' },
  { keyword: 'CAPSTONE', country: 'US' },
  { keyword: 'LUCY', country: 'US' },
  { keyword: 'DART', country: 'US' },
  { keyword: 'ARTEMIS', country: 'US' },
  { keyword: 'ORION', country: 'US' },
  { keyword: 'SDO', country: 'US' },
  // 俄罗斯
  { keyword: 'GLONASS', country: 'RU' },
  { keyword: 'COSMOS', country: 'RU' },
  { keyword: 'KOSMOS', country: 'RU' },
  { keyword: 'PROGRESS', country: 'RU' },
  { keyword: 'SOYUZ', country: 'RU' },
  { keyword: 'ROSCOSMOS', country: 'RU' },
  { keyword: 'METEOR', country: 'RU' },
  { keyword: 'ELEKTRO', country: 'RU' },
  // 欧洲
  { keyword: 'GALILEO', country: 'EU' },
  { keyword: 'SENTINEL', country: 'EU' },
  { keyword: 'ESA', country: 'EU' },
  { keyword: 'METEOSAT', country: 'EU' },
  { keyword: 'METOP', country: 'EU' },
  { keyword: 'EUMETSAT', country: 'EU' },
  { keyword: 'AEOLUS', country: 'EU' },
  { keyword: 'CRYOSAT', country: 'EU' },
  { keyword: 'SWARM', country: 'EU' },
  // 日本
  { keyword: 'QZS', country: 'JP' },
  { keyword: 'QZSS', country: 'JP' },
  { keyword: 'MICHIIBI', country: 'JP' },
  { keyword: 'GMS', country: 'JP' },
  { keyword: 'HIMAWARI', country: 'JP' },
  { keyword: 'ALOS', country: 'JP' },
  { keyword: 'GCOM', country: 'JP' },
  { keyword: 'GOSAT', country: 'JP' },
  // 印度
  { keyword: 'IRNSS', country: 'IN' },
  { keyword: 'NAVIC', country: 'IN' },
  { keyword: 'GSAT', country: 'IN' },
  { keyword: 'INSAT', country: 'IN' },
  { keyword: 'CARTOSAT', country: 'IN' },
  { keyword: 'RESOURCESAT', country: 'IN' },
  { keyword: 'RISAT', country: 'IN' },
  { keyword: 'OCEANSAT', country: 'IN' },
];

/**
 * Infers the ISO country code from a satellite name (case-insensitive).
 * Returns the country code (e.g. 'US', 'CN') or 'UNK' when no match is found.
 */
export function inferCountryFromName(name: string): string {
  const upper = name.toUpperCase();
  for (const { keyword, country } of COUNTRY_KEYWORD_MAP) {
    if (upper.includes(keyword)) {
      return country;
    }
  }
  return 'UNK';
}
