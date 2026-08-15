// Real TLE data fetched from Celestrak (https://celestrak.org)
// Epoch: 2026-07-08 (Day 189)
// These are actual orbital elements from real satellites
// 3D models from NASA 3D Resources (Public Domain): github.com/nasa/NASA-3D-Resources
//
// 图片来源策略：
// - 有 NASA 3D 模型的卫星：使用 /models/*.png 实物渲染图
// - 中国空间站三舱（CSS）：无公开 GLB，用 PLACEHOLDER_IMAGES.css 占位图（三舱共享）
// - ESA SENTINEL-1A：无 /models/ 资源，用 PLACEHOLDER_IMAGES.sentinel 占位图
// - NOAA 系列（NOAA 20 / NOAA 16 DEB）：复用 /models/suomi-npp.{glb,png}（同属 JPSS 系列）
// - STARLINK-1008：复用 PLACEHOLDER_IMAGES.starlink（与 Starlink 星座导入共享同一图片）

import { PLACEHOLDER_IMAGES } from '../constellation-metadata';

// 使用字符串字面量类型，避免 @prisma/client 打包到客户端 bundle
export type MockObjectType = 'PAYLOAD' | 'ROCKET_BODY' | 'DEBRIS' | 'UNKNOWN';

export interface MockSatellite {
  noradId: number;
  name: string;
  country: string;
  objectType: MockObjectType;
  launchDate?: string;
  launchSite?: string;
  owner?: string;
  isActive: boolean;
  model3dUrl?: string | null;
  imageUrl?: string | null;
  tleData: { name: string; line1: string; line2: string };
}

// 14 颗缺省卫星的 NORAD ID 列表 — /api/space-objects 默认只返回这些卫星
// 其余预导入星座数据（Starlink/GPS/风云等）存放在数据库中，
// 用户通过界面"导入"按钮加载后才呈现（不自动全部显示）
export const DEFAULT_SATELLITE_NORAD_IDS = [
  41173,  // DAMPE (悟空)
  25544,  // ISS (ZARYA)
  20580,  // HUBBLE SPACE TELESCOPE
  48274,  // SENTINEL-1A
  53239,  // starlink
  54216,  // SUOMI NPP
  25994,  // TERRA
  27424,  // AQUA
  28376,  // LANDSAT 7
  39084,  // LANDSAT 8
  39634,  // NOAA 19
  43013,  // NOAA 20
  44714,  // AURA
  41270,  // NOAA 16 DEB
];

