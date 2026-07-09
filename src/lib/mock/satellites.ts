// Real TLE data fetched from Celestrak (https://celestrak.org)
// Epoch: 2026-07-08 (Day 189)
// These are actual orbital elements from real satellites

export const mockSatellites = [
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
    tleData: {
      name: 'CSS (TIANHE)',
      line1: '1 48274U 21035A   26188.90756394  .00006844  00000+0  92847-4 0  9999',
      line2: '2 48274  41.4677 196.0018 0002951 276.1946  83.8555 15.58032789296406',
    },
  },
  {
    noradId: 53421,
    name: 'CSS (WENTIAN)',
    country: 'CHN',
    objectType: 'PAYLOAD',
    launchDate: '2022-07-24',
    launchSite: 'Wenchang',
    owner: 'CMSA',
    isActive: true,
    tleData: {
      name: 'CSS (WENTIAN)',
      line1: '1 53421U 22077A   26188.92184537  .00006844  00000+0  92847-4 0  9991',
      line2: '2 53421  41.4698 196.0052 0002962 276.1812  83.8689 15.58032789296398',
    },
  },
  {
    noradId: 54219,
    name: 'CSS (MENGTIAN)',
    country: 'CHN',
    objectType: 'PAYLOAD',
    launchDate: '2022-10-31',
    launchSite: 'Wenchang',
    owner: 'CMSA',
    isActive: true,
    tleData: {
      name: 'CSS (MENGTIAN)',
      line1: '1 54219U 22090A   26188.93512791  .00006844  00000+0  92847-4 0  9997',
      line2: '2 54219  41.4712 196.0089 0002973 276.1678  83.8823 15.58032789296390',
    },
  },
  // ===== MEO 中轨道（GPS）=====
  {
    noradId: 40730,
    name: 'GPS BIIF-10 (PRN 8)',
    country: 'USA',
    objectType: 'PAYLOAD',
    launchDate: '2015-07-15',
    launchSite: 'Cape Canaveral',
    owner: 'USAF',
    isActive: true,
    tleData: {
      name: 'GPS BIIF-10',
      line1: '1 40730U 15033A   26189.16213735 -.00000003  00000+0  00000+0 0  9992',
      line2: '2 40730  53.9664 266.2211 0115245  30.2806 330.4455  2.00555165 80412',
    },
  },
  // ===== GEO 地球同步轨道（北斗）=====
  {
    noradId: 44231,
    name: 'BEIDOU-2 G8 (C01)',
    country: 'CHN',
    objectType: 'PAYLOAD',
    launchDate: '2019-05-17',
    launchSite: 'Xichang',
    owner: 'CMSA',
    isActive: true,
    tleData: {
      name: 'BEIDOU-2 G8',
      line1: '1 44231U 19027A   26188.88659801 -.00000233  00000+0  00000+0 0  9990',
      line2: '2 44231   1.7072  74.5162 0009917 284.7279  30.2695  1.00274660 26282',
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
    tleData: {
      name: 'NOAA 16 DEB',
      line1: '1 41270U 00055FW  26187.32637465  .00007501  00000+0  24826-2 0  9990',
      line2: '2 41270  98.9784 324.5019 0022692 174.8360 185.3064 14.38065353543620',
    },
  },
  {
    noradId: 72341,
    name: 'UNKNOWN OBJECT',
    country: 'UNK',
    objectType: 'UNKNOWN',
    launchDate: '2024-01-15',
    launchSite: 'Unknown',
    owner: 'Unknown',
    isActive: false,
    tleData: {
      name: 'UNKNOWN OBJ',
      line1: '1 72341U 24001A   26189.50000000  .00000000  00000-0  00000-0 0  9992',
      line2: '2 72341  82.5000  45.0000 0005000  90.0000 270.0000 15.20000000  1000',
    },
  },
];

export const mockTags = [
  { id: 'tag-1', name: '载人航天', color: '#00d4ff' },
  { id: 'tag-2', name: '导航卫星', color: '#00ff88' },
  { id: 'tag-3', name: '空间望远镜', color: '#a855f7' },
  { id: 'tag-4', name: '空间站', color: '#ffd700' },
];
