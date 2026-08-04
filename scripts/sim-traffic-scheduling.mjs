// 交通卫星调度仿真 — 验证抵达间隔与最近距离
// 模拟 useChaseViewer preUpdate 调度逻辑,确认 #4(频次)参数正确
//
// 用法: npx tsx scripts/sim-traffic-scheduling.mjs
import {
  createTrafficSats,
  propagateEcfKm,
  distanceKm,
  rephaseTrafficSat,
  TRAFFIC_SHOW_DISTANCE_KM,
  TRAFFIC_LEAD_SIM_MS,
  TRAFFIC_GAP_SIM_MS,
} from '../src/lib/cockpit/traffic-sats';
import { createSatrec } from '../src/lib/tle/orbit';
import { TREA01_INITIAL_TLE } from '../src/lib/trea/constants';

const treaTle = TREA01_INITIAL_TLE;
const treaSatrec = createSatrec(treaTle);
const trafficSats = createTrafficSats(treaTle);

// 调度状态
let nextScheduleSim = 0;
const rate = 10;  // 10x 仿真倍速

// 仿真:从 now 开始,每 0.1 真实秒推进(rate × 0.1s = 1s 仿真)
const realStepMs = 100;  // 0.1s 真实
const simStepMs = realStepMs * rate;  // 1s 仿真
const startMs = Date.now();
let simMs = startMs;

// 记录
const arrivals = [];
let prevArrivalReal = 0;

console.log(`=== 交通卫星调度仿真 ===`);
console.log(`参数: SHOW=${TRAFFIC_SHOW_DISTANCE_KM}km LEAD=${TRAFFIC_LEAD_SIM_MS/60000}min GAP=${TRAFFIC_GAP_SIM_MS/60000}min rate=${rate}x`);
console.log(`仿真时长: 20 分钟真实 = ${20 * rate} 分钟仿真\n`);

const trafficDist = new Array(trafficSats.length).fill(Infinity);
const trafficVisible = new Array(trafficSats.length).fill(false);

for (let realMs = 0; realMs < 20 * 60 * 1000; realMs += realStepMs) {
  const t = new Date(simMs);

  // TREA-01 位置
  const ecf = propagateEcfKm(treaSatrec, t);
  if (!ecf) { simMs += simStepMs; continue; }

  // 交通卫星:传播 + 距离判定
  for (let i = 0; i < trafficSats.length; i++) {
    const tEcf = propagateEcfKm(trafficSats[i].satrec, t);
    if (!tEcf) {
      trafficDist[i] = Infinity;
      trafficVisible[i] = false;
      continue;
    }
    const dist = distanceKm(ecf, tEcf);
    trafficDist[i] = dist;
    trafficVisible[i] = dist < TRAFFIC_SHOW_DISTANCE_KM;

    // 检测最近距离(可见时记录)
    if (trafficVisible[i] && dist < (arrivals[i]?.minDist ?? Infinity)) {
      if (!arrivals[i]) arrivals[i] = { minDist: Infinity, times: [] };
      arrivals[i].minDist = Math.min(arrivals[i].minDist, dist);
    }
  }

  // 调度
  const nowSim = t.getTime();
  if (nowSim >= nextScheduleSim) {
    let pickIdx = -1;
    let pickDist = -1;
    for (let i = 0; i < trafficSats.length; i++) {
      if (trafficVisible[i]) continue;
      if (nowSim - trafficSats[i].nextArrivalSim < TRAFFIC_GAP_SIM_MS) continue;
      if (trafficDist[i] > pickDist) {
        pickDist = trafficDist[i];
        pickIdx = i;
      }
    }
    if (pickIdx >= 0) {
      const tArrival = new Date(nowSim + TRAFFIC_LEAD_SIM_MS);
      rephaseTrafficSat(treaTle, trafficSats[pickIdx], tArrival);
      const realGapSec = 15 + Math.random() * 15;  // 15-30s
      nextScheduleSim = nowSim + Math.max(30_000, realGapSec * rate * 1000);

      // 记录抵达时间(真实秒)
      const arrivalRealSec = (nowSim - startMs + TRAFFIC_LEAD_SIM_MS) / (rate * 1000);
      if (!arrivals[pickIdx]) arrivals[pickIdx] = { minDist: Infinity, times: [] };
      arrivals[pickIdx].times.push(arrivalRealSec);
    } else {
      nextScheduleSim = nowSim + 30_000;
    }
  }

  simMs += simStepMs;
}

// 汇总
console.log(`=== 结果 ===`);
let allArrivalTimes = [];
for (let i = 0; i < trafficSats.length; i++) {
  const a = arrivals[i];
  if (a) {
    console.log(`TRAFFIC-${String(i+1).padStart(2,'0')}: 抵达次数=${a.times.length} 最近距离=${a.minDist.toFixed(1)}km`);
    allArrivalTimes.push(...a.times);
  } else {
    console.log(`TRAFFIC-${String(i+1).padStart(2,'0')}: 无抵达`);
  }
}

allArrivalTimes.sort((a, b) => a - b);
console.log(`\n=== 抵达间隔(真实秒) ===`);
for (let i = 1; i < allArrivalTimes.length; i++) {
  const gap = allArrivalTimes[i] - allArrivalTimes[i-1];
  console.log(`  第${i}次 → 第${i+1}次: ${gap.toFixed(1)}s`);
}

if (allArrivalTimes.length > 0) {
  const gaps = [];
  for (let i = 1; i < allArrivalTimes.length; i++) {
    gaps.push(allArrivalTimes[i] - allArrivalTimes[i-1]);
  }
  console.log(`\n平均间隔: ${(gaps.reduce((a,b)=>a+b,0)/gaps.length).toFixed(1)}s`);
  console.log(`首次抵达: ${allArrivalTimes[0].toFixed(1)}s 真实`);
}
