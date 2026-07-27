'use client';

export interface SatelliteEntityConfig {
  noradId: number;
  name: string;
  position: { x: number; y: number; z: number };
  color?: string;
  size?: number;
  isSelected?: boolean;
  showLabel?: boolean;
  model3dUrl?: string | null;
  /** 是否用 3D 模型渲染(跟踪时为 true,默认 false 用光点) */
  useModel?: boolean;
}

export interface SatelliteEntityResult {
  entity: any;
  update: (config: Partial<SatelliteEntityConfig>) => void;
  destroy: () => void;
}

const DEFAULT_COLOR = '#00d4ff';
const SELECTED_COLOR = '#ffd700';
const DEFAULT_SIZE = 8;
const SELECTED_SIZE = 12;

// 3D 模型渲染参数
// 设计目标:选中时显示模型,且随滚轮拉近而放大(近大远小)
// - scale 把模型放大到在跟踪距离(100km~20000km)下可见
// - minimumPixelSize 设为 0:不强制最小像素,让模型完全按物理尺寸 + Cesium 透视
//   自然缩放(近大远小)。之前设 12 会导致部分模型被固定在最小像素不随距离变化
// - 不设 maximumScale,让模型随距离自由缩放
//
// 各模型建模单位不统一(差数千倍),按 bounding box 实测算出独立 scale,
// 让所有模型显示尺寸统一(不考虑真实卫星比例),以 ISS 为基准
// 详见 scripts/measure-glb-size.mjs
const MODEL_MIN_PIXEL = 0;       // 设 0:不强制最小像素,完全按透视缩放(解决部分模型不能缩放)
const DEFAULT_MODEL_SCALE = 3000; // 未知模型的默认缩放

// 按模型文件名查表(已用 measure-glb-size.mjs 实测 bounding box 校准)
// 目标:所有模型 diag * scale ≈ 149850(ISS 基准)
const MODEL_SCALE_BY_TYPE: Record<string, number> = {
  'iss': 3000,        // diag=49.95
  'hubble': 175,      // diag=858.74
  'terra': 4.8,       // diag=31144.24
  'aqua': 72,         // diag=2074.16
  'aura': 213,        // diag=703.86
  'landsat8': 0.49,   // diag=307206.23
  'suomi-npp': 14808, // diag=10.12
  'calipso': 15,      // diag=10013.66(TREA-01 复用,对地观测激光雷达卫星)
};

/** 从 model3dUrl(如 /models/iss.glb)提取模型名并查表得到 scale */
function getModelScale(model3dUrl: string): number {
  const match = model3dUrl.match(/\/models\/([^/]+)\.glb/i);
  const name = match ? match[1].toLowerCase() : '';
  return MODEL_SCALE_BY_TYPE[name] ?? DEFAULT_MODEL_SCALE;
}

// 模型有问题的卫星(渲染异常/损坏),改用光点显示,和 Starlink 等无模型卫星一致
const MODEL_BLACKLIST = new Set(['landsat8']);

/** 检查模型是否被黑名单(用光点替代) */
function isModelBlacklisted(model3dUrl: string): boolean {
  const match = model3dUrl.match(/\/models\/([^/]+)\.glb/i);
  const name = match ? match[1].toLowerCase() : '';
  return MODEL_BLACKLIST.has(name);
}

/**
 * 计算卫星朝向地心的姿态四元数
 * 让模型"底部"朝向地球(对地定向,符合多数对地观测卫星姿态)
 */
function computeOrientation(Cesium: any, cartesian: any) {
  // pitch = -90°:模型绕 East 轴翻转,使 Up 方向(模型顶部)朝向地心
  return Cesium.Transforms.headingPitchRollQuaternion(
    cartesian,
    new Cesium.HeadingPitchRoll(0, Cesium.Math.toRadians(-90), 0)
  );
}