export const mockSatellites: MockSatellite[] = [
  // ===== 暗物质粒子探测卫星 =====
  {
    noradId: 41173,
    name: '悟空 (DAMPE)',
    country: 'CHN',
    objectType: 'PAYLOAD',
    launchDate: '2015-12-17',
    launchSite: 'Jiuquan',
    owner: 'CAS',
    isActive: true,
    model3dUrl: null,
    imageUrl: null, // 由用户自行上传
    tleData: {
      name: 'DAMPE',
      line1: '1 41173U 15078A   26217.32322427  .00001591  00000-0  55840-4 0  9992',
      line2: '2 41173  97.4578 223.0397 0010137 261.5337  98.4755 15.30903656592061',
    },
  },
  // ===== LEO 近地轨道有效载荷 =====
  {
    noradId: 25544,
    name: 'ISS (ZARYA)',
    country: 'USA/RUS',
    objectType: 'PAYLOAD',
    launchDate: '1998-11-20',
    launchSite: 'Baikonur',
    owner: 'NASA/Roscosmos',
    isActive: true,
    model3dUrl: '/models/iss.glb',
    imageUrl: '/models/iss.png',
    tleData: {
      name: 'ISS (ZARYA)',
      line1: '1 25544U 98067A   26189.15353387  .00005161  00000+0  10196-3 0  9993',
      line2: '2 25544  51.6304 196.3226 0006696 270.4034  89.6187 15.48940380575005',
    },
  },
  {
    noradId: 20580,
    name: 'HUBBLE SPACE TELESCOPE',
    country: 'USA',
    objectType: 'PAYLOAD',
    launchDate: '1990-04-24',
    launchSite: 'Kennedy Space Center',
    owner: 'NASA/ESA',
    isActive: true,
    model3dUrl: '/models/hubble.glb',
    imageUrl: '/models/hubble.png',
    tleData: {
      name: 'HST',
      line1: '1 20580U 90037B   26188.74350551  .00004421  00000+0  13593-3 0  9993',
      line2: '2 20580  28.4736 300.0580 0001929  32.3294 327.7420 15.31004191791723',
    },
  },
  {
    noradId: 48274,
    name: 'CSS (TIANHE)',
    country: 'CHN',
    objectType: 'PAYLOAD',
    launchDate: '2021-04-29',
    launchSite: 'Wenchang',
    owner: 'CMSA',
    isActive: true,
    // 中国空间站三舱共享同一占位图（无公开 GLB 模型）
    model3dUrl: null,
    imageUrl: PLACEHOLDER_IMAGES.css,
    tleData: {
      name: 'CSS (TIANHE)',
      line1: '1 48274U 21035A   26188.90756394  .00006844  00000+0  92847-4 0  9999',
      line2: '2 48274  41.4677 196.0018 0002951 276.1946  83.8555 15.58032789296406',
    },
  },
  {
    noradId: 53239,
    name: 'CSS (WENTIAN)',
    country: 'CHN',
    objectType: 'PAYLOAD',
    launchDate: '2022-07-24',
    launchSite: 'Wenchang',
    owner: 'CMSA',
    isActive: true,
    model3dUrl: null,
    imageUrl: PLACEHOLDER_IMAGES.css,
    tleData: {
      name: 'CSS (WENTIAN)',
      line1: '1 53239U 22085A   26191.59979599  .00001397  00000+0  22374-4 0  9991',
      line2: '2 53239  41.4687 179.6858 0002649 286.3424  73.7123 15.58017112288235',
    },
  },
  {
    noradId: 54216,
    name: 'CSS (MENGTIAN)',
    country: 'CHN',
    objectType: 'PAYLOAD',
    launchDate: '2022-10-31',
    launchSite: 'Wenchang',
    owner: 'CMSA',
    isActive: true,
    model3dUrl: null,
    imageUrl: PLACEHOLDER_IMAGES.css,
    tleData: {
      name: 'CSS (MENGTIAN)',
      line1: '1 54216U 22143A   26192.17670403  .00001365  00000+0  21953-4 0  9996',
      line2: '2 54216  41.4681 176.1877 0002261 281.6943  78.3641 15.58018743296317',
    },
  },
  // ===== 更多 LEO 对地观测卫星（TLE from Celestrak 2026-07-08）=====
  {
    noradId: 25994,
    name: 'TERRA',
    country: 'USA',
    objectType: 'PAYLOAD',
    launchDate: '1999-12-18',
    launchSite: 'Vandenberg',
    owner: 'NASA',
    isActive: true,
    model3dUrl: '/models/terra.glb',
    imageUrl: '/models/terra.png',
    tleData: {
      name: 'TERRA',
      line1: '1 25994U 99068A   26189.93962939  .00000244  00000+0  58555-4 0  9998',
      line2: '2 25994  97.9444 238.6222 0003129 135.1795 327.3115 14.61120385412784',
    },
  },
  {
    noradId: 27424,
    name: 'AQUA',
    country: 'USA',
    objectType: 'PAYLOAD',
    launchDate: '2002-05-04',
    launchSite: 'Vandenberg',
    owner: 'NASA',
    isActive: true,
    model3dUrl: '/models/aqua.glb',
    imageUrl: '/models/aqua.png',
    tleData: {
      name: 'AQUA',
      line1: '1 27424U 02022A   26189.95349685  .00000518  00000+0  11265-3 0  9991',
      line2: '2 27424  98.4290 159.6731 0000753 101.4132 325.9430 14.62191028286457',
    },
  },
  {
    noradId: 28376,
    name: 'AURA',
    country: 'USA',
    objectType: 'PAYLOAD',
    launchDate: '2004-07-15',
    launchSite: 'Vandenberg',
    owner: 'NASA',
    isActive: true,
    model3dUrl: '/models/aura.glb',
    imageUrl: '/models/aura.png',
    tleData: {
      name: 'AURA',
      line1: '1 28376U 04026A   26190.78680976  .00000489  00000+0  10861-3 0  9996',
      line2: '2 28376  98.3427 147.4290 0001253  91.5620 268.5724 14.61362934169517',
    },
  },
  {
    noradId: 39084,
    name: 'LANDSAT 8',
    country: 'USA',
    objectType: 'PAYLOAD',
    launchDate: '2013-02-11',
    launchSite: 'Vandenberg',
    owner: 'NASA/USGS',
    isActive: true,
    model3dUrl: '/models/landsat8.glb',
    imageUrl: '/models/landsat8.png',
    tleData: {
      name: 'LANDSAT 8',
      line1: '1 39084U 13008A   26190.82316649  .00000179  00000+0  49866-4 0  9996',
      line2: '2 39084  98.2292 260.6886 0001358  93.8169 266.3184 14.57109555701197',
    },
  },
  {
    noradId: 39634,
    name: 'SENTINEL-1A',
    country: 'ESA',
    objectType: 'PAYLOAD',
    launchDate: '2014-04-03',
    launchSite: 'Kourou',
    owner: 'ESA',
    isActive: true,
    // ESA Sentinel 无 /models/ 资源，用占位图
    model3dUrl: null,
    imageUrl: PLACEHOLDER_IMAGES.sentinel,
    tleData: {
      name: 'SENTINEL-1A',
      line1: '1 39634U 14016A   26189.96747807 -.00000167  00000+0 -25668-4 0  9997',
      line2: '2 39634  98.1787 197.1820 0001408  87.5922 272.5439 14.59198675653192',
    },
  },
  {
    noradId: 43013,
    name: 'NOAA 20',
    country: 'USA',
    objectType: 'PAYLOAD',
    launchDate: '2017-11-18',
    launchSite: 'Vandenberg',
    owner: 'NOAA',
    isActive: true,
    // NOAA 20 属 JPSS 系列，与 Suomi-NPP 同款航天器，复用 suomi-npp 模型与图片
    model3dUrl: '/models/suomi-npp.glb',
    imageUrl: '/models/suomi-npp.png',
    tleData: {
      name: 'NOAA 20 (JPSS-1)',
      line1: '1 43013U 17073A   26189.92256911  .00000032  00000+0  36124-4 0  9994',
      line2: '2 43013  98.7773 129.1924 0001143 129.9157 230.2119 14.19515668447554',
    },
  },
  {
    noradId: 44714,
    name: 'STARLINK-1008',
    country: 'USA',
    objectType: 'PAYLOAD',
    launchDate: '2019-11-11',
    launchSite: 'Cape Canaveral',
    owner: 'SpaceX',
    isActive: true,
    // Starlink 无 /models/ 资源，用与 Starlink 星座导入共享的占位图
    model3dUrl: null,
    imageUrl: PLACEHOLDER_IMAGES.starlink,
    tleData: {
      name: 'STARLINK-1008',
      line1: '1 44714U 19074B   26189.89097947  .00048177  00000+0  76353-3 0  9993',
      line2: '2 44714  53.1502 324.5994 0003543 295.3766  64.6877 15.52941870367586',
    },
  },
  // ===== DEBRIS 碎片 =====
  {
    noradId: 41270,
    name: 'NOAA 16 DEB',
    country: 'USA',
    objectType: 'DEBRIS',
    launchDate: '2000-09-21',
    launchSite: 'Vandenberg',
    owner: 'NOAA',
    isActive: false,
    // 碎片源自 NOAA 16（JPSS 系列前辈），复用 suomi-npp 图片便于识别来源
    model3dUrl: '/models/suomi-npp.glb',
    imageUrl: '/models/suomi-npp.png',
    tleData: {
      name: 'NOAA 16 DEB',
      line1: '1 41270U 00055FW  26187.32637465  .00007501  00000+0  24826-2 0  9990',
      line2: '2 41270  98.9784 324.5019 0022692 174.8360 185.3064 14.38065353543620',
    },
  },
];

export const mockTags = [
  { id: 'tag-1', name: '载人航天', color: '#00d4ff' },
  { id: 'tag-3', name: '空间望远镜', color: '#a855f7' },
  { id: 'tag-4', name: '空间站', color: '#ffd700' },
];
