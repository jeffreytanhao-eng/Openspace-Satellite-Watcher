'use client';

export interface OrbitTrailConfig {
  noradId: number;
  points: Array<{ x: number; y: number; z: number }>;
  color?: string;
  width?: number;
  isSelected?: boolean;
  predictOrbits?: number;
}

export interface OrbitTrailResult {
  entity: any;
  update: (config: Partial<OrbitTrailConfig>) => void;
  destroy: () => void;
}

const DEFAULT_ORBIT_COLOR = '#00d4ff';
const SELECTED_ORBIT_COLOR = '#ffd700';
const DEFAULT_WIDTH = 1;
const SELECTED_WIDTH = 3;

function pointsToCartesians(Cesium: any, points: Array<{ x: number; y: number; z: number }>): any[] {
  return points.map(p => new Cesium.Cartesian3(p.x, p.y, p.z));
}

function buildPolyline(Cesium: any, positions: any[], color: any, width: number, glowPower: number) {
  return {
    positions: new Cesium.ConstantProperty(positions),
    width,
    material: new Cesium.PolylineGlowMaterialProperty({
      glowPower,
      color,
    }),
    arcType: Cesium.ArcType.NONE,
    show: true,
  };
}

export function createOrbitTrail(
  Cesium: any,
  entityCollection: any,
  config: OrbitTrailConfig
): OrbitTrailResult {
  const { noradId, points, color = DEFAULT_ORBIT_COLOR, width = DEFAULT_WIDTH, isSelected = false } = config;

  if (points.length < 2) {
    const entity = entityCollection.add({
      id: `orbit-${noradId}`,
      show: false,
    });
    return {
      entity,
      update: () => {},
      destroy: () => {
        if (entityCollection.contains(entity)) entityCollection.remove(entity);
      },
    };
  }

  const positions = pointsToCartesians(Cesium, points);
  const orbitColor = Cesium.Color.fromCssColorString(color).withAlpha(0.7);
  const selectedColor = Cesium.Color.fromCssColorString(SELECTED_ORBIT_COLOR).withAlpha(0.9);

  const entity = entityCollection.add({
    id: `orbit-${noradId}`,
    polyline: buildPolyline(
      Cesium,
      positions,
      isSelected ? selectedColor : orbitColor,
      isSelected ? SELECTED_WIDTH : width,
      0.15
    ),
  });

  const update = (newConfig: Partial<OrbitTrailConfig>) => {
    if (newConfig.points && newConfig.points.length >= 2) {
      const newPositions = pointsToCartesians(Cesium, newConfig.points);
      if (entity.polyline) {
        entity.polyline.positions = new Cesium.ConstantProperty(newPositions);
      }
    }

    if (newConfig.isSelected !== undefined && entity.polyline) {
      entity.polyline.width = new Cesium.ConstantProperty(
        newConfig.isSelected ? SELECTED_WIDTH : width
      );
      entity.polyline.material = new Cesium.PolylineGlowMaterialProperty({
        glowPower: newConfig.isSelected ? 0.25 : 0.15,
        color: newConfig.isSelected ? selectedColor : orbitColor,
      });
    }
  };

  const destroy = () => {
    if (entityCollection.contains(entity)) {
      entityCollection.remove(entity);
    }
  };

  return { entity, update, destroy };
}

export function createPredictedOrbit(
  Cesium: any,
  entityCollection: any,
  config: OrbitTrailConfig
): OrbitTrailResult {
  const { noradId, points, predictOrbits = 3 } = config;

  if (points.length < 2) {
    const entity = entityCollection.add({ id: `predicted-orbit-${noradId}`, show: false });
    return {
      entity,
      update: () => {},
      destroy: () => {
        if (entityCollection.contains(entity)) entityCollection.remove(entity);
      },
    };
  }

  const orbitLength = points.length;
  const totalPoints = Math.min(orbitLength * predictOrbits, orbitLength * 5);

  const predictedPoints: Array<{ x: number; y: number; z: number }> = [];
  for (let i = 0; i < totalPoints; i++) {
    const index = i % orbitLength;
    predictedPoints.push(points[index]);
  }

  const positions = pointsToCartesians(Cesium, predictedPoints);
  const predictedColor = Cesium.Color.fromCssColorString('#00d4ff').withAlpha(0.2);

  const entity = entityCollection.add({
    id: `predicted-orbit-${noradId}`,
    polyline: buildPolyline(Cesium, positions, predictedColor, 1, 0.25),
  });

  const update = (newConfig: Partial<OrbitTrailConfig>) => {
    if (newConfig.points && newConfig.points.length >= 2) {
      const newOrbitLength = newConfig.points.length;
      const newTotalPoints = Math.min(
        newOrbitLength * (newConfig.predictOrbits || predictOrbits),
        newOrbitLength * 5
      );

      const newPredictedPoints: Array<{ x: number; y: number; z: number }> = [];
      for (let i = 0; i < newTotalPoints; i++) {
        const index = i % newOrbitLength;
        newPredictedPoints.push(newConfig.points![index]);
      }

      const newPositions = pointsToCartesians(Cesium, newPredictedPoints);
      if (entity.polyline) {
        entity.polyline.positions = new Cesium.ConstantProperty(newPositions);
      }
    }
  };

  const destroy = () => {
    if (entityCollection.contains(entity)) {
      entityCollection.remove(entity);
    }
  };

  return { entity, update, destroy };
}
