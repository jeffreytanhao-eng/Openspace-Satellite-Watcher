/**
 * 批量 Draco 压缩 public/models/*.glb
 * 用法:
 *   node scripts/compress-models.mjs            # 压缩未压缩的 GLB
 *   node scripts/compress-models.mjs --all      # 重新压缩所有 GLB
 *   node scripts/compress-models.mjs --restore  # 从 original/ 恢复
 *
 * 大部分 NASA 模型已经过 Draco 压缩，脚本默认只压缩未压缩的文件。
 * @google/model-viewer 内置 Draco 解码支持，无需额外前端配置。
 */
import { readdir, mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { cwd } from 'node:process';

const MODELS_DIR = join(cwd(), 'public', 'models');
const BACKUP_DIR = join(MODELS_DIR, 'original');

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function createIO() {
  const { NodeIO } = await import('@gltf-transform/core');
  const { KHRONOS_EXTENSIONS } = await import('@gltf-transform/extensions');
  const { draco } = await import('@gltf-transform/functions');
  const draco3d = await import('draco3d');

  const decoder = await draco3d.createDecoderModule();
  const encoder = await draco3d.createEncoderModule();

  const io = new NodeIO()
    .registerExtensions(KHRONOS_EXTENSIONS)
    .registerDependencies({
      'draco3d.decoder': decoder,
      'draco3d.encoder': encoder,
    });

  return { io, draco };
}

async function compressFile(io, draco, filePath) {
  const originalBuffer = await readFile(filePath);
  const doc = await io.readBinary(originalBuffer);

  // 检查是否已压缩
  const exts = doc.getRoot().listExtensionsUsed().map((e) => e.extensionName);
  const alreadyCompressed = exts.includes('KHR_draco_mesh_compression');

  // 应用 Draco 压缩
  await doc.transform(
    draco({
      method: 'edgebreaker',
      encodeSpeed: 5,
      decodeSpeed: 0,
      quantizePosition: 14,
      quantizeNormal: 10,
      quantizeColor: 8,
      quantizeTexcoord: 12,
      quantizeGeneric: 12,
    })
  );

  const compressedBuffer = await io.writeBinary(doc);
  return { originalBuffer, compressedBuffer, alreadyCompressed };
}

async function main(compressAll) {
  const entries = await readdir(MODELS_DIR, { withFileTypes: true });
  const glbFiles = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.glb'))
    .map((e) => e.name)
    .sort();

  if (glbFiles.length === 0) {
    console.log('未找到 GLB 文件');
    process.exit(0);
  }

  console.log('========================================');
  console.log(`  Draco 压缩 ${compressAll ? '所有' : '未压缩的'} GLB 文件 (${glbFiles.length} 个)`);
  console.log('========================================\n');

  // 备份原始文件
  if (!existsSync(BACKUP_DIR)) {
    await mkdir(BACKUP_DIR, { recursive: true });
    console.log('备份原始文件到 public/models/original/ ...\n');
    for (const file of glbFiles) {
      await copyFile(join(MODELS_DIR, file), join(BACKUP_DIR, file));
    }
  } else if (compressAll) {
    console.log('检测到备份目录，从 original/ 恢复原始文件再重新压缩\n');
    for (const file of glbFiles) {
      const backupPath = join(BACKUP_DIR, file);
      if (existsSync(backupPath)) {
        await copyFile(backupPath, join(MODELS_DIR, file));
      }
    }
  }

  const { io, draco } = await createIO();

  let totalOriginal = 0;
  let totalCompressed = 0;
  let processed = 0;
  let skipped = 0;

  for (const file of glbFiles) {
    const filePath = join(MODELS_DIR, file);
    const originalBuffer = await readFile(filePath);
    const originalSize = originalBuffer.length;
    totalOriginal += originalSize;

    try {
      // 先尝试读取检查是否已压缩
      let isAlreadyCompressed = false;
      try {
        const checkDoc = await io.readBinary(originalBuffer);
        const exts = checkDoc.getRoot().listExtensionsUsed().map((e) => e.extensionName);
        isAlreadyCompressed = exts.includes('KHR_draco_mesh_compression');
      } catch {
        // 读取失败说明需要 Draco 解码器，可能已压缩
        isAlreadyCompressed = true;
      }

      // 跳过已压缩的文件（除非 --all）
      if (isAlreadyCompressed && !compressAll) {
        totalCompressed += originalSize;
        skipped++;
        console.log(`⊘ ${file.padEnd(20)} ${formatBytes(originalSize).padStart(10)}  (已压缩，跳过)`);
        continue;
      }

      // 压缩
      const { compressedBuffer } = await compressFile(io, draco, filePath);
      const compressedSize = compressedBuffer.byteLength;
      totalCompressed += compressedSize;

      await writeFile(filePath, compressedBuffer);
      processed++;

      const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(1);
      console.log(`✓ ${file.padEnd(20)} ${formatBytes(originalSize).padStart(10)} → ${formatBytes(compressedSize).padStart(10)}  (-${ratio}%)`);
    } catch (err) {
      totalCompressed += originalSize;
      console.log(`✗ ${file.padEnd(20)} 压缩失败: ${err.message}`);
    }
  }

  const totalRatio = totalOriginal > 0 ? ((1 - totalCompressed / totalOriginal) * 100).toFixed(1) : 0;
  console.log('\n========================================');
  console.log('  压缩完成');
  console.log('========================================');
  console.log(`处理: ${processed} 个 | 跳过: ${skipped} 个`);
  console.log(`原始总大小: ${formatBytes(totalOriginal)}`);
  console.log(`压缩后大小: ${formatBytes(totalCompressed)}`);
  if (processed > 0) {
    console.log(`节省: ${formatBytes(totalOriginal - totalCompressed)} (-${totalRatio}%)`);
  }
  console.log(`\n备份位置: public/models/original/`);
  console.log(`回滚: node scripts/compress-models.mjs --restore`);
}

async function restore() {
  if (!existsSync(BACKUP_DIR)) {
    console.log('未找到备份目录 public/models/original/');
    process.exit(1);
  }
  const backupFiles = await readdir(BACKUP_DIR);
  const glbBackups = backupFiles.filter((f) => f.toLowerCase().endsWith('.glb'));
  console.log(`恢复 ${glbBackups.length} 个原始 GLB 文件...`);
  for (const file of glbBackups) {
    await copyFile(join(BACKUP_DIR, file), join(MODELS_DIR, file));
    console.log(`✓ ${file}`);
  }
  console.log('\n恢复完成');
}

const args = process.argv.slice(2);
if (args.includes('--restore') || args.includes('-r')) {
  restore().catch((err) => {
    console.error('恢复失败:', err);
    process.exit(1);
  });
} else {
  const compressAll = args.includes('--all') || args.includes('-a');
  main(compressAll).catch((err) => {
    console.error('压缩失败:', err);
    process.exit(1);
  });
}
