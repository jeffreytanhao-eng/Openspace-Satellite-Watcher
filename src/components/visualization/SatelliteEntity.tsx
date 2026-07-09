'use client';

export interface SatelliteEntityConfig {
  noradId: number;
  name: string;
  position: { x: number; y: number; z: number };
  color?: string;
  size?: number;
  isSelected?: boolean;
  showLabel?: boolean;
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
  } = config;

  const defaultColorObj = Cesium.Color.fromCssColorString(color);
  const selectedColorObj = Cesium.Color.fromCssColorString(SELECTED_COLOR);
  const whiteColor = Cesium.Color.WHITE;
  const blackColor = Cesium.Color.BLACK;

  const cartesian = new Cesium.Cartesian3(position.x, position.y, position.z);

  const entity = entityCollection.add({
    id: `satellite-${noradId}`,
    name,
    position: new Cesium.ConstantPositionProperty(cartesian),
    point: {
      pixelSize: isSelected ? SELECTED_SIZE : size,
      color: isSelected ? selectedColorObj : defaultColorObj,
      outlineColor: whiteColor,
      outlineWidth: isSelected ? 2 : 1,
      scaleByDistance: new Cesium.NearFarScalar(1.0e6, 1.5, 1.0e8, 0.4),
      // Omit disableDepthTestDistance so default depth test applies (occluded by Earth)
    },
    label: {
      text: name,
      font: isSelected ? 'bold 14px "Microsoft YaHei", sans-serif' : '13px "Microsoft YaHei", sans-serif',
      fillColor: isSelected ? selectedColorObj : whiteColor,
      outlineColor: blackColor,
      outlineWidth: isSelected ? 3 : 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(12, -12),
      scaleByDistance: new Cesium.NearFarScalar(5.0e5, 1.2, 1.0e8, 0.5),
      // Omit disableDepthTestDistance so labels are also occluded by Earth
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      show: showLabel,
      backgroundColor: new Cesium.Color(0, 0, 0, 0.75),
      backgroundPadding: new Cesium.Cartesian2(6, 3),
      showBackground: true,
    },
  });

  const update = (newConfig: Partial<SatelliteEntityConfig>) => {
    if (newConfig.position) {
      const newCartesian = new Cesium.Cartesian3(
        newConfig.position.x,
        newConfig.position.y,
        newConfig.position.z
      );
      entity.position = new Cesium.ConstantPositionProperty(newCartesian);
    }

    if (newConfig.isSelected !== undefined) {
      entity.point.pixelSize = newConfig.isSelected ? SELECTED_SIZE : size;
      entity.point.color = newConfig.isSelected ? selectedColorObj : defaultColorObj;
      entity.point.outlineWidth = newConfig.isSelected ? 2 : 1;
      entity.label.font = newConfig.isSelected
        ? 'bold 14px "Microsoft YaHei", sans-serif'
        : '13px "Microsoft YaHei", sans-serif';
      entity.label.fillColor = newConfig.isSelected ? selectedColorObj : whiteColor;
      entity.label.outlineWidth = newConfig.isSelected ? 3 : 2;
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
