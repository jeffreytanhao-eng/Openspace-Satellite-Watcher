'use client';

// ============================================================
// 赛车视角轻量 Cesium Hook — /cockpit 专用
// ------------------------------------------------------------
// 使用直接 Model 图元(scene.primitives.add)而非 Entity + CallbackProperty。
//
// 原因:Entity 系统的 CallbackProperty 在持续渲染模式下位置更新不稳定,
//   表现为:模型播放时消失/快速缩放、交通卫星位置抖动(帧内多次求值)。
//   直接 Model 图元每帧通过 modelMatrix 原子更新位置+朝向,完全可控。
//
// 本 hook 职责:
//   1. 初始化 Viewer(星空+大气+NaturalEarthII 影像)
//   2. TREA-01 Model 图元(calipso-decoded.glb,科幻放大,偏航对齐速度)
//   3. 5 颗交通卫星 Model 图元(3D 模型,无光晕,微微染色)
//   4. LabelCollection 图元(卫星名称+距离标签)
//   5. 追踪相机:每帧 setView 把相机放到 TREA-01 后上方
//   6. 滚轮缩放(调整相机距离倍率,模型比例不变)
//   7. 多卫星调度:首轮调度3颗(错开到达),后续快速补充
//
// 完全独立:只读 treaMissionStore.tle / timeStore,不写 store,不影响主应用。
// StrictMode 安全:同步创建 Viewer + 监听器,Model 异步加载(销毁时跳过)。
// ============================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import type * as CesiumType from 'cesium';
import { useTimeStore } from '@/store/timeStore';
import { useTreaTle } from '@/store/treaMissionStore';
import { createSatrec } from '@/lib/tle/orbit';
import type { TLEData } from '@/lib/tle/parser';
import {
  createTrafficSats,
  propagateEcfKm,
  distanceKm,
  rephaseTrafficSat,
  TRAFFIC_SHOW_DISTANCE_KM,
  type TrafficSat,
} from '@/lib/cockpit/traffic-sats';
import { createEarthImageryProvider } from '@/lib/cesium/imagery';

type CesiumNS = typeof CesiumType;

const CESIUM_CDN = 'https://cdn.jsdelivr.net/npm/cesium@1.142.0/Build/Cesium';

// ============================================================
// 参数常量
// ============================================================

// ---- 追踪相机 ----
const CHASE_BACK_M = 350;   // 相机在卫星后方距离(沿速度反方向)
const CHASE_UP_M = 200;     // 相机抬高(视线俯角,使前方交通卫星落入视野)
const LOOK_AHEAD_M = 150;   // 视线瞄准点在卫星前方距离

// ---- TREA-01 模型 ----
const TREA_MODEL_SCALE = 0.7;  // calipso scene diag≈239 → 显示 ~167m

// ---- 滚轮缩放 ----
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 2.5;

// ---- TREA-01 姿态参数 ----
// yaw_offset 控制模型水平旋转(yaw):
//   yaw_offset=270°(3π/2): 模型水平旋转 270°
// 用户请求:水平旋转 270°
const TREA_YAW_OFFSET_RAD = (Math.PI * 3) / 2;
const TREA_PITCH_RAD = 0;
const TREA_ROLL_RAD = 0;

// ---- 交通卫星调度参数 ----
// 首次调度 LEAD(仿真时长):100s sim → 10s real @10x
// 卫星在调度时刻已在 50km 内(沿迹≈19km+高度差≈19km→距离≈27km),立即可见
const TRAFFIC_FIRST_LEAD_SIM_MS = 100_000;
// 后续重调 LEAD:100s sim → 10s real @10x
const TRAFFIC_RESCHEDULE_LEAD_SIM_MS = 100_000;
// 冷却时间:60s sim → 6s real @10x,防止同一颗卫星被连续快速重调度
const TRAFFIC_COOLDOWN_SIM_MS = 60 * 1000;
// 屏幕上同时可见的最大交通卫星数:用户指定为 2
const MAX_CONCURRENT_VISIBLE = 2;
// 调度检查间隔:60s sim → 6s real @10x(分批调度,错开新卫星的出现时间)
const SCHEDULE_CHECK_INTERVAL_SIM_MS = 60_000;

// ---- 交通卫星显示滞后距离(km) ----
// 进入 50km 显示,离开 55km 才隐藏,防止临界震荡闪烁
const TRAFFIC_HIDE_DISTANCE_KM = 55;

