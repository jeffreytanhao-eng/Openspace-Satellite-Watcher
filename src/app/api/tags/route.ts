import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { mockTags } from '@/lib/mock/satellites';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');
    
    let tags;
    if (name) {
      tags = await prisma.userTag.findMany({
        where: { name: { contains: name, mode: 'insensitive' } },
        include: { objects: true },
        orderBy: { name: 'asc' }
      });
    } else {
      tags = await prisma.userTag.findMany({
        include: { objects: true },
        orderBy: { name: 'asc' }
      });
    }
    
    return NextResponse.json({ success: true, data: tags });
  } catch (error) {
    console.warn('Database unavailable, using mock data:', error);
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');
    
    let tags = mockTags.map(tag => ({
      ...tag,
      objects: []
    }));
    
    if (name) {
      tags = tags.filter(tag => tag.name.toLowerCase().includes(name.toLowerCase()));
    }
    
    return NextResponse.json({ success: true, data: tags });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!body.name) {
      return NextResponse.json(
        { success: false, error: '标签名称为必填项' },
        { status: 400 }
      );
    }
    
    if (!body.color) {
      return NextResponse.json(
        { success: false, error: '标签颜色为必填项' },
        { status: 400 }
      );
    }
    
    const existing = await prisma.userTag.findUnique({
      where: { name: body.name }
    });
    
    if (existing) {
      return NextResponse.json(
        { success: false, error: `标签名称 "${body.name}" 已存在` },
        { status: 409 }
      );
    }
    
    const tag = await prisma.userTag.create({
      data: {
        name: body.name,
        color: body.color
      },
      include: { objects: true }
    });
    
    return NextResponse.json({ success: true, data: tag }, { status: 201 });
  } catch (error) {
    console.error('POST tags error:', error);
    return NextResponse.json(
      { success: false, error: '创建标签失败' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!body.id) {
      return NextResponse.json(
        { success: false, error: '标签 ID 为必填项' },
        { status: 400 }
      );
    }
    
    const tag = await prisma.userTag.update({
      where: { id: body.id },
      data: {
        name: body.name,
        color: body.color
      },
      include: { objects: true }
    });
    
    return NextResponse.json({ success: true, data: tag });
  } catch (error) {
    console.error('PUT tags error:', error);
    return NextResponse.json(
      { success: false, error: '更新标签失败' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!body.id) {
      return NextResponse.json(
        { success: false, error: '标签 ID 为必填项' },
        { status: 400 }
      );
    }
    
    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.color !== undefined) updateData.color = body.color;
    
    const tag = await prisma.userTag.update({
      where: { id: body.id },
      data: updateData,
      include: { objects: true }
    });
    
    return NextResponse.json({ success: true, data: tag });
  } catch (error) {
    console.error('PATCH tags error:', error);
    return NextResponse.json(
      { success: false, error: '更新标签失败' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: '标签 ID 为必填项' },
        { status: 400 }
      );
    }
    
    await prisma.userTag.delete({ where: { id } });
    
    return NextResponse.json({ success: true, message: '删除成功' });
  } catch (error) {
    console.error('DELETE tags error:', error);
    return NextResponse.json(
      { success: false, error: '删除标签失败' },
      { status: 500 }
    );
  }
}