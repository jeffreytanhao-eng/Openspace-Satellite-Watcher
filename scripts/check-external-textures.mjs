// 检查 GLB 模型是否引用了外部纹理文件(非 data URI)
// 外部纹理文件如果不存在,Cesium 加载时会失败,导致 shader 错误
import fs from 'node:fs';
import path from 'node:path';

const files = process.argv.slice(2);
if (files.length === 0) {
  // 默认检查所有默认卫星模型
  const models = ['iss', 'hubble', 'terra', 'aqua', 'aura', 'landsat8', 'suomi-npp'];
  for (const m of models) files.push(`public/models/${m}.glb`);
}

for (const file of files) {
  const buf = fs.readFileSync(file);
  const chunkLength = buf.readUInt32LE(12);
  const jsonData = buf.toString('utf8', 20, 20 + chunkLength);
  const gltf = JSON.parse(jsonData);

  const dir = path.dirname(file);
  let hasExternal = false;
  const missing = [];

  if (gltf.images) {
    for (let i = 0; i < gltf.images.length; i++) {
      const img = gltf.images[i];
      const uri = img.uri;
      if (uri && !uri.startsWith('data:')) {
        hasExternal = true;
        const fullPath = path.resolve(dir, uri);
        const exists = fs.existsSync(fullPath);
        console.log(`  ${file}: image[${i}] uri="${uri}" → ${exists ? 'EXISTS' : 'MISSING'}`);
        if (!exists) missing.push(uri);
      }
    }
  }

  if (!hasExternal) {
    console.log(`  ${file}: no external textures (all embedded or no textures)`);
  } else if (missing.length > 0) {
    console.log(`  ⚠️  ${file}: ${missing.length} missing external texture(s)`);
  }
}