// ---- 交通卫星并发分离设置 ----
// 沿迹偏移(km):按索引奇偶交替(+15/+38),保证并发两颗卫星沿迹距离明显错开。
// RAAN 偏移(度):按索引奇偶交替(±0.18°),使并发两颗卫星处于稍不同轨道面,
//   产生横向(侧向)分离,不落在 TREA-01 正前方的同一直线上,避免视觉重叠。
const TRAFFIC_AHEAD_EVEN_KM = 15;
const TRAFFIC_AHEAD_ODD_KM = 38;
const TRAFFIC_RAAN_OFFSET_DEG = 0.18;

// ---- 飞行方向控制参数 ----
// 用户按左/右键 → 卫星模型横向偏移 + 倾斜(视觉效果,不改真实轨道)
const LATERAL_MAX_M = 5000;            // 最大横向偏移 ±5km
const LATERAL_LERP = 0.06;             // 每帧 lerp 系数(60fps ≈ 1秒到达目标 95%)
const MAX_ROLL_RAD = Math.PI / 18;     // 最大滚转角 10°

// ---- 交通卫星 3D 模型参数 ----
const TRAFFIC_MODEL_MIN_PIXEL = 50;
const TRAFFIC_MODEL_SCALE: Record<string, number> = {
  'trmm-decoded': 33 / 616172,    // scene diag ~616172 → ~33m
  'grace-decoded': 22.9 / 3,      // scene diag ~4.37 → ~33m
  'oco2-decoded': 2.3 / 3,        // scene diag ~43 → ~33m
  'tess-decoded': 2.3 / 3,        // scene diag ~44 → ~33m
  'swift-decoded': 1.75 / 3,      // scene diag ~57 → ~33m
};

// ============================================================
// Cesium 加载
// ============================================================

function getCesium(): CesiumNS {
  if (typeof window === 'undefined' || !(window as unknown as { Cesium?: CesiumNS }).Cesium) {
    throw new Error('Cesium not loaded yet');
  }
  return (window as unknown as { Cesium: CesiumNS }).Cesium;
}

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).CESIUM_BASE_URL = CESIUM_CDN + '/';
}

// ============================================================
// 类型
// ============================================================

interface ChaseInstance {
  viewer: CesiumType.Viewer;
  removePreUpdate: () => void;
  removeWheel: () => void;
  removeKeydown: () => void;
  removeKeyup: () => void;
  dispose: () => void;
}

export interface UseChaseViewerReturn {
  containerRef: React.RefObject<HTMLDivElement>;
  ready: boolean;
  loadError: string | null;
  setDirection: (dir: 'left' | 'right' | 'center') => void;
}

// ============================================================
// Hook
// ============================================================

