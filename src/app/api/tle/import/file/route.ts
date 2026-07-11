import { NextResponse } from 'next/server';

// 文件导入已改为前端纯客户端处理（不写DB）
// 此端点已禁用，防止恶意上传大文件消耗服务器资源
export async function POST() {
  return NextResponse.json(
    { success: false, error: '文件导入功能请使用前端导入（本端点已禁用）' },
    { status: 403 }
  );
}
