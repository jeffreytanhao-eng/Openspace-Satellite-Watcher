# Graph Report - 开发区  (2026-08-05)

## Corpus Check
- 126 files · ~750,859 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1029 nodes · 1817 edges · 82 communities (52 shown, 30 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `21576725`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_应用布局与样式|应用布局与样式]]
- [[_COMMUNITY_主页面与可视化组件|主页面与可视化组件]]
- [[_COMMUNITY_TREA 访问窗口测试|TREA 访问窗口测试]]
- [[_COMMUNITY_README 核心概念|README 核心概念]]
- [[_COMMUNITY_星座批量导入|星座批量导入]]
- [[_COMMUNITY_Draco 解码器 WASM|Draco 解码器 WASM]]
- [[_COMMUNITY_AI 规划 API 与模态框|AI 规划 API 与模态框]]
- [[_COMMUNITY_Draco WASM 包装器|Draco WASM 包装器]]
- [[_COMMUNITY_任务遥测 UI|任务遥测 UI]]
- [[_COMMUNITY_README 文档结构|README 文档结构]]
- [[_COMMUNITY_变轨控制与计算|变轨控制与计算]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_UI 组件配置|UI 组件配置]]
- [[_COMMUNITY_TypeScript 配置|TypeScript 配置]]
- [[_COMMUNITY_依赖包配置|依赖包配置]]
- [[_COMMUNITY_Draco 解码器类|Draco 解码器类]]
- [[_COMMUNITY_轨道计算 Worker|轨道计算 Worker]]
- [[_COMMUNITY_安全与 TLE 解析|安全与 TLE 解析]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]

## God Nodes (most connected - your core abstractions)
1. `useTreaMissionStore` - 47 edges
2. `cn()` - 25 edges
3. `useTimeStore` - 22 edges
4. `getCache()` - 21 edges
5. `createSatrec()` - 19 edges
6. `TLEData` - 19 edges
7. `useSatelliteStore` - 19 edges
8. `x()` - 18 edges
9. `SpaceObject` - 18 edges
10. `compilerOptions` - 17 edges

## Surprising Connections (you probably didn't know these)
- `formatTime()` --calls--> `pad()`  [INFERRED]
  src/components/trea/TaskListPanel.tsx → scripts/test-trea-access.ts
- `importConstellation()` --calls--> `parseEpoch()`  [INFERRED]
  src/lib/constellation-import.ts → src/lib/default-satellites.ts
- `SatelliteDetailPanelProps` --references--> `SpaceObject`  [EXTRACTED]
  src/components/ui/SatelliteDetailPanel.tsx → src/store/satelliteStore.ts
- `SatelliteListProps` --references--> `SpaceObject`  [EXTRACTED]
  src/components/ui/SatelliteList.tsx → src/store/satelliteStore.ts
- `MissionReportModalProps` --references--> `MissionReport`  [EXTRACTED]
  src/components/trea/MissionReportModal.tsx → src/lib/trea/report.ts

## Hyperedges (group relationships)
- **TREA-01 任务仿真闭环主流程** — readme_mission_planning, readme_ai_planning, readme_orbit_visualization, readme_imaging_simulation, readme_mission_report, readme_cinematic_playback [EXTRACTED 1.00]
- **2D/3D 双视角可视化引擎技术栈** — readme_visualization_engine, readme_cesiumjs, readme_maplibre, readme_satellite_js, readme_east_asia_view [EXTRACTED 1.00]
- **AI 辅助任务规划链路 (轨道力学 + 光学遥感约束 + LLM)** — readme_ai_planning, readme_llm_doubao, readme_mission_planning, readme_aoi [EXTRACTED 1.00]
- **TREA-01 Mission Simulation Stack** — trea-mission-store, cesium-globe-component, telemetry-dashboard-component, collision-alert-modal, homepage-component [INFERRED 0.95]
- **Chase Cockpit Independent Architecture** — use-chase-viewer-hook, traffic-sats-lib, chase-cockpit-component, telemetry-dashboard-component, img-black-marble [INFERRED 0.90]
- **Docker Compose Deployment Architecture** — deployment-concept, docker-compose-config, deploy-script, deploy-readme-doc [INFERRED 0.95]

## Communities (82 total, 30 thin omitted)

