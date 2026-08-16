// 将卫星的 data: URI imageUrl 替换为按需加载的短 URL。
// 用于 /api/space-objects 和星座导入 API，避免在响应中嵌入大段 base64 数据。
//
// 替换前：imageUrl = "data:image/jpeg;base64,/9j/4AAQ..."（100KB+）
// 替换后：imageUrl = "/api/satellite-image/44714"（30 字节）
//
// 浏览器通过 <img src="/api/satellite-image/44714"> 并行加载图片，且可被浏览器缓存。

export function replaceDataUriWithUrl<T extends { noradId: number; imageUrl?: string | null }>(
  satellites: T[]
): T[] {
  return satellites.map(s => {
    const url = s.imageUrl;
    if (url && url.startsWith('data:')) {
      return { ...s, imageUrl: `/api/satellite-image/${s.noradId}` };
    }
    return s;
  });
}
