// 测量 GLB 模型的 bounding box(建模尺寸)
// 用于计算各自的 scale,让所有卫星模型显示大小统一(不考虑真实比例)
//
// GLB 规范:POSITION accessor 必须有 min/max 字段
// bounding box = max - min,模型尺寸 = 对角线长度
//
// 用法: node scripts/measure-glb-size.mjs [file1.glb file2.glb ...]
import fs from 'node:fs';
import path from 'node:path';

const files = process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : ['iss', 'hubble', 'terra', 'aqua', 'aura', 'landsat8', 'suomi-npp']
      .map(m => `public/models/${m}.glb`);

// ISS 作为基准(scale=3000 觉得合适)
const BASELINE_MODEL = 'iss';
const BASELINE_SCALE = 3000;

const sizes = {};

for (const file of files) {
  const buf = fs.readFileSync(file);
  const jsonChunkLength = buf.readUInt32LE(12);
  const jsonData = buf.toString('utf8', 20, 20 + jsonChunkLength);
  const gltf = JSON.parse(jsonData);

  // 收集所有 POSITION accessor 的 min/max
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let positionCount = 0;

  if (gltf.accessors) {
    for (let i = 0; i < gltf.accessors.length; i++) {
      const acc = gltf.accessors[i];
      // 检查这个 accessor 是否被某个 primitive 用作 POSITION
      let isPosition = false;
      if (gltf.meshes) {
        for (const mesh of gltf.meshes) {
          for (const prim of mesh.primitives) {
            if (prim.attributes?.POSITION === i) { isPosition = true; break; }
          }
          if (isPosition) break;
        }
      }
      if (!isPosition || !acc.min || !acc.max) continue;
      positionCount++;
      minX = Math.min(minX, acc.min[0]);
      minY = Math.min(minY, acc.min[1]);
      minZ = Math.min(minZ, acc.min[2]);
      maxX = Math.max(maxX, acc.max[0]);
      maxY = Math.max(maxY, acc.max[1]);
      maxZ = Math.max(maxZ, acc.max[2]);
    }
  }

  if (positionCount === 0) {
    console.log(`${file}: no POSITION accessors found`);
    continue;
  }

  const dx = maxX - minX, dy = maxY - minY, dz = maxZ - minZ;
  const diag = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const name = path.basename(file, '.glb');
  sizes[name] = { file, diag, dx, dy, dz, positionCount };
  console.log(`${name}.glb: bbox=(${dx.toFixed(2)} × ${dy.toFixed(2)} × ${dz.toFixed(2)}) diag=${diag.toFixed(2)} (${positionCount} meshes)`);
}

// 以 ISS 为基准,计算每个模型的 scale 让显示大小统一
console.log('\n=== Scale recommendations (baseline: ISS scale=3000) ===');
const baseline = sizes[BASELINE_MODEL];
if (!baseline) {
  console.log(`Baseline model "${BASELINE_MODEL}" not found`);
  process.exit(0);
}
console.log(`Baseline ${BASELINE_MODEL}: diag=${baseline.diag.toFixed(2)}, scale=${BASELINE_SCALE}`);
console.log(`Target display size = diag * scale = ${(baseline.diag * BASELINE_SCALE).toFixed(0)} units\n`);

const targetSize = baseline.diag * BASELINE_SCALE;
const scales = {};
for (const [name, s] of Object.entries(sizes)) {
  const scale = targetSize / s.diag;
  scales[name] = Math.round(scale);
  console.log(`  ${name}: diag=${s.diag.toFixed(2)} → scale=${Math.round(scale)}`);
}

// 输出 TS 代码片段
console.log('\n=== TS snippet for SatelliteEntity.tsx ===');
console.log('const MODEL_SCALE_BY_TYPE: Record<string, number> = {');
for (const [name, scale] of Object.entries(scales)) {
  console.log(`  '${name}': ${scale},`);
}
console.log('};');
