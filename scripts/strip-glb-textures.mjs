// 移除 GLB 模型的所有纹理引用和 TEXCOORD_0 属性
// 适用场景:GLB 引用了外部纹理文件(如 .tga)但文件不存在,
// 导致 Cesium 加载失败、shader 编译错误(v_texCoord_0 undeclared)
//
// 直接操作 GLB 二进制,不依赖 gltf-transform 加载外部资源
// 移除后模型用材质的 baseColorFactor(纯色)渲染,不影响几何形状
//
// 用法: node scripts/strip-glb-textures.mjs <file.glb> [--dry-run]

import fs from 'node:fs';

const file = process.argv[2] || 'public/models/terra.glb';
const dryRun = process.argv.includes('--dry-run');

console.log(`Processing: ${file}`);
const buf = fs.readFileSync(file);

// GLB header: magic(4) + version(4) + length(4)
const magic = buf.toString('ascii', 0, 4);
const version = buf.readUInt32LE(4);
if (magic !== 'glTF' || version !== 2) {
  console.error(`Not a valid GLB v2 file (magic=${magic}, version=${version})`);
  process.exit(1);
}

// Chunk 0 (JSON): chunkLength(4) + chunkType(4) + data
const jsonChunkLength = buf.readUInt32LE(12);
const jsonChunkType = buf.toString('ascii', 16, 20);
if (jsonChunkType !== 'JSON') {
  console.error(`First chunk is not JSON (type=${jsonChunkType})`);
  process.exit(1);
}

const jsonStart = 20;
const jsonEnd = jsonStart + jsonChunkLength;
const jsonStr = buf.toString('utf8', jsonStart, jsonEnd).replace(/\0+$/, '');
const gltf = JSON.parse(jsonStr);

// 统计
let removedTextureRefs = 0;
let removedTexCoords = 0;

// 1. 移除所有材质的纹理引用
if (gltf.materials) {
  for (const mat of gltf.materials) {
    // pbrMetallicRoughness 的纹理
    if (mat.pbrMetallicRoughness) {
      if (mat.pbrMetallicRoughness.baseColorTexture) {
        mat.pbrMetallicRoughness.baseColorTexture = undefined;
        removedTextureRefs++;
      }
      if (mat.pbrMetallicRoughness.metallicRoughnessTexture) {
        mat.pbrMetallicRoughness.metallicRoughnessTexture = undefined;
        removedTextureRefs++;
      }
    }
    // 其他纹理
    for (const key of ['normalTexture', 'occlusionTexture', 'emissiveTexture']) {
      if (mat[key]) {
        mat[key] = undefined;
        removedTextureRefs++;
      }
    }
  }
}

// 2. 移除所有 primitive 的 TEXCOORD_* 属性
if (gltf.meshes) {
  for (const mesh of gltf.meshes) {
    for (const prim of mesh.primitives) {
      if (prim.attributes) {
        for (const key of Object.keys(prim.attributes)) {
          if (key.startsWith('TEXCOORD')) {
            delete prim.attributes[key];
            removedTexCoords++;
          }
        }
      }
    }
  }
}

// 3. 清理 extensionsUsed/extensionsRequired 中的纹理相关扩展
if (gltf.extensionsUsed) {
  gltf.extensionsUsed = gltf.extensionsUsed.filter(e =>
    !['EXT_texture_webp', 'KHR_texture_transform', 'KHR_texture_basisu'].includes(e)
  );
  if (gltf.extensionsUsed.length === 0) delete gltf.extensionsUsed;
}
if (gltf.extensionsRequired) {
  gltf.extensionsRequired = gltf.extensionsRequired.filter(e =>
    !['EXT_texture_webp', 'KHR_texture_transform', 'KHR_texture_basisu'].includes(e)
  );
  if (gltf.extensionsRequired.length === 0) delete gltf.extensionsRequired;
}

console.log(`  Materials: ${gltf.materials?.length || 0}`);
console.log(`  Removed texture references: ${removedTextureRefs}`);
console.log(`  Removed TEXCOORD_* attributes: ${removedTexCoords}`);
console.log(`  Remaining extensionsUsed: ${gltf.extensionsUsed || '(none)'}`);
console.log(`  Remaining extensionsRequired: ${gltf.extensionsRequired || '(none)'}`);

if (dryRun) {
  console.log('\n(dry-run, no changes written)');
  process.exit(0);
}

if (removedTextureRefs === 0 && removedTexCoords === 0) {
  console.log('\n✅ No changes needed');
  process.exit(0);
}

// 重新打包 GLB
// JSON chunk 需要 4 字节对齐(用空格 0x20 填充)
const newJsonStr = JSON.stringify(gltf);
let newJsonBuf = Buffer.from(newJsonStr, 'utf8');
// 4 字节对齐
while (newJsonBuf.length % 4 !== 0) {
  newJsonBuf = Buffer.concat([newJsonBuf, Buffer.from([0x20])]);
}

// Binary chunk(原 chunk 1,从 jsonEnd 之后开始)
const binChunkHeaderStart = jsonEnd;
const binChunkLength = buf.readUInt32LE(binChunkHeaderStart);
const binChunkType = buf.toString('ascii', binChunkHeaderStart + 4, binChunkHeaderStart + 8);
let binData;
if (binChunkType === 'BIN\0') {
  binData = buf.subarray(binChunkHeaderStart + 8, binChunkHeaderStart + 8 + binChunkLength);
  // 4 字节对齐
  while (binData.length % 4 !== 0) {
    binData = Buffer.concat([binData, Buffer.from([0x00])]);
  }
} else {
  // 没有 binary chunk
  binData = Buffer.alloc(0);
}

// 组装新 GLB
const totalLength = 12 + 8 + newJsonBuf.length + 8 + binData.length;
const newBuf = Buffer.alloc(totalLength);
// Header
newBuf.write('glTF', 0, 'ascii');
newBuf.writeUInt32LE(2, 4);
newBuf.writeUInt32LE(totalLength, 8);
// JSON chunk
newBuf.writeUInt32LE(newJsonBuf.length, 12);
newBuf.write('JSON', 16, 'ascii');
newJsonBuf.copy(newBuf, 20);
// BIN chunk
const binChunkStart = 20 + newJsonBuf.length;
newBuf.writeUInt32LE(binData.length, binChunkStart);
newBuf.write('BIN\0', binChunkStart + 4, 'ascii');
binData.copy(newBuf, binChunkStart + 8);

fs.writeFileSync(file, newBuf);
console.log(`\n✅ Saved: ${file} (${totalLength} bytes, was ${buf.length} bytes)`);
console.log('   Model will now render with base colors (no external textures needed)');
