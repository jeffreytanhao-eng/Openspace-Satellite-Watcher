'use client';

import type * as CesiumType from 'cesium';

type CesiumNS = typeof CesiumType;

// 地球影像源配置:
//   'esri'          - Esri World Imagery 高清卫星影像(默认)
//   'naturalearth'  - Cesium CDN NaturalEarthII 低清影像(回退)
// 通过环境变量 NEXT_PUBLIC_EARTH_IMAGERY 切换,改部署配置即可回退,无需改代码。
export const EARTH_IMAGERY_SOURCE: 'esri' | 'naturalearth' =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_EARTH_IMAGERY === 'naturalearth'
    ? 'naturalearth'
    : 'esri';

const ESRI_WORLD_IMAGERY_TILE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

/**
 * 创建地球影像 Provider。
 * 按 EARTH_IMAGERY_SOURCE 配置返回 Esri 高清或 NaturalEarthII;
 * 若 Esri 加载失败自动回退到 NaturalEarthII。
 */
export async function createEarthImageryProvider(
  Cesium: CesiumNS,
  cesiumCdn: string,
): Promise<{ provider: CesiumType.ImageryProvider | null; ok: boolean }> {
  // 1) Esri 高清卫星影像
  if (EARTH_IMAGERY_SOURCE === 'esri') {
    try {
      if (typeof Cesium.UrlTemplateImageryProvider.fromUrl === 'function') {
        const provider = await Cesium.UrlTemplateImageryProvider.fromUrl(
          ESRI_WORLD_IMAGERY_TILE_URL,
          {
            maximumLevel: 19,
            credit: 'Esri, Maxar, Earthstar Geographics',
          },
        );
        return { provider, ok: true };
      }
      const provider = new Cesium.UrlTemplateImageryProvider({
        url: ESRI_WORLD_IMAGERY_TILE_URL,
        maximumLevel: 19,
        credit: 'Esri, Maxar, Earthstar Geographics',
      });
      return { provider, ok: true };
    } catch (e) {
      console.warn('[imagery] Esri provider failed, falling back to NaturalEarthII:', e);
    }
  }

  // 2) NaturalEarthII 回退
  try {
    const ne2 = await Cesium.TileMapServiceImageryProvider.fromUrl(
      cesiumCdn + '/Assets/Textures/NaturalEarthII/',
      { maximumLevel: 2 },
    );
    return { provider: ne2, ok: true };
  } catch (e) {
    console.warn('[imagery] NaturalEarthII provider failed:', e);
    return { provider: null, ok: false };
  }
}