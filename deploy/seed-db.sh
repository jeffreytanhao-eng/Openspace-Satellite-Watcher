#!/bin/bash
set -e
cd /app
echo ">> Seeding all default satellites to database..."

cat > /tmp/seed-db.js << 'JSEOF'
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function parseEpoch(line1) {
  const yearStr = line1.slice(18, 20).trim();
  const dayStr = line1.slice(20, 32).trim();
  const fullYear = parseInt(yearStr, 10) >= 57 ? 1900 + parseInt(yearStr, 10) : 2000 + parseInt(yearStr, 10);
  const dayOfYear = parseFloat(dayStr);
  const start = new Date(Date.UTC(fullYear, 0, 1));
  return new Date(start.getTime() + (dayOfYear - 1) * 86400000);
}

const sats = [
  { noradId:25544, name:'ISS (ZARYA)', country:'USA/RUS', objectType:'PAYLOAD', launchDate:new Date('1998-11-20'), launchSite:'Baikonur', owner:'NASA/Roscosmos', isActive:true, model3dUrl:'/models/iss.glb', imageUrl:'/models/iss.png',
    tle:{line1:'1 25544U 98067A   26189.15353387  .00005161  00000+0  10196-3 0  9993', line2:'2 25544  51.6304 196.3226 0006696 270.4034  89.6187 15.48940380575005'}},
  { noradId:20580, name:'HUBBLE SPACE TELESCOPE', country:'USA', objectType:'PAYLOAD', launchDate:new Date('1990-04-24'), launchSite:'Kennedy Space Center', owner:'NASA/ESA', isActive:true, model3dUrl:'/models/hubble.glb', imageUrl:'/models/hubble.png',
    tle:{line1:'1 20580U 90037B   26188.74350551  .00004421  00000+0  13593-3 0  9993', line2:'2 20580  28.4736 300.0580 0001929  32.3294 327.7420 15.31004191791723'}},
  { noradId:48274, name:'CSS (TIANHE)', country:'CHN', objectType:'PAYLOAD', launchDate:new Date('2021-04-29'), launchSite:'Wenchang', owner:'CMSA', isActive:true, model3dUrl:null, imageUrl:null,
    tle:{line1:'1 48274U 21035A   26188.90756394  .00006844  00000+0  92847-4 0  9999', line2:'2 48274  41.4677 196.0018 0002951 276.1946  83.8555 15.58032789296406'}},
  { noradId:53239, name:'CSS (WENTIAN)', country:'CHN', objectType:'PAYLOAD', launchDate:new Date('2022-07-24'), launchSite:'Wenchang', owner:'CMSA', isActive:true, model3dUrl:null, imageUrl:null,
    tle:{line1:'1 53239U 22085A   26191.59979599  .00001397  00000+0  22374-4 0  9991', line2:'2 53239  41.4687 179.6858 0002649 286.3424  73.7123 15.58017112288235'}},
  { noradId:54216, name:'CSS (MENGTIAN)', country:'CHN', objectType:'PAYLOAD', launchDate:new Date('2022-10-31'), launchSite:'Wenchang', owner:'CMSA', isActive:true, model3dUrl:null, imageUrl:null,
    tle:{line1:'1 54216U 22143A   26192.17670403  .00001365  00000+0  21953-4 0  9996', line2:'2 54216  41.4681 176.1877 0002261 281.6943  78.3641 15.58018743296317'}},
  { noradId:25994, name:'TERRA', country:'USA', objectType:'PAYLOAD', launchDate:new Date('1999-12-18'), launchSite:'Vandenberg', owner:'NASA', isActive:true, model3dUrl:'/models/terra.glb', imageUrl:'/models/terra.png',
    tle:{line1:'1 25994U 99068A   26189.93962939  .00000244  00000+0  58555-4 0  9998', line2:'2 25994  97.9444 238.6222 0003129 135.1795 327.3115 14.61120385412784'}},
  { noradId:27424, name:'AQUA', country:'USA', objectType:'PAYLOAD', launchDate:new Date('2002-05-04'), launchSite:'Vandenberg', owner:'NASA', isActive:true, model3dUrl:'/models/aqua.glb', imageUrl:'/models/aqua.png',
    tle:{line1:'1 27424U 02022A   26189.95349685  .00000518  00000+0  11265-3 0  9991', line2:'2 27424  98.4290 159.6731 0000753 101.4132 325.9430 14.62191028286457'}},
  { noradId:28376, name:'AURA', country:'USA', objectType:'PAYLOAD', launchDate:new Date('2004-07-15'), launchSite:'Vandenberg', owner:'NASA', isActive:true, model3dUrl:'/models/aura.glb', imageUrl:'/models/aura.png',
    tle:{line1:'1 28376U 04026A   26190.78680976  .00000489  00000+0  10861-3 0  9996', line2:'2 28376  98.3427 147.4290 0001253  91.5620 268.5724 14.61362934169517'}},
  { noradId:39084, name:'LANDSAT 8', country:'USA', objectType:'PAYLOAD', launchDate:new Date('2013-02-11'), launchSite:'Vandenberg', owner:'NASA/USGS', isActive:true, model3dUrl:'/models/landsat8.glb', imageUrl:'/models/landsat8.png',
    tle:{line1:'1 39084U 13008A   26190.82316649  .00000179  00000+0  49866-4 0  9996', line2:'2 39084  98.2292 260.6886 0001358  93.8169 266.3184 14.57109555701197'}},
  { noradId:39634, name:'SENTINEL-1A', country:'ESA', objectType:'PAYLOAD', launchDate:new Date('2014-04-03'), launchSite:'Kourou', owner:'ESA', isActive:true, model3dUrl:null, imageUrl:null,
    tle:{line1:'1 39634U 14016A   26189.96747807 -.00000167  00000+0 -25668-4 0  9997', line2:'2 39634  98.1787 197.1820 0001408  87.5922 272.5439 14.59198675653192'}},
  { noradId:43013, name:'NOAA 20', country:'USA', objectType:'PAYLOAD', launchDate:new Date('2017-11-18'), launchSite:'Vandenberg', owner:'NOAA', isActive:true, model3dUrl:null, imageUrl:null,
    tle:{line1:'1 43013U 17073A   26189.92256911  .00000032  00000+0  36124-4 0  9994', line2:'2 43013  98.7773 129.1924 0001143 129.9157 230.2119 14.19515668447554'}},
  { noradId:44714, name:'STARLINK-1008', country:'USA', objectType:'PAYLOAD', launchDate:new Date('2019-11-11'), launchSite:'Cape Canaveral', owner:'SpaceX', isActive:true, model3dUrl:null, imageUrl:null,
    tle:{line1:'1 44714U 19074B   26189.89097947  .00048177  00000+0  76353-3 0  9993', line2:'2 44714  53.1502 324.5994 0003543 295.3766  64.6877 15.52941870367586'}},
  { noradId:41270, name:'NOAA 16 DEB', country:'USA', objectType:'DEBRIS', launchDate:new Date('2000-09-21'), launchSite:'Vandenberg', owner:'NOAA', isActive:false, model3dUrl:null, imageUrl:null,
    tle:{line1:'1 41270U 00055FW  26187.32637465  .00007501  00000+0  24826-2 0  9990', line2:'2 41270  98.9784 324.5019 0022692 174.8360 185.3064 14.38065353543620'}},
];

