// 检查并修复 GLB 模型的 TEXCOORD_0 问题
// 问题:Draco 压缩的模型解码后有 TEXCOORD_0(纹理坐标)但没纹理贴图
// 导致 Cesium 在近距离渲染时 shader 编译失败(v_texCoord_0 undeclared)
// 修复:解码 Draco → 删除无纹理的 TEXCOORD_0 → 重新保存(不压缩)

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const file = process.argv[2] || 'public/models/iss.glb';
const doFix = process.argv.includes('--fix');
console.log(`Inspecting: ${file}`);

// Draco 解码/编码需要 draco3d 模块
const draco3d = (await import('draco3d')).default;
console.log('Loading Draco decoder & encoder...');
const decoderModule = await draco3d.createDecoderModule();
const encoderModule = await draco3d.createEncoderModule();

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': decoderModule,
    'draco3d.encoder': encoderModule,
  });

const doc = await io.read(file);

let hasIssue = false;
let fixedCount = 0;

const meshes = doc.getRoot().listMeshes();
console.log(`Meshes: ${meshes.length}`);

for (const mesh of meshes) {
  const primitives = mesh.listPrimitives();
  console.log(`  Mesh "${mesh.getName() || '(unnamed)'}": ${primitives.length} primitives`);

  for (let i = 0; i < primitives.length; i++) {
    const prim = primitives[i];
    const material = prim.getMaterial();
    const semantics = prim.listSemantics();

    const hasTexCoord = semantics.some(s => s.startsWith('TEXCOORD'));
    const hasTexture = material && (
      material.getBaseColorTexture() ||
      material.getMetallicRoughnessTexture() ||
      material.getNormalTexture() ||
      material.getOcclusionTexture() ||
      material.getEmissiveTexture()
    );

    console.log(`    Primitive ${i}: semantics=[${semantics.join(', ')}], hasTexture=${!!hasTexture}`);

    if (hasTexCoord && !hasTexture) {
      console.log(`    ⚠️  ISSUE: has TEXCOORD but no texture → shader will fail`);
      hasIssue = true;

      if (doFix) {
        const texSemantics = semantics.filter(s => s.startsWith('TEXCOORD'));
        for (const semantic of texSemantics) {
          // gltf-transform 的 Primitive 没有 removeAttribute
          // 用 setAttribute(semantic, null) 来删除属性
          prim.setAttribute(semantic, null);
          console.log(`    ✅ Removed ${semantic}`);
          fixedCount++;
        }
      }
    }
  }
}

if (!hasIssue) {
  console.log('\n✅ No TEXCOORD-without-texture issue found');
  process.exit(0);
}

if (!doFix) {
  console.log('\n⚠️  Issue found. Run with --fix to repair:');
  console.log(`   node scripts/fix-glb-texcoord.mjs ${file} --fix`);
  process.exit(0);
}

// 保存修复后的文件(覆盖原文件)
await io.write(file, doc);
console.log(`\n✅ Fixed ${fixedCount} attributes, saved to: ${file}`);
console.log(`   (Draco compression removed, model will load without shader errors)`);
