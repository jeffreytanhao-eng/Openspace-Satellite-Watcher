// 解压使用 KHR_draco_mesh_compression 扩展的 GLB 模型
// 读取 Draco 压缩的模型,gltf-transform 会自动解码,
// 然后写入新文件(不带 Draco 扩展),让 Cesium 无需配置 Draco 解码器即可加载
//
// 关键:读取时注册 decoder(自动解码),写入时用不注册 KHRDracoMeshCompression 的 io,
// 避免 encoder 重新压缩。
//
// 用法: node scripts/decode-draco.mjs <input.glb> <output.glb>
import { NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
import draco3d from 'draco3d';
import fs from 'node:fs';

const input = process.argv[2] || 'public/models/calipso.glb';
const output = process.argv[3] || input.replace(/\.glb$/i, '-decoded.glb');

console.log(`[decode-draco] 初始化 draco3d 解码器...`);
const decoderModule = await draco3d.createDecoderModule();

// 读取用 io:注册 KHRDracoMeshCompression + decoder,gltf-transform 读时会自动解码
const readIo = new NodeIO()
  .registerExtensions([KHRDracoMeshCompression])
  .registerDependencies({
    'draco3d.decoder': decoderModule,
  });

console.log(`[decode-draco] 读取 ${input} (gltf-transform 会自动解码 Draco)...`);
const document = await readIo.read(input);

// 显式移除所有 primitive 上的 KHR_draco_mesh_compression 扩展引用
// gltf-transform 解码后,attributes 已是普通 accessor,扩展只是残留元数据
const root = document.getRoot();
let removedCount = 0;
root.listMeshes().forEach((mesh) => {
  mesh.listPrimitives().forEach((prim) => {
    const ext = prim.getExtension(KHRDracoMeshCompression.EXTENSION_NAME);
    if (ext) {
      prim.removeExtension(KHRDracoMeshCompression.EXTENSION_NAME);
      removedCount++;
    }
  });
});
console.log(`[decode-draco] 已移除 ${removedCount} 个 primitive 上的 Draco 扩展引用`);

// 写入用 io:不注册 KHRDracoMeshCompression,即使有残留引用也不会重新压缩
const writeIo = new NodeIO();

console.log(`[decode-draco] 写入 ${output} (无 Draco 扩展)...`);
await writeIo.write(output, document);

const inSize = fs.statSync(input).size;
const outSize = fs.statSync(output).size;
console.log(`[decode-draco] 完成 ✓`);
console.log(`  原始大小: ${(inSize / 1024).toFixed(1)} KB`);
console.log(`  解压大小: ${(outSize / 1024).toFixed(1)} KB`);
console.log(`  膨胀比例: ${(outSize / inSize).toFixed(2)}x`);