async function main() {
  let created = 0, updated = 0, tleCreated = 0, tleUpdated = 0;
  for (const s of sats) {
    const existing = await prisma.spaceObject.findUnique({ where: { noradId: s.noradId } });
    const data = {
      name: s.name,
      country: s.country,
      objectType: s.objectType,
      launchDate: s.launchDate,
      launchSite: s.launchSite,
      owner: s.owner,
      isActive: s.isActive,
      model3dUrl: s.model3dUrl,
      imageUrl: s.imageUrl,
    };
    let sat;
    if (existing) {
      sat = await prisma.spaceObject.update({ where: { noradId: s.noradId }, data });
      updated++;
    } else {
      sat = await prisma.spaceObject.create({ data: { ...data, noradId: s.noradId } });
      created++;
    }
    // Delete old TLEs for this satellite, then create fresh one
    await prisma.tLEData.deleteMany({ where: { spaceObjectId: sat.id } });
    await prisma.tLEData.create({
      data: {
        spaceObjectId: sat.id,
        line1: s.tle.line1,
        line2: s.tle.line2,
        epoch: parseEpoch(s.tle.line1),
        source: 'CELESTRAK_API',
      },
    });
    tleCreated++;
  }
  console.log('Seeded: sats created=' + created + ' updated=' + updated + ', TLEs created=' + tleCreated);

  // Tags
  const tags = [
    { name: 'Manned Spaceflight', color: '#00d4ff' },
    { name: 'Space Telescope', color: '#a855f7' },
    { name: 'Space Station', color: '#ffd700' },
  ];
  for (const t of tags) {
    await prisma.userTag.upsert({ where: { name: t.name }, create: t, update: t });
  }

  const total = await prisma.spaceObject.count();
  const list = await prisma.spaceObject.findMany({ select: { noradId: true, name: true }, orderBy: { noradId: 'asc' } });
  console.log('');
  console.log('Database now has ' + total + ' satellites:');
  list.forEach(s => console.log('  ' + s.noradId + ' - ' + s.name));
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
JSEOF

NODE_PATH=/app/node_modules node /tmp/seed-db.js
rm -f /tmp/seed-db.js
echo ""
echo ">> Done!"