### Community 0 - "应用布局与样式"
Cohesion: 0.05
Nodes (70): useCesium(), CinematicActions, CinematicState, useCinematicStore, CollisionAlert, CollisionAvoidancePlan, computeOrbitParams(), computeTelemetry() (+62 more)

### Community 1 - "主页面与可视化组件"
Cohesion: 0.05
Nodes (61): calculateSatellitePosition(), generateOrbitPoints(), generateOrbitPointsECEF(), isValidRadius(), CesiumInstance, CesiumNS, getCesium(), MapLibreInstance (+53 more)

### Community 2 - "TREA 访问窗口测试"
Cohesion: 0.09
Nodes (33): inter, metadata, RootLayout(), ChaseCockpit(), TimeControl, useChaseViewer(), cn(), formatDateTime() (+25 more)

### Community 3 - "README 核心概念"
Cohesion: 0.09
Nodes (24): FETCH_HEADERS, importConstellation(), ImportOptions, ImportResult, inferObjectTypeFromName(), isConstellationSeeded(), SavedSatellite, CelestrakQueryType (+16 more)

### Community 4 - "星座批量导入"
Cohesion: 1.00
Nodes (3): AvoidanceVideoModal, CollisionAlertModal, treaMissionStore

### Community 5 - "Draco 解码器 WASM"
Cohesion: 0.07
Nodes (37): CesiumNS, createEarthImageryProvider(), buildTleFromElements(), createTrafficSats(), distanceKm(), EcefVec, L2_MA, L2_MM (+29 more)

### Community 7 - "Draco WASM 包装器"
Cohesion: 0.26
Nodes (13): TreaMissionActions, TreaMissionState, AttitudeMode, MissionPhase, PayloadStatus, CONCLUSION_TEMPLATES, ConclusionContext, escapeXml() (+5 more)

### Community 8 - "任务遥测 UI"
Cohesion: 0.06
Nodes (31): 1. 配置 DNS, 2. SSH 登录服务器并装 Docker（如未装）, 3. 拉取代码, 4. 配置环境变量, 5. 一键部署, 6. 验证, code:block1 (┌───────────┐ :80/:443), code:bash (# 本地构建) (+23 more)

### Community 10 - "变轨控制与计算"
Cohesion: 0.16
Nodes (26): A(), B(), ba(), C(), D(), E(), f(), G() (+18 more)

### Community 11 - "Community 11"
Cohesion: 0.06
Nodes (33): API 服务, code:block1 (src/), code:block2 (┌─────────────┐    HTTPS     ┌──────────────────────────┐   ), code:block3 (┌─────────────┐    HTTPS     ┌───────────┐  反代  ┌───────────), code:bash (# 1. 安装依赖), code:bash (# 克隆代码), code:bash (git pull), Docker Compose 自托管 (+25 more)

### Community 12 - "UI 组件配置"
Cohesion: 0.13
Nodes (11): Button(), buttonVariants, ImportedSatellite, ImportFailure, ImportModalProps, ImportMode, ImportResult, ImportSummary (+3 more)

### Community 13 - "TypeScript 配置"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 14 - "依赖包配置"
Cohesion: 0.10
Nodes (20): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+12 more)

### Community 15 - "Draco 解码器类"
Cohesion: 0.17
Nodes (16): aoiToBBox(), BoundingBox, computeAccessWindows(), computeAccessWindowsForAois(), computeElevation(), computeFootprint(), Footprint, GeoPoint (+8 more)

### Community 16 - "轨道计算 Worker"
Cohesion: 0.15
Nodes (15): COUNTRY_KEYWORD_MAP, COUNTRY_TRANSLATIONS, OBJECT_TYPE_TRANSLATIONS, SATELLITE_NAME_TRANSLATIONS, translateCountry(), translateObjectType(), translateSatelliteName(), calculateOrbitParams() (+7 more)

### Community 17 - "安全与 TLE 解析"
Cohesion: 0.10
Nodes (20): dependencies, @base-ui/react, cesium, @cesium/engine, class-variance-authority, clsx, critters, @google/model-viewer (+12 more)

### Community 18 - "Community 18"
Cohesion: 0.10
Nodes (20): AttributeOctahedronTransform(), AttributeQuantizationTransform(), AttributeTransformData(), Decoder(), DecoderBuffer(), destroy(), DracoFloat32Array(), DracoInt16Array() (+12 more)

### Community 19 - "Community 19"
Cohesion: 0.11
Nodes (24): buildMockOutput(), extractJson(), isRetryableConnectError(), LlmErrorResponse, LlmSuccessResponse, normalizeOutput(), POST(), validateConfig() (+16 more)

### Community 20 - "Community 20"
Cohesion: 0.10
Nodes (18): aoiAPolygon, batchMap, bboxA, elevHorizon, elevOverhead, fp, largeAoi, nextLarge (+10 more)

### Community 21 - "Community 21"
Cohesion: 0.15
Nodes (15): timingSafeEqualHash(), verifyPassword(), fetchOne(), ParsedTLE, parseEpoch(), parseSingleTLE(), checkRateLimit(), config (+7 more)

### Community 22 - "Community 22"
Cohesion: 0.12
Nodes (15): cache, cachedEntry, CacheEntry, calculateOrbit(), ecfToGeographic(), eciToEcf(), OrbitParams, OrbitPoint (+7 more)

### Community 23 - "Community 23"
Cohesion: 0.21
Nodes (5): ApiClient, ApiResponse, fetchSpaceObjects(), fetchTags(), TagData

### Community 24 - "Community 24"
Cohesion: 0.12
Nodes (16): devDependencies, autoprefixer, css-loader, draco3d, file-loader, @gltf-transform/extensions, @gltf-transform/functions, postcss (+8 more)

### Community 25 - "Community 25"
Cohesion: 0.12
Nodes (15): compilerOptions, esModuleInterop, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+7 more)

### Community 26 - "Community 26"
Cohesion: 0.25
Nodes (14): AlongTrackDeltaVResult, applyManeuver(), circularOrbitVelocity(), computeAlongTrackDeltaV(), computeTleChecksum(), estimateFuelCost(), formatTleEpoch(), ManeuverDirection (+6 more)

### Community 27 - "Community 27"
Cohesion: 0.14
Nodes (13): binChunkLength, binChunkType, buf, dryRun, gltf, jsonChunkLength, jsonChunkType, jsonStr (+5 more)

### Community 28 - "Community 28"
Cohesion: 0.28
Nodes (13): generateMissionTle(), GenerateMissionTleOptions, generateMissionTleOrFallback(), GenerateMissionTleResult, normalize360(), getGmst(), computeTleChecksum(), formatAngleField8() (+5 more)

### Community 31 - "Community 31"
Cohesion: 0.18
Nodes (10): buf, chunkLength, dir, exists, files, fullPath, gltf, jsonData (+2 more)

### Community 32 - "Community 32"
Cohesion: 0.22
Nodes (9): scripts, build, db:push, db:seed, dev, lint, postinstall, seed (+1 more)

### Community 33 - "Community 33"
Cohesion: 0.31
Nodes (7): args, BACKUP_DIR, compressFile(), createIO(), formatBytes(), main(), MODELS_DIR

### Community 34 - "Community 34"
Cohesion: 0.22
Nodes (8): doFix, hasTexCoord, io, material, meshes, primitives, semantics, texSemantics

### Community 35 - "Community 35"
Cohesion: 0.22
Nodes (8): buf, chunkLength, chunkType, gltf, jsonData, length, magic, version

### Community 36 - "Community 36"
Cohesion: 0.22
Nodes (8): buf, diag, gltf, jsonChunkLength, jsonData, name, scales, sizes

### Community 37 - "Community 37"
Cohesion: 0.22
Nodes (8): functions, src/app/api/admin/upload-image/route, src/app/api/sync/route, regions, maxDuration, memory, maxDuration, memory

### Community 38 - "Community 38"
Cohesion: 0.18
Nodes (14): CesiumGlobe, HomePage(), MapLibreMap, normalizeSatellite(), PasswordModal(), buildSatellitesFromTLE(), parseEpoch(), parseTLETextClient() (+6 more)

### Community 39 - "Community 39"
Cohesion: 0.25
Nodes (7): license, name, prisma, seed, private, type, version

### Community 40 - "Community 40"
Cohesion: 0.25
Nodes (8): abort(), assert(), getBinary(), getBinaryPromise(), intArrayFromBase64(), isDataURI(), isFileURI(), tryParseAsDataURI()