export function createSatelliteEntity(
  Cesium: any,
  entityCollection: any,
  config: SatelliteEntityConfig
): SatelliteEntityResult {
  const {
    noradId,
    name,
    position,
    color = DEFAULT_COLOR,
    size = DEFAULT_SIZE,
    isSelected = false,
    showLabel = true,
    model3dUrl = null,
    useModel = false,
  } = config;

  const defaultColorObj = Cesium.Color.fromCssColorString(color);
  const selectedColorObj = Cesium.Color.fromCssColorString(SELECTED_COLOR);
  const whiteColor = Cesium.Color.WHITE;
  const blackColor = Cesium.Color.BLACK;

  const cartesian = new Cesium.Cartesian3(position.x, position.y, position.z);

  // 是否有 GLB 模型可用(决定是否创建 model graphics)
  // 黑名单中的模型(如 landsat8,文件损坏)改用光点显示
  const hasModel = !!model3dUrl && !isModelBlacklisted(model3dUrl as string);

  const entityOptions: any = {
    id: `satellite-${noradId}`,
    name,
    position: new Cesium.ConstantPositionProperty(cartesian),
    label: {
      text: name,
      font: isSelected ? 'bold 14px "Microsoft YaHei", sans-serif' : '13px "Microsoft YaHei", sans-serif',
      fillColor: isSelected ? selectedColorObj : whiteColor,
      outlineColor: blackColor,
      outlineWidth: isSelected ? 3 : 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(16, -16),
      scaleByDistance: new Cesium.NearFarScalar(5.0e5, 1.2, 1.0e8, 0.5),
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      show: showLabel,
      backgroundColor: new Cesium.Color(0, 0, 0, 0.75),
      backgroundPadding: new Cesium.Cartesian2(6, 3),
      showBackground: true,
    },
    // 默认光点(所有卫星初始都用光点显示)
    point: {
      pixelSize: isSelected ? SELECTED_SIZE : size,
      color: isSelected ? selectedColorObj : defaultColorObj,
      outlineColor: whiteColor,
      outlineWidth: isSelected ? 2 : 1,
      scaleByDistance: new Cesium.NearFarScalar(1.0e6, 1.5, 1.0e8, 0.4),
      show: !useModel,
    },
  };

  // 有 GLB 模型时,同时创建 model graphics(默认隐藏,跟踪时显示)
  if (hasModel) {
    // model3dUrl 是相对路径(如 /models/iss.glb),需转为完整 URL
    // 否则 Cesium 会用 CESIUM_BASE_URL(CDN)解析,导致 404
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const modelUri = (model3dUrl as string).startsWith('http')
      ? model3dUrl
      : baseUrl + model3dUrl;
    entityOptions.orientation = new Cesium.ConstantProperty(computeOrientation(Cesium, cartesian));
    entityOptions.model = {
      uri: modelUri,
      minimumPixelSize: MODEL_MIN_PIXEL,
      scale: getModelScale(model3dUrl as string),
      // 不设 maximumScale:让模型随相机距离自由缩放,滚轮拉近时自然放大
      // 不使用 color/colorBlendMode:MIX 模式在模型有 TEXCOORD_0 但无纹理时
      // 触发 shader 编译错误(v_texCoord_0 undeclared identifier)
      shadows: Cesium.ShadowMode.DISABLED,
      show: useModel,
    };
  }

  const entity = entityCollection.add(entityOptions);

  const update = (newConfig: Partial<SatelliteEntityConfig>) => {
    if (newConfig.position) {
      const newCartesian = new Cesium.Cartesian3(
        newConfig.position.x,
        newConfig.position.y,
        newConfig.position.z
      );
      entity.position = new Cesium.ConstantPositionProperty(newCartesian);
      // 模型需要同步更新朝向(朝向地心的方向取决于位置)
      if (hasModel && entity.orientation) {
        entity.orientation = new Cesium.ConstantProperty(computeOrientation(Cesium, newCartesian));
      }
    }

    // 切换光点/模型显示(跟踪时用模型,非跟踪用光点)
    if (newConfig.useModel !== undefined && hasModel) {
      entity.point.show = new Cesium.ConstantProperty(!newConfig.useModel);
      entity.model.show = new Cesium.ConstantProperty(newConfig.useModel);
    }

    if (newConfig.isSelected !== undefined) {
      // 光点:选中变大 + 变色
      if (entity.point) {
        entity.point.pixelSize = new Cesium.ConstantProperty(
          newConfig.isSelected ? SELECTED_SIZE : size
        );
        entity.point.color = new Cesium.ConstantProperty(
          newConfig.isSelected ? selectedColorObj : defaultColorObj
        );
        entity.point.outlineWidth = new Cesium.ConstantProperty(newConfig.isSelected ? 2 : 1);
      }
      entity.label.font = new Cesium.ConstantProperty(
        newConfig.isSelected
          ? 'bold 14px "Microsoft YaHei", sans-serif'
          : '13px "Microsoft YaHei", sans-serif'
      );
      entity.label.fillColor = new Cesium.ConstantProperty(
        newConfig.isSelected ? selectedColorObj : whiteColor
      );
      entity.label.outlineWidth = new Cesium.ConstantProperty(newConfig.isSelected ? 3 : 2);
    }
  };

  const destroy = () => {
    if (entityCollection.contains(entity)) {
      entityCollection.remove(entity);
    }
  };

  return { entity, update, destroy };
}

export function getSatelliteColor(objectType: string): string {
  const colorMap: Record<string, string> = {
    SATELLITE: '#00d4ff',   // 青色 - 卫星
    PAYLOAD: '#00ff88',     // 绿色 - 有效载荷
    DEBRIS: '#ff4444',      // 红色 - 碎片
    ROCKET_BODY: '#ffaa00', // 橙色 - 火箭体
    UNKNOWN: '#888888',     // 灰色 - 未知
  };

  return colorMap[objectType] || DEFAULT_COLOR;
}
