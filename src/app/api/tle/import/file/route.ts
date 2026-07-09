import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseTLE } from '@/lib/tle/parser';
import { Source } from '@prisma/client';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { success: false, error: '请上传 TLE 文件' },
        { status: 400 }
      );
    }
    
    if (!file.name.endsWith('.txt') && !file.name.endsWith('.tle')) {
      return NextResponse.json(
        { success: false, error: '仅支持 .txt 或 .tle 格式的文件' },
        { status: 400 }
      );
    }
    
    const fileContent = await file.text();
    
    if (!fileContent.trim()) {
      return NextResponse.json(
        { success: false, error: '文件内容为空' },
        { status: 400 }
      );
    }
    
    const tleBlocks = fileContent.split(/\n\n/).filter(block => block.trim());
    
    if (tleBlocks.length === 0) {
      return NextResponse.json(
        { success: false, error: '文件中未找到有效的 TLE 数据块' },
        { status: 400 }
      );
    }
    
    const results = {
      total: tleBlocks.length,
      success: 0,
      failed: 0,
      failures: [] as { noradId: string; name: string; reason: string }[]
    };
    
    for (const block of tleBlocks) {
      const parseResult = parseTLE(block);
      
      if (!parseResult.success || !parseResult.data) {
        const lines = block.trim().split('\n');
        const name = lines[0] || '未知';
        const noradId = lines.length > 1 ? lines[1].slice(2, 7) : '未知';
        results.failed++;
        results.failures.push({
          noradId,
          name: name.trim(),
          reason: parseResult.errors?.map(e => e.message).join('; ') || '解析失败'
        });
        continue;
      }
      
      const { noradId, name, line1, line2, epoch } = parseResult.data;
      
      try {
        await prisma.spaceObject.upsert({
          where: { noradId: parseInt(noradId) },
          update: { name },
          create: {
            noradId: parseInt(noradId),
            name,
            isActive: true
          }
        });
        
        const spaceObject = await prisma.spaceObject.findUnique({
          where: { noradId: parseInt(noradId) }
        });
        
        if (spaceObject) {
          await prisma.tLEData.create({
            data: {
              spaceObjectId: spaceObject.id,
              line1,
              line2,
              epoch,
              source: Source.FILE_UPLOAD
            }
          });
        }
        
        results.success++;
      } catch (dbError) {
        results.failed++;
        results.failures.push({
          noradId,
          name,
          reason: '数据库写入失败'
        });
      }
    }
    
    return NextResponse.json({
      success: true,
      data: {
        fileName: file.name,
        fileSize: file.size,
        importReport: results
      }
    });
  } catch (error) {
    console.error('POST file import error:', error);
    return NextResponse.json(
      { success: false, error: '文件导入失败，请稍后重试' },
      { status: 500 }
    );
  }
}