### Community 41 - "Community 41"
Cohesion: 0.29
Nodes (7): addOnPostRun(), addOnPreRun(), callRuntimeCallbacks(), initRuntime(), postRun(), preRun(), run()

### Community 42 - "Community 42"
Cohesion: 0.29
Nodes (6): dracoExtension, ext, io, ioSave, root, verifyIo

### Community 44 - "Community 44"
Cohesion: 0.33
Nodes (6): Orbit Parameters (Perigee/Apogee/Period/Eccentricity), SGP4/SDP4 Orbit Calculator (satellite.js), Orbit Computation Cache, SpaceObject Type, Zustand Satellite Store, Time Playback Store (requestAnimationFrame)

### Community 46 - "Community 46"
Cohesion: 0.40
Nodes (4): ext, readIo, root, writeIo

### Community 47 - "Community 47"
Cohesion: 0.20
Nodes (14): defaultSatellites, OrbitCacheEntry, SatelliteStoreActions, SatelliteStoreState, TimeState, TLEData, useOrbitCache(), useSatelliteError() (+6 more)

### Community 48 - "Community 48"
Cohesion: 0.50
Nodes (4): c(), l(), ma(), p()

### Community 49 - "Community 49"
Cohesion: 0.50
Nodes (4): emscripten_realloc_buffer(), _emscripten_resize_heap(), getHeapMax(), updateMemoryViews()

### Community 50 - "Community 50"
Cohesion: 0.50
Nodes (4): ensureString(), intArrayFromString(), lengthBytesUTF8(), stringToUTF8Array()

### Community 51 - "Community 51"
Cohesion: 0.50
Nodes (4): _fd_write(), printChar(), UTF8ArrayToString(), UTF8ToString()

### Community 65 - "Community 65"
Cohesion: 0.20
Nodes (11): ATTITUDE_LABELS, coverageColor(), formatDateTime(), formatLat(), formatLon(), fuelColor(), MetaItemProps, MissionReportModal() (+3 more)

### Community 74 - "Community 74"
Cohesion: 0.24
Nodes (12): fmt(), pad(), AccessWindow, findNextWindow(), AoiSection(), AoiSectionProps, elevationColor(), formatDuration() (+4 more)

### Community 79 - "Community 79"
Cohesion: 0.25
Nodes (7): AOI_A, AOI_B, AoiPolygonVertex, ATTITUDE_INITIAL, getTrea01InitialState(), PAYLOAD_INITIAL, Trea01InitialState

### Community 80 - "Community 80"
Cohesion: 0.47
Nodes (4): FullscreenButton(), FullscreenDocument, FullscreenElement, useFullscreen()

## Knowledge Gaps
- **390 isolated node(s):** `LlmErrorResponse`, `TimeControl`, `PAYLOAD_DISPLAY`, `ATTITUDE_LABELS`, `CardProps` (+385 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **30 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `TLEData` connect `主页面与可视化组件` to `应用布局与样式`, `Draco 解码器 WASM`, `Community 38`, `Draco 解码器类`, `Community 79`, `Community 19`, `Community 26`, `Community 28`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Why does `Button()` connect `UI 组件配置` to `应用布局与样式`, `Community 65`, `TREA 访问窗口测试`, `Community 38`, `Community 74`, `轨道计算 Worker`, `Community 19`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Why does `createSatrec()` connect `主页面与可视化组件` to `应用布局与样式`, `Draco 解码器 WASM`, `Community 38`, `Draco 解码器类`, `轨道计算 Worker`, `Community 26`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **What connects `LlmErrorResponse`, `TimeControl`, `PAYLOAD_DISPLAY` to the rest of the system?**
  _390 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `应用布局与样式` be split into smaller, more focused modules?**
  _Cohesion score 0.054385964912280704 - nodes in this community are weakly interconnected._
- **Should `主页面与可视化组件` be split into smaller, more focused modules?**
  _Cohesion score 0.053613053613053616 - nodes in this community are weakly interconnected._
- **Should `TREA 访问窗口测试` be split into smaller, more focused modules?**
  _Cohesion score 0.09292929292929293 - nodes in this community are weakly interconnected._