export function useChaseViewer(): UseChaseViewerReturn {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const instRef = useRef<ChaseInstance | null>(null);
  const initializedRef = useRef(false);

  // satrec 缓存(tle 变化时重建)
  const treaSatrecRef = useRef<ReturnType<typeof createSatrec> | null>(null);
  const trafficSatsRef = useRef<TrafficSat[]>([]);
  const treaTleRef = useRef<TLEData | null>(null);
  // 调度状态
  const nextScheduleSimRef = useRef(0);
  const isFirstScheduleRef = useRef(true);
  // 滚轮缩放
  const zoomRef = useRef(1);
  // 飞行方向控制:横向偏移(当前值/目标值,米)
  const lateralOffsetRef = useRef(0);
  const lateralTargetRef = useRef(0);

  const tle = useTreaTle();

  // 飞行方向控制(键盘和 UI 按钮共用)
  const setDirection = useCallback((dir: 'left' | 'right' | 'center') => {
    lateralTargetRef.current =
      dir === 'left' ? -LATERAL_MAX_M : dir === 'right' ? LATERAL_MAX_M : 0;
  }, []);

  // tle 变化时重建 satrec
  useEffect(() => {
    if (!tle) return;
    treaSatrecRef.current = createSatrec(tle);
    trafficSatsRef.current = createTrafficSats(tle);
    treaTleRef.current = tle;
    nextScheduleSimRef.current = 0;
    isFirstScheduleRef.current = true;
  }, [tle]);

  // ============================================================
  // 初始化 Viewer + Model 图元
  // ============================================================
  const initCesium = useCallback((container: HTMLDivElement): ChaseInstance => {
    if (initializedRef.current) {
      throw new Error('[useChaseViewer] initCesium called twice');
    }
    initializedRef.current = true;

    const Cesium = getCesium();
    Cesium.Ion.defaultAccessToken = '';

    // ---- Viewer ----
    const viewer = new Cesium.Viewer(container, {
      baseLayerPicker: false,
      fullscreenButton: false,
      homeButton: false,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: false,
      animation: false,
      navigationHelpButton: false,
      geocoder: false,
      infoBox: false,
      shouldAnimate: false,
      imageryProvider: false as unknown as CesiumType.ImageryProvider,
    });

    const scene = viewer.scene;

    // ---- 星空 ----
    scene.skyBox = new Cesium.SkyBox({
      sources: {
        positiveX: CESIUM_CDN + '/Assets/Textures/SkyBox/tycho2t3_80_px.jpg',
        negativeX: CESIUM_CDN + '/Assets/Textures/SkyBox/tycho2t3_80_mx.jpg',
        positiveY: CESIUM_CDN + '/Assets/Textures/SkyBox/tycho2t3_80_py.jpg',
        negativeY: CESIUM_CDN + '/Assets/Textures/SkyBox/tycho2t3_80_my.jpg',
        positiveZ: CESIUM_CDN + '/Assets/Textures/SkyBox/tycho2t3_80_pz.jpg',
        negativeZ: CESIUM_CDN + '/Assets/Textures/SkyBox/tycho2t3_80_mz.jpg',
      },
    }) as CesiumType.SkyBox;
    scene.skyBox.show = true;

    // ---- 地球(开启光照:昼夜变暗 + 城市灯光) ----
    scene.globe.baseColor = Cesium.Color.fromCssColorString('#1a3a5c');
    if (scene.skyAtmosphere) scene.skyAtmosphere.show = true;
    scene.backgroundColor = Cesium.Color.BLACK;
    // 开启地球光照:太阳位置由 viewer.clock.currentTime(已同步仿真时间)决定
    // 夜面自动变暗,晨昏线自动渲染
    scene.globe.enableLighting = true;
    scene.fog.enabled = false;
    scene.sun.show = true;
    scene.moon.show = false;
    scene.globe.showGroundAtmosphere = true;
    scene.globe.showSkirts = false;
    scene.globe.depthTestAgainstTerrain = false;

    // ---- 影像(异步) ----
    // baseUrl 提前定义(Black Marble 纹理和 Model 均使用)
    const baseUrl = (typeof window !== 'undefined' ? window.location.origin : '');

    // 基础昼面影像:Esri World Imagery 高清(或 NaturalEarthII 回退)
    createEarthImageryProvider(Cesium, CESIUM_CDN)
      .then(({ provider, ok }) => {
        if (viewer.isDestroyed()) return;
        if (ok && provider) {
          viewer.imageryLayers.addImageryProvider(provider);
        }
      })
      .catch((e: unknown) => {
        if (viewer.isDestroyed()) return;
        console.warn('[useChaseViewer] 影像加载失败:', e);
      });

    // 夜间城市灯光:NASA Black Marble(本地纹理,避免 CORS/WMTS 瓦片加载问题)
    // 2048x1024 equirectangular,适配 WebGL 纹理大小限制
    // dayAlpha=0(昼面透明不显示), nightAlpha=0.85(夜面显示城市灯光)
    // 仅在 enableLighting=true 时 dayAlpha/nightAlpha 生效
    try {
      const STIP = Cesium.SingleTileImageryProvider;
      const providerPromise: Promise<CesiumType.ImageryProvider> =
        typeof STIP.fromUrl === 'function'
          ? STIP.fromUrl(baseUrl + '/textures/black-marble-small.jpg')
          : Promise.resolve(new STIP({ url: baseUrl + '/textures/black-marble-small.jpg' }) as CesiumType.ImageryProvider);
      providerPromise
        .then((provider: CesiumType.ImageryProvider) => {
          if (viewer.isDestroyed()) return;
          const layer = viewer.imageryLayers.addImageryProvider(provider);
          layer.dayAlpha = 0.0;      // 昼面完全透明
          layer.nightAlpha = 0.85;   // 夜面显示城市灯光
          layer.brightness = 1.8;    // 城市灯光提亮
          console.warn('[cockpit] Black Marble 城市灯光图层已加载');
        })
        .catch((e: unknown) => {
          if (viewer.isDestroyed()) return;
          console.warn('[useChaseViewer] 城市灯光加载失败(fromUrl):', e);
        });
    } catch (e) {
      if (!viewer.isDestroyed()) {
        console.warn('[useChaseViewer] 城市灯光加载失败(构造):', e);
      }
    }

    // 隐藏 credit
    try {
      const creditContainer = viewer.cesiumWidget.creditContainer as HTMLElement;
      if (creditContainer) creditContainer.style.display = 'none';
    } catch { /* ignore */ }

    // 关闭默认相机控制
    const ssc = scene.screenSpaceCameraController;
    ssc.enableRotate = false;
    ssc.enableTranslate = false;
    ssc.enableZoom = false;
    ssc.enableTilt = false;
    ssc.enableLook = false;

    viewer.requestRenderMode = false;  // 持续渲染
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);

    // ============================================================
    // 直接 Model 图元(替代 Entity + CallbackProperty)
    // ============================================================

    // disposed 标志:防止异步 Model 加载完成后被添加到已销毁的 viewer
    let disposed = false;

    // ---- TREA-01 Model ----
    const treaModelUri = baseUrl + '/models/calipso-decoded.glb';
    let treaModel: CesiumType.Model | null = null;
    Cesium.Model.fromGltfAsync({
      url: treaModelUri,
      scale: TREA_MODEL_SCALE,
      minimumPixelSize: 0,
    })
      .then((model: CesiumType.Model) => {
        if (disposed || viewer.isDestroyed()) { model.destroy(); return; }
        model.show = true;
        viewer.scene.primitives.add(model);
        treaModel = model;
        console.warn('[cockpit] TREA-01 model loaded');
      })
      .catch((e: unknown) => {
        console.warn('[useChaseViewer] TREA-01 model load failed:', e);
      });

    // ---- 交通卫星 Models ----
    const trafficSats = trafficSatsRef.current;
    const trafficModels: (CesiumType.Model | null)[] = trafficSats.map(() => null);
    trafficSats.forEach((ts, i) => {
      const modelUri = baseUrl + `/models/${ts.config.model}.glb`;
      const modelScale = TRAFFIC_MODEL_SCALE[ts.config.model] ?? 5;
      Cesium.Model.fromGltfAsync({
        url: modelUri,
        scale: modelScale,
        minimumPixelSize: TRAFFIC_MODEL_MIN_PIXEL,
        // 关闭深度测试:与标签(disableDepthTestDistance=Infinity)行为一致,
        // 保证卫星飞行过程中即使越过地球边缘/被遮挡,模型也始终可见(不消失)。
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      })
        .then((model: CesiumType.Model) => {
          if (disposed || viewer.isDestroyed()) { model.destroy(); return; }
          model.show = false;
          model.color = Cesium.Color.fromCssColorString(ts.config.color).withAlpha(0.85);
          model.colorBlendMode = Cesium.ColorBlendMode.MIX;
          model.colorBlendAmount = 0.12;
          viewer.scene.primitives.add(model);
          trafficModels[i] = model;
          console.warn('[cockpit] traffic model', i, ts.config.name, 'loaded');
        })
        .catch((e: unknown) => {
          console.warn(`[useChaseViewer] traffic model ${i} load failed:`, e);
        });
    });

    // ---- 标签(LabelCollection,直接 position 无 CallbackProperty) ----
    const labelCollection = viewer.scene.primitives.add(new Cesium.LabelCollection());
    const trafficLabels: CesiumType.Label[] = trafficSats.map((ts) => {
      return labelCollection.add({
        text: ts.config.name,
        font: '12px "Microsoft YaHei", sans-serif',
        fillColor: Cesium.Color.fromCssColorString(ts.config.color),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -40),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        showBackground: true,
        backgroundColor: new Cesium.Color(0, 0, 0, 0.7),
        backgroundPadding: new Cesium.Cartesian2(6, 3),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        show: false,
      });
    });
    // 每个标签独立的 position 对象(避免互相覆盖)
    const trafficLabelPositions: CesiumType.Cartesian3[] = trafficSats.map(
      () => new Cesium.Cartesian3(0, 0, 0),
    );

    // ---- 交通卫星兜底光点(PointPrimitive):仅当 3D 模型未加载/加载失败时显示 ----
    // 用户反馈:某些情况下只出现交通卫星标签而无 3D 模型。
    // 根因:模型为异步加载(trafficModels[i] 可能仍为 null),卫星进入视野时模型未就绪。
    // 用光点兜底保证卫星始终有可见实体;模型加载成功后自动隐藏光点。
    const pointCollection = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
    const trafficPoints: CesiumType.PointPrimitive[] = trafficSats.map((ts) => {
      return pointCollection.add({
        position: new Cesium.Cartesian3(0, 0, 0),
        pixelSize: 8,
        color: Cesium.Color.fromCssColorString(ts.config.color),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        show: false,
      });
    });
    // 每个光点独立的 position 对象(避免共引用互相覆盖)
    const trafficPointPositions: CesiumType.Cartesian3[] = trafficSats.map(
      () => new Cesium.Cartesian3(0, 0, 0),
    );
    trafficPoints.forEach((p, i) => { p.position = trafficPointPositions[i]; });

    // ============================================================
    // preUpdate:每帧更新 modelMatrix + 相机 + 调度
    // ============================================================
    const Cartesian3 = Cesium.Cartesian3;
    const Matrix3 = Cesium.Matrix3;
    const Matrix4 = Cesium.Matrix4;
    const HPR = Cesium.HeadingPitchRoll;
    const Transforms = Cesium.Transforms;
    const Quaternion = Cesium.Quaternion;
    const Ellipsoid = Cesium.Ellipsoid;

    // 复用临时对象(避免每帧 GC)
    const _satPos = new Cartesian3();
    const _camPos = new Cartesian3();
    const _target = new Cartesian3();
    const _dir = new Cartesian3();
    const _up = new Cartesian3();
    const _hpr = new HPR(0, 0, 0);
    const _treaQuat = new Quaternion(0, 0, 0, 1);
    const _treaRotMat = new Matrix3();
    const _treaModelMat = new Matrix4();
    // 每颗交通卫星独立的 scratch 对象(避免并发显示时共享引用互相覆盖,
    // 导致先处理的卫星模型被移到别的位置而"消失"— 标签用独立位置对象不受影响)
    const _trafficHpr = new HPR(0, 0, 0);
    const _trafficQuat: Quaternion[] = trafficSats.map(() => new Quaternion(0, 0, 0, 1));
    const _trafficRotMat: Matrix3[] = trafficSats.map(() => new Matrix3());
    const _trafficModelMat: Matrix4[] = trafficSats.map(() => new Matrix4());
    const _trafficPos: Cartesian3[] = trafficSats.map(() => new Cartesian3());

    // 交通卫星调度缓存
    const _trafficDist: number[] = [];
    const _trafficVisible: boolean[] = [];
    const _trafficShowState: boolean[] = trafficSats.map(() => false);
    // Round-robin 调度索引:每次调度后递增,确保每次选不同的卫星
    let _nextPickIdx = 0;

    // 调试日志
    const _dbgFrameCount = { count: 0 };
    const _dbgFirstFrame = { done: false };

    const removePreUpdate = viewer.scene.preUpdate.addEventListener(() => {
      const treaSatrec = treaSatrecRef.current;
      if (!treaSatrec) return;
      const t = useTimeStore.getState().currentTime;
      const isPlaying = useTimeStore.getState().isPlaying;
      const rate = useTimeStore.getState().rate;

      // 同步 Cesium 时钟到仿真时间
      viewer.clock.currentTime = Cesium.JulianDate.fromDate(t);

      // ---- TREA-01 位置(当前+未来求速度) ----
      const ecf = propagateEcfKm(treaSatrec, t);
      if (!ecf) return;
      const ecfFuture = propagateEcfKm(treaSatrec, new Date(t.getTime() + 1000));
      if (!ecfFuture) return;

      _dbgFrameCount.count++;
      if (!_dbgFirstFrame.done) {
        _dbgFirstFrame.done = true;
        console.warn('[cockpit] preUpdate 首帧 t=', t.toISOString(), 'isPlaying=', isPlaying, 'rate=', rate, 'pos(km)=', ecf.x.toFixed(1), ecf.y.toFixed(1), ecf.z.toFixed(1));
      }

      // ECEF 米制
      _satPos.x = ecf.x * 1000;
      _satPos.y = ecf.y * 1000;
      _satPos.z = ecf.z * 1000;

      // 速度方向
      const vx = ecfFuture.x - ecf.x;
      const vy = ecfFuture.y - ecf.y;
      const vz = ecfFuture.z - ecf.z;
      const vlen = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
      const vEx = vx / vlen, vEy = vy / vlen, vEz = vz / vlen;

      // 径向 up = normalize(satPos)
      const sLen = Math.sqrt(_satPos.x ** 2 + _satPos.y ** 2 + _satPos.z ** 2) || 1;
      const upRx = _satPos.x / sLen, upRy = _satPos.y / sLen, upRz = _satPos.z / sLen;

      // ---- 飞行方向控制:横向偏移(视觉层,不改真实轨道) ----
      // lerp 当前偏移 → 目标偏移(平滑过渡)
      lateralOffsetRef.current +=
        (lateralTargetRef.current - lateralOffsetRef.current) * LATERAL_LERP;
      const latOff = lateralOffsetRef.current;
      // cross-track 方向 = cross(v, up):飞行方向的右侧(始终计算,喷火效果也需要)
      const cx = vEy * upRz - vEz * upRy;
      const cy = vEz * upRx - vEx * upRz;
      const cz = vEx * upRy - vEy * upRx;
      const cLen = Math.sqrt(cx * cx + cy * cy + cz * cz) || 1;
      const cxN = cx / cLen, cyN = cy / cLen, czN = cz / cLen;
      // 卫星位置 += crossTrackDir * latOff(正=右偏,负=左偏)
      if (Math.abs(latOff) > 0.1) {
        _satPos.x += cxN * latOff;
        _satPos.y += cyN * latOff;
        _satPos.z += czN * latOff;
      }
      // 滚转角:偏移量比例映射到 ±10°(偏右→右倾,偏左→左倾)
      const rollRad = Math.max(-MAX_ROLL_RAD,
        Math.min(MAX_ROLL_RAD, (latOff / LATERAL_MAX_M) * MAX_ROLL_RAD));

      // ENU 基
      const eMag = Math.sqrt(upRy * upRy + upRx * upRx) || 1;
      const eEx = -upRy / eMag, eEy = upRx / eMag;
      const eNx = (-upRz * upRx) / eMag;
      const eNy = (-upRz * upRy) / eMag;
      const eNz = eMag;
      const ve = vEx * eEx + vEy * eEy;
      const vn = vEx * eNx + vEy * eNy + vEz * eNz;
      const heading = Math.atan2(ve, vn);

      // ---- 更新 TREA-01 modelMatrix(每帧原子更新,无 CallbackProperty) ----
      if (treaModel) {
        _hpr.heading = heading + TREA_YAW_OFFSET_RAD;
        _hpr.pitch = TREA_PITCH_RAD;
        _hpr.roll = TREA_ROLL_RAD + rollRad;  // 基础 roll + 飞行方向偏转
        // headingPitchRollQuaternion: ENU + HPR → 世界坐标系四元数
        Transforms.headingPitchRollQuaternion(
          _satPos, _hpr, Ellipsoid.WGS84, undefined, _treaQuat,
        );
        // 四元数 → 旋转矩阵 → 模型矩阵(旋转+平移)
        Matrix3.fromQuaternion(_treaQuat, _treaRotMat);
        Matrix4.fromRotationTranslation(_treaRotMat, _satPos, _treaModelMat);
        treaModel.modelMatrix = _treaModelMat;
      }

      // ---- 相机位置:satPos - velDir*BACK*zoom + upRad*UP*zoom ----
      const zoom = zoomRef.current;
      const back = CHASE_BACK_M * zoom;
      const upOff = CHASE_UP_M * zoom;
      _camPos.x = _satPos.x - vEx * back + upRx * upOff;
      _camPos.y = _satPos.y - vEy * back + upRy * upOff;
      _camPos.z = _satPos.z - vEz * back + upRz * upOff;

      // 视线瞄准点:satPos + velDir*LOOK_AHEAD
      _target.x = _satPos.x + vEx * LOOK_AHEAD_M;
      _target.y = _satPos.y + vEy * LOOK_AHEAD_M;
      _target.z = _satPos.z + vEz * LOOK_AHEAD_M;

      _dir.x = _target.x - _camPos.x;
      _dir.y = _target.y - _camPos.y;
      _dir.z = _target.z - _camPos.z;
      const dLen = Math.sqrt(_dir.x ** 2 + _dir.y ** 2 + _dir.z ** 2) || 1;
      _dir.x /= dLen; _dir.y /= dLen; _dir.z /= dLen;

      // up 正交化
      const dot = upRx * _dir.x + upRy * _dir.y + upRz * _dir.z;
      _up.x = upRx - dot * _dir.x;
      _up.y = upRy - dot * _dir.y;
      _up.z = upRz - dot * _dir.z;
      const uLen = Math.sqrt(_up.x ** 2 + _up.y ** 2 + _up.z ** 2) || 1;
      _up.x /= uLen; _up.y /= uLen; _up.z /= uLen;

      viewer.camera.setView({
        destination: _camPos,
        orientation: { direction: _dir, up: _up },
      });

      // ============================================================
      // 交通卫星:传播 + 距离判定 + modelMatrix 更新 + 显示切换
      // ============================================================
      const trafficSatsNow = trafficSatsRef.current;
      let inTransitCount = 0;

      for (let i = 0; i < trafficSatsNow.length; i++) {
        const ts = trafficSatsNow[i];
        const model = trafficModels[i];
        const tEcf = propagateEcfKm(ts.satrec, t);

        // 统计在途数(到达时间在未来)
        if (ts.nextArrivalSim > t.getTime()) inTransitCount++;

        if (!tEcf) {
          if (model) model.show = false;
          if (trafficPoints[i]) trafficPoints[i].show = false;
          if (trafficLabels[i]) trafficLabels[i].show = false;
          _trafficShowState[i] = false;
          _trafficDist[i] = Number.POSITIVE_INFINITY;
          _trafficVisible[i] = false;
          continue;
        }

        const dist = distanceKm(ecf, tEcf);
        // 仅显示已调度的卫星(nextArrivalSim > 0),未调度的卫星(nextArrivalSim=0)不显示
        // 距离判定(滞后:已显示→55km才隐藏;未显示→50km才显示)
        // 不做时间限制:卫星在屏幕中飞行期间保持显示,只按轨迹飞出(超过 55km)后消失
        const visible = ts.nextArrivalSim > 0 && (
          _trafficShowState[i]
            ? dist < TRAFFIC_HIDE_DISTANCE_KM
            : dist < TRAFFIC_SHOW_DISTANCE_KM
        );

        _trafficDist[i] = dist;
        _trafficVisible[i] = visible;
        _trafficShowState[i] = visible;

        // 直接显示/隐藏:进入显示区立即完全可见,飞出显示区立即隐藏。
        // 不做透明度过渡,保证卫星在屏幕中飞行期间始终清晰可见(不随时间变淡)。
        //
        // 可见实体:优先 3D 模型;若模型未加载/加载失败(trafficModels[i] 为 null),
        // 用 PointPrimitive 光点兜底,保证卫星始终有可见实体(仅标签可见是 bug)。
        if (visible) {
          const tPos = _trafficPos[i];
          tPos.x = tEcf.x * 1000;
          tPos.y = tEcf.y * 1000;
          tPos.z = tEcf.z * 1000;

          if (model) {
            // 朝地心姿态(pitch=-90°)
            _trafficHpr.heading = 0;
            _trafficHpr.pitch = Cesium.Math.toRadians(-90);
            _trafficHpr.roll = 0;
            Transforms.headingPitchRollQuaternion(
              tPos, _trafficHpr, Ellipsoid.WGS84, undefined, _trafficQuat[i],
            );
            Matrix3.fromQuaternion(_trafficQuat[i], _trafficRotMat[i]);
            Matrix4.fromRotationTranslation(_trafficRotMat[i], tPos, _trafficModelMat[i]);
            model.modelMatrix = _trafficModelMat[i];
            model.show = true;
            // 模型已加载:隐藏光点(避免光点绘制在 3D 模型之上)
            if (trafficPoints[i]) trafficPoints[i].show = false;
          } else if (trafficPoints[i]) {
            // 模型未加载:光点兜底,保证卫星可见
            const pp = trafficPointPositions[i];
            pp.x = tPos.x;
            pp.y = tPos.y;
            pp.z = tPos.z;
            trafficPoints[i].show = true;
          }

          // 标签位置 + 文字
          const label = trafficLabels[i];
          if (label) {
            const lp = trafficLabelPositions[i];
            lp.x = tPos.x;
            lp.y = tPos.y;
            lp.z = tPos.z;
            label.position = lp;
            label.text = `${ts.config.name} · ${dist.toFixed(1)} km`;
            label.show = true;
          }
        } else {
          if (model) model.show = false;
          if (trafficPoints[i]) trafficPoints[i].show = false;
          if (trafficLabels[i]) trafficLabels[i].show = false;
        }
      }

      // ============================================================
      // 脚本化交汇调度(支持多卫星同时在途)
      // ============================================================
      const nowSim = t.getTime();
      const treaTleNow = treaTleRef.current;

      // 调度诊断日志(每 120 帧)
      if (_dbgFrameCount.count % 120 === 0) {
        const dists = _trafficDist.map((d, i) =>
          `${trafficSatsNow[i].config.name}=${d < 1e6 ? d.toFixed(0) + 'km' : 'far'}${_trafficVisible[i] ? '(vis)' : ''}`,
        ).join(' ');
        console.warn('[cockpit] 调度诊断 nowSim=', nowSim, 'nextSchedule=', nextScheduleSimRef.current, 'inTransit=', inTransitCount, 'isFirst=', isFirstScheduleRef.current, '| dists:', dists);
      }

      if (treaTleNow && nowSim >= nextScheduleSimRef.current) {
        // 并发调度:只要屏幕上可见卫星数未达上限,即使已有卫星在飞行,也可调度新卫星
        // (新卫星不影响已有卫星的轨迹与显示,各自独立飞行)
        const visibleCount = _trafficVisible.filter((v) => v).length;
        if (visibleCount < MAX_CONCURRENT_VISIBLE) {
          // Round-robin: 从上次调度的下一个开始找,确保每次选不同的卫星
          for (let j = 0; j < trafficSatsNow.length; j++) {
            const i = (_nextPickIdx + j) % trafficSatsNow.length;
            const ts = trafficSatsNow[i];
            if (_trafficVisible[i]) continue;                       // 正在屏幕中飞行 → 不打断
            if (ts.nextArrivalSim > nowSim) continue;               // 已在途 → 跳过
            // 冷却检查(到达时间在过去,且未过冷却)
            if (ts.nextArrivalSim > 0 &&
                (nowSim - ts.nextArrivalSim) < TRAFFIC_COOLDOWN_SIM_MS) continue;

            // LEAD:首次用 FIRST_LEAD;后续用 RESCHEDULE_LEAD
            const leadMs = isFirstScheduleRef.current
              ? TRAFFIC_FIRST_LEAD_SIM_MS
              : TRAFFIC_RESCHEDULE_LEAD_SIM_MS;

            // 沿迹偏移:按索引奇偶交替,并发两颗卫星沿迹距离明显错开(+15/+38)
            // RAAN 偏移:按索引奇偶交替(±0.18°),使两颗并发卫星处于稍不同轨道面,
            //   产生横向(侧向)分离,不落在 TREA-01 正前方同一直线上。
            const aheadKm = i % 2 === 0 ? TRAFFIC_AHEAD_EVEN_KM : TRAFFIC_AHEAD_ODD_KM;
            const raanOffsetDeg = i % 2 === 0 ? TRAFFIC_RAAN_OFFSET_DEG : -TRAFFIC_RAAN_OFFSET_DEG;

            const tArrival = new Date(nowSim + leadMs);
            rephaseTrafficSat(treaTleNow, ts, tArrival, aheadKm, raanOffsetDeg);
            _nextPickIdx = (i + 1) % trafficSatsNow.length;  // 下次从下一个开始
            console.warn('[cockpit] ★调度 pickIdx=', i, 'name=', ts.config.name,
              'tArrival=', tArrival.toISOString(), 'leadMs=', leadMs,
              'aheadKm=', aheadKm, 'isFirst=', isFirstScheduleRef.current, 'rate=', rate);
            break;  // 分批调度:每次只调度1颗,错开出现时间
          }
        }

        isFirstScheduleRef.current = false;
        nextScheduleSimRef.current = nowSim + SCHEDULE_CHECK_INTERVAL_SIM_MS;
      }
    });

    // ---- 滚轮缩放 ----
    const canvas = viewer.scene.canvas as HTMLCanvasElement;
    const wheelListener = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const factor = e.deltaY > 0 ? 1.12 : 0.89;
      zoomRef.current = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomRef.current * factor));
    };
    canvas.addEventListener('wheel', wheelListener, { capture: true, passive: false });
    const removeWheel = () =>
      canvas.removeEventListener('wheel', wheelListener, { capture: true } as EventListenerOptions);

    // ---- 键盘左右键:飞行方向控制 ----
    const keydownListener = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        lateralTargetRef.current = -LATERAL_MAX_M;
        e.preventDefault();
      } else if (e.key === 'ArrowRight') {
        lateralTargetRef.current = LATERAL_MAX_M;
        e.preventDefault();
      }
    };
    const keyupListener = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        lateralTargetRef.current = 0;
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', keydownListener);
    window.addEventListener('keyup', keyupListener);
    const removeKeydown = () => window.removeEventListener('keydown', keydownListener);
    const removeKeyup = () => window.removeEventListener('keyup', keyupListener);

    return {
      viewer,
      removePreUpdate,
      removeWheel,
      removeKeydown,
      removeKeyup,
      dispose: () => { disposed = true; },
    };
  }, []);

  // ============================================================
  // 挂载/卸载
  // ============================================================
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (instRef.current) return;

    let inst: ChaseInstance | null = null;
    try {
      inst = initCesium(container);
      instRef.current = inst;
      setReady(true);
    } catch (err) {
      console.error('[useChaseViewer] Init failed:', err);
      setLoadError(err instanceof Error ? err.message : String(err));
      initializedRef.current = false;
      return;
    }

    return () => {
      instRef.current = null;
      initializedRef.current = false;
      setReady(false);
      if (inst) {
        try {
          inst.dispose();
          inst.removePreUpdate();
          inst.removeWheel();
          inst.removeKeydown();
          inst.removeKeyup();
          if (!inst.viewer.isDestroyed()) inst.viewer.destroy();
        } catch (e) {
          console.warn('[useChaseViewer] Cleanup error:', e);
        }
      }
    };
  }, [initCesium]);

  return { containerRef, ready, loadError, setDirection };
}
