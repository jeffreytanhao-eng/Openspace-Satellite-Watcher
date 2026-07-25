// 修复 landsat8.glb:之前 fix-glb-texcoord.mjs 重新 Draco 压缩失败导致 Primitive 0 损坏
// 方案:读取(解压所有 Draco)→ 移除所有 Draco 扩展 → 保存为统一未压缩 GLB
// 这样所有 primitive 数据一致,不再依赖 Draco 压缩
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRDracoMeshCompression } from '@gltf-transform/extensions';
import draco3d from 'draco3d';
import fs from 'node:fs';

const file = 'public/models/landsat8.glb';

console.log('Loading Draco decoder...');
const decoderModule = await draco3d.createDecoderModule();

// 读取:注册 decoder 解压所有 Draco primitive
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'draco3d.decoder': decoderModule });

console.log(`Reading ${file}...`);
const doc = await io.read(file);

const root = doc.getRoot();
let totalPrims = 0;
let dracoPrims = 0;
let nonDracoPrims = 0;

for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    totalPrims++;
    const ext = prim.getExtension('KHR_draco_mesh_compression');
    if (ext) dracoPrims++;
    else nonDracoPrims++;
  }
}
console.log(`Before: ${totalPrims} primitives (${dracoPrims} Draco, ${nonDracoPrims} non-Draco)`);

// 移除所有 primitive 的 Draco 扩展(数据已被 gltf-transform 解压到 accessor)
const dracoExtension = doc.createExtension(KHRDracoMeshCompression);
for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    if (prim.getExtension('KHR_draco_mesh_compression')) {
      prim.setExtension('KHR_draco_mesh_compression', null);
    }
  }
}
dracoExtension.dispose();
console.log('Removed all KHR_draco_mesh_compression extensions');

// 保存为未压缩 GLB
const ioSave = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await ioSave.write(file, doc);
console.log(`\n✅ Saved: ${file} (${fs.statSync(file).size} bytes)`);

// 验证
const verifyIo = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const verifyDoc = await verifyIo.read(file);
let verifyPrims = 0;
let verifyDraco = 0;
let withPosition = 0;
for (const mesh of verifyDoc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    verifyPrims++;
    if (prim.getExtension('KHR_draco_mesh_compression')) verifyDraco++;
    if (prim.getAttribute('POSITION')) withPosition++;
  }
}
console.log(`After: ${verifyPrims} primitives (${verifyDraco} Draco, ${withPosition} with POSITION)`);
