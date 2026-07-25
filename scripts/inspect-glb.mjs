// 直接解析 GLB 的 JSON chunk,检查 mesh primitives 的 attributes
import fs from 'node:fs';

const file = process.argv[2] || 'public/models/iss.glb';
const buf = fs.readFileSync(file);

// GLB header: magic(4) + version(4) + length(4)
const magic = buf.toString('ascii', 0, 4);
const version = buf.readUInt32LE(4);
const length = buf.readUInt32LE(8);
console.log(`GLB: magic=${magic}, version=${version}, length=${length}`);

// 第一个 chunk: chunkLength(4) + chunkType(4) + data
let offset = 12;
const chunkLength = buf.readUInt32LE(offset);
const chunkType = buf.toString('ascii', offset + 4, offset + 8);
const jsonData = buf.toString('utf8', offset + 8, offset + 8 + chunkLength);
console.log(`Chunk 0: type=${chunkType}, length=${chunkLength}`);

const gltf = JSON.parse(jsonData);
console.log(`\nAsset:`, JSON.stringify(gltf.asset, null, 2));
console.log(`Extensions used:`, gltf.extensionsUsed);
console.log(`Extensions required:`, gltf.extensionsRequired);
console.log(`\nMeshes: ${gltf.meshes?.length || 0}`);

if (gltf.meshes) {
  for (let mi = 0; mi < gltf.meshes.length; mi++) {
    const mesh = gltf.meshes[mi];
    console.log(`\n  Mesh ${mi}: ${mesh.name || '(unnamed)'}, ${mesh.primitives.length} primitives`);
    for (let pi = 0; pi < mesh.primitives.length; pi++) {
      const prim = mesh.primitives[pi];
      console.log(`    Primitive ${pi}:`);
      console.log(`      attributes:`, JSON.stringify(prim.attributes));
      console.log(`      indices: ${prim.indices}`);
      console.log(`      material: ${prim.material}`);
      console.log(`      mode: ${prim.mode}`);
      if (prim.extensions) {
        console.log(`      extensions:`, Object.keys(prim.extensions));
      }
    }
  }
}

console.log(`\nAccessors: ${gltf.accessors?.length || 0}`);
if (gltf.accessors) {
  for (let i = 0; i < gltf.accessors.length; i++) {
    const a = gltf.accessors[i];
    console.log(`  [${i}] bufferView=${a.bufferView}, componentType=${a.componentType}, count=${a.count}, type=${a.type}`);
  }
}

console.log(`\nMaterials: ${gltf.materials?.length || 0}`);
if (gltf.materials) {
  for (let i = 0; i < gltf.materials.length; i++) {
    const m = gltf.materials[i];
    const hasTexture = !!(m.pbrMetallicRoughness?.baseColorTexture || m.normalTexture || m.occlusionTexture || m.emissiveTexture);
    console.log(`  [${i}] name="${m.name}", hasTexture=${hasTexture}, pbr=${JSON.stringify(m.pbrMetallicRoughness?.baseColorFactor)}`);
  }
}

console.log(`\nTextures: ${gltf.textures?.length || 0}`);
console.log(`Images: ${gltf.images?.length || 0}`);
