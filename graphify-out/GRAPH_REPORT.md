# Graph Report - .  (2026-08-04)

## Corpus Check
- 158 files · ~772,514 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1068 nodes · 1906 edges · 74 communities (51 shown, 23 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_TREA Mission UI Components|TREA Mission UI Components]]
- [[_COMMUNITY_Cesium Core & Positions|Cesium Core & Positions]]
- [[_COMMUNITY_Chase Cockpit Architecture|Chase Cockpit Architecture]]
- [[_COMMUNITY_Constellation Import System|Constellation Import System]]
- [[_COMMUNITY_Semantic Concepts & Architecture|Semantic Concepts & Architecture]]
- [[_COMMUNITY_Traffic Satellite Scheduling|Traffic Satellite Scheduling]]
- [[_COMMUNITY_README Feature Documentation|README Feature Documentation]]
- [[_COMMUNITY_TREA Mission State & Report|TREA Mission State & Report]]
- [[_COMMUNITY_Deployment Documentation|Deployment Documentation]]
- [[_COMMUNITY_Draco Decoder Library|Draco Decoder Library]]
- [[_COMMUNITY_Draco WASM Wrapper|Draco WASM Wrapper]]
- [[_COMMUNITY_Project README Overview|Project README Overview]]
- [[_COMMUNITY_UI Component Library|UI Component Library]]
- [[_COMMUNITY_Path Aliases Configuration|Path Aliases Configuration]]
- [[_COMMUNITY_TypeScript Compiler Config|TypeScript Compiler Config]]
- [[_COMMUNITY_Next.js Config & Build|Next.js Config & Build]]
- [[_COMMUNITY_TLE Parsing & Format|TLE Parsing & Format]]
- [[_COMMUNITY_Satellite Orbit Calculations|Satellite Orbit Calculations]]
- [[_COMMUNITY_Prisma Schema & Models|Prisma Schema & Models]]
- [[_COMMUNITY_API Route Handlers|API Route Handlers]]
- [[_COMMUNITY_Zustand State Management|Zustand State Management]]
- [[_COMMUNITY_Satellite Store Actions|Satellite Store Actions]]
- [[_COMMUNITY_Satellite List & Detail UI|Satellite List & Detail UI]]
- [[_COMMUNITY_MapLibre Map View|MapLibre Map View]]
- [[_COMMUNITY_Orbit Line & Trail Rendering|Orbit Line & Trail Rendering]]
- [[_COMMUNITY_Satellite Entity Rendering|Satellite Entity Rendering]]
- [[_COMMUNITY_TLE Import Routes|TLE Import Routes]]
- [[_COMMUNITY_Space Objects API|Space Objects API]]
- [[_COMMUNITY_Cinematic Shots System|Cinematic Shots System]]
- [[_COMMUNITY_Maneuver Calculations|Maneuver Calculations]]
- [[_COMMUNITY_Mission Simulator Logic|Mission Simulator Logic]]
- [[_COMMUNITY_Task List Panel|Task List Panel]]
- [[_COMMUNITY_Satellite Media Gallery|Satellite Media Gallery]]
- [[_COMMUNITY_Time Control UI|Time Control UI]]
- [[_COMMUNITY_Search & Filter UI|Search & Filter UI]]
- [[_COMMUNITY_NASA Image & Media API|NASA Image & Media API]]
- [[_COMMUNITY_Admin API Routes|Admin API Routes]]
- [[_COMMUNITY_Security Middleware|Security Middleware]]
- [[_COMMUNITY_Orbit Calculator Worker|Orbit Calculator Worker]]
- [[_COMMUNITY_Mock Satellite Data|Mock Satellite Data]]
- [[_COMMUNITY_Default Satellite Config|Default Satellite Config]]
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
- `TREA-01` --related_to--> `Grok-Generated TREA Image 1`  [EXTRACTED]
  README.md → public/trea/grok-image-9d334a19-6baf-46c8-988f-4588cf22a80b.jpg
- `TREA-01` --related_to--> `Grok-Generated TREA Image 2`  [EXTRACTED]
  README.md → public/trea/grok-image-c1f85337-83cf-4cd0-bcdf-c99a1eb3dd19.jpg
- `useCesium` --visualizes--> `AOI (Area of Interest)`  [EXTRACTED]
  src/hooks/useCesium.ts → README.md
- `useCesium` --implements--> `Maneuver Visualization`  [EXTRACTED]
  src/hooks/useCesium.ts → README.md
- `useChaseViewer` --implements--> `Chase Cockpit View`  [EXTRACTED]
  src/hooks/useChaseViewer.ts → README.md

## Hyperedges (group relationships)
- **TREA-01 任务仿真闭环主流程** — readme_mission_planning, readme_ai_planning, readme_orbit_visualization, readme_imaging_simulation, readme_mission_report, readme_cinematic_playback [EXTRACTED 1.00]
- **2D/3D 双视角可视化引擎技术栈** — readme_visualization_engine, readme_cesiumjs, readme_maplibre, readme_satellite_js, readme_east_asia_view [EXTRACTED 1.00]
- **AI 辅助任务规划链路 (轨道力学 + 光学遥感约束 + LLM)** — readme_ai_planning, readme_llm_doubao, readme_mission_planning, readme_aoi [EXTRACTED 1.00]
- **TREA-01 Mission Simulation Stack** — trea-mission-store, cesium-globe-component, telemetry-dashboard-component, collision-alert-modal, homepage-component [INFERRED 0.95]
- **Chase Cockpit Independent Architecture** — use-chase-viewer-hook, traffic-sats-lib, chase-cockpit-component, telemetry-dashboard-component, img-black-marble [INFERRED 0.90]
- **Docker Compose Deployment Architecture** — deployment-concept, docker-compose-config, deploy-script, deploy-readme-doc [INFERRED 0.95]

## Communities (74 total, 23 thin omitted)

### Community 0 - "TREA Mission UI Components"
Cohesion: 0.05
Nodes (72): useCesium(), CinematicActions, CinematicState, useCinematicStore, CollisionAlert, CollisionAvoidancePlan, computeOrbitParams(), computeTelemetry() (+64 more)

### Community 1 - "Cesium Core & Positions"
Cohesion: 0.05
Nodes (62): calculateSatellitePosition(), generateOrbitPoints(), generateOrbitPointsECEF(), isValidRadius(), CesiumInstance, CesiumNS, getCesium(), MapLibreInstance (+54 more)

### Community 2 - "Chase Cockpit Architecture"
Cohesion: 0.09
Nodes (34): inter, metadata, RootLayout(), ChaseCockpit(), TimeControl, useChaseViewer(), cn(), formatDateTime() (+26 more)

### Community 3 - "Constellation Import System"
Cohesion: 0.07
Nodes (28): FETCH_HEADERS, importConstellation(), ImportOptions, ImportResult, inferObjectTypeFromName(), isConstellationSeeded(), SavedSatellite, CelestrakQueryType (+20 more)

### Community 4 - "Semantic Concepts & Architecture"
Cohesion: 0.09
Nodes (36): AI Task Planning API, AOI (Area of Interest), AvoidanceVideoModal, CesiumGlobe, CesiumJS, ChaseCockpit, Chase Cockpit View, cinematicStore (+28 more)

### Community 5 - "Traffic Satellite Scheduling"
Cohesion: 0.07
Nodes (35): buildTleFromElements(), createTrafficSats(), distanceKm(), EcefVec, L2_MA, L2_MM, L2_RAAN, propagateEcfKm() (+27 more)

### Community 6 - "README Feature Documentation"
Cohesion: 0.09
Nodes (37): 2D / 3D 双视角切换, AI 辅助规划 (火山引擎方舟 Doubao), AOI (南海西沙-菲律宾海域 / 霍尔木兹海峡), Cesium CallbackProperty (实时跟随 TLE 轨道线), Celestrak (TLE 外部数据源), CesiumJS (@cesium/engine, 3D 地球), 电影回放 (4 阶段流程), 紧急避撞任务 (3 躲避计划) (+29 more)

### Community 7 - "TREA Mission State & Report"
Cohesion: 0.09
Nodes (31): TreaMissionActions, TreaMissionState, AOI_A, AOI_B, AoiPolygonVertex, ATTITUDE_INITIAL, AttitudeMode, getTrea01InitialState() (+23 more)

### Community 8 - "Deployment Documentation"
Cohesion: 0.06
Nodes (31): 1. 配置 DNS, 2. SSH 登录服务器并装 Docker（如未装）, 3. 拉取代码, 4. 配置环境变量, 5. 一键部署, 6. 验证, code:block1 (┌───────────┐ :80/:443), code:bash (# 本地构建) (+23 more)

### Community 10 - "Draco WASM Wrapper"
Cohesion: 0.16
Nodes (26): A(), B(), ba(), C(), D(), E(), f(), G() (+18 more)

### Community 11 - "Project README Overview"
Cohesion: 0.07
Nodes (26): API 服务, code:block1 (src/), code:block2 (┌─────────────┐    HTTPS     ┌──────────────────────────┐   ), code:bash (# 1. 安装依赖), TREA-01 遥感任务仿真闭环, Vercel 部署（零配置，推荐）, 功能介绍, 卫星守望者 · Satellite Watcher (+18 more)

### Community 12 - "UI Component Library"
Cohesion: 0.13
Nodes (11): Button(), buttonVariants, ImportedSatellite, ImportFailure, ImportModalProps, ImportMode, ImportResult, ImportSummary (+3 more)

### Community 13 - "Path Aliases Configuration"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 14 - "TypeScript Compiler Config"
Cohesion: 0.10
Nodes (20): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+12 more)

### Community 15 - "Next.js Config & Build"
Cohesion: 0.18
Nodes (18): HomePage(), defaultSatellites, OrbitCacheEntry, SatelliteStoreActions, SatelliteStoreState, TimeState, TLEData, useOrbitCache() (+10 more)

### Community 16 - "TLE Parsing & Format"
Cohesion: 0.16
Nodes (14): COUNTRY_KEYWORD_MAP, COUNTRY_TRANSLATIONS, OBJECT_TYPE_TRANSLATIONS, SATELLITE_NAME_TRANSLATIONS, translateCountry(), translateObjectType(), translateSatelliteName(), calculateOrbitParams() (+6 more)

### Community 17 - "Satellite Orbit Calculations"
Cohesion: 0.10
Nodes (20): dependencies, @base-ui/react, cesium, @cesium/engine, class-variance-authority, clsx, critters, @google/model-viewer (+12 more)

### Community 18 - "Prisma Schema & Models"
Cohesion: 0.10
Nodes (20): AttributeOctahedronTransform(), AttributeQuantizationTransform(), AttributeTransformData(), Decoder(), DecoderBuffer(), destroy(), DracoFloat32Array(), DracoInt16Array() (+12 more)

### Community 19 - "API Route Handlers"
Cohesion: 0.16
Nodes (15): extractJson(), LlmErrorResponse, normalizeOutput(), POST(), validateConfig(), AiAoiAnalysis, AiAoiSummary, AiCollisionAvoidanceInput (+7 more)

### Community 20 - "Zustand State Management"
Cohesion: 0.10
Nodes (18): aoiAPolygon, batchMap, bboxA, elevHorizon, elevOverhead, fp, largeAoi, nextLarge (+10 more)

### Community 21 - "Satellite Store Actions"
Cohesion: 0.15
Nodes (15): timingSafeEqualHash(), verifyPassword(), fetchOne(), ParsedTLE, parseEpoch(), parseSingleTLE(), checkRateLimit(), config (+7 more)

### Community 22 - "Satellite List & Detail UI"
Cohesion: 0.12
Nodes (15): cache, cachedEntry, CacheEntry, calculateOrbit(), ecfToGeographic(), eciToEcf(), OrbitParams, OrbitPoint (+7 more)

### Community 23 - "MapLibre Map View"
Cohesion: 0.21
Nodes (5): ApiClient, ApiResponse, fetchSpaceObjects(), fetchTags(), TagData

### Community 24 - "Orbit Line & Trail Rendering"
Cohesion: 0.12
Nodes (16): devDependencies, autoprefixer, css-loader, draco3d, file-loader, @gltf-transform/extensions, @gltf-transform/functions, postcss (+8 more)

### Community 25 - "Satellite Entity Rendering"
Cohesion: 0.12
Nodes (15): compilerOptions, esModuleInterop, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+7 more)

### Community 26 - "TLE Import Routes"
Cohesion: 0.25
Nodes (14): AlongTrackDeltaVResult, applyManeuver(), circularOrbitVelocity(), computeAlongTrackDeltaV(), computeTleChecksum(), estimateFuelCost(), formatTleEpoch(), ManeuverDirection (+6 more)

### Community 27 - "Space Objects API"
Cohesion: 0.14
Nodes (13): binChunkLength, binChunkType, buf, dryRun, gltf, jsonChunkLength, jsonChunkType, jsonStr (+5 more)

### Community 28 - "Cinematic Shots System"
Cohesion: 0.31
Nodes (12): generateMissionTle(), GenerateMissionTleOptions, generateMissionTleOrFallback(), GenerateMissionTleResult, normalize360(), computeTleChecksum(), formatAngleField8(), formatTleEpoch() (+4 more)

### Community 29 - "Maneuver Calculations"
Cohesion: 0.22
Nodes (13): aoiToBBox(), BoundingBox, computeAccessWindows(), computeAccessWindowsForAois(), computeElevation(), computeFootprint(), Footprint, GeoPoint (+5 more)

### Community 30 - "Mission Simulator Logic"
Cohesion: 0.22
Nodes (13): fmt(), pad(), AccessWindow, buildAiRequestInput(), buildCollisionRequestInput(), AoiSection(), AoiSectionProps, elevationColor() (+5 more)

### Community 31 - "Task List Panel"
Cohesion: 0.18
Nodes (10): buf, chunkLength, dir, exists, files, fullPath, gltf, jsonData (+2 more)

### Community 32 - "Satellite Media Gallery"
Cohesion: 0.22
Nodes (9): scripts, build, db:push, db:seed, dev, lint, postinstall, seed (+1 more)

### Community 33 - "Time Control UI"
Cohesion: 0.31
Nodes (7): args, BACKUP_DIR, compressFile(), createIO(), formatBytes(), main(), MODELS_DIR

### Community 34 - "Search & Filter UI"
Cohesion: 0.22
Nodes (8): doFix, hasTexCoord, io, material, meshes, primitives, semantics, texSemantics

### Community 35 - "NASA Image & Media API"
Cohesion: 0.22
Nodes (8): buf, chunkLength, chunkType, gltf, jsonData, length, magic, version

### Community 36 - "Admin API Routes"
Cohesion: 0.22
Nodes (8): buf, diag, gltf, jsonChunkLength, jsonData, name, scales, sizes

### Community 37 - "Security Middleware"
Cohesion: 0.22
Nodes (8): functions, src/app/api/admin/upload-image/route, src/app/api/sync/route, regions, maxDuration, memory, maxDuration, memory

### Community 38 - "Orbit Calculator Worker"
Cohesion: 0.43
Nodes (6): CesiumGlobe, MapLibreMap, normalizeSatellite(), PasswordModal(), inferCountryFromName(), useLastAvoidanceExecution()

### Community 39 - "Mock Satellite Data"
Cohesion: 0.25
Nodes (7): license, name, prisma, seed, private, type, version

### Community 40 - "Default Satellite Config"
Cohesion: 0.25
Nodes (8): abort(), assert(), getBinary(), getBinaryPromise(), intArrayFromBase64(), isDataURI(), isFileURI(), tryParseAsDataURI()

### Community 41 - "Community 41"
Cohesion: 0.29
Nodes (7): addOnPostRun(), addOnPreRun(), callRuntimeCallbacks(), initRuntime(), postRun(), preRun(), run()

### Community 42 - "Community 42"
Cohesion: 0.29
Nodes (6): dracoExtension, ext, io, ioSave, root, verifyIo

### Community 43 - "Community 43"
Cohesion: 0.33
Nodes (5): LlmSuccessResponse, AiTaskPlanningOutput, AiPlanningModalProps, LOADING_STAGES, Status

### Community 44 - "Community 44"
Cohesion: 0.33
Nodes (6): Orbit Parameters (Perigee/Apogee/Period/Eccentricity), SGP4/SDP4 Orbit Calculator (satellite.js), Orbit Computation Cache, SpaceObject Type, Zustand Satellite Store, Time Playback Store (requestAnimationFrame)

### Community 46 - "Community 46"
Cohesion: 0.40
Nodes (4): ext, readIo, root, writeIo

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

## Knowledge Gaps
- **390 isolated node(s):** `TimeControl`, `CesiumNS`, `TRAFFIC_MODEL_SCALE`, `ChaseInstance`, `UseChaseViewerReturn` (+385 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **23 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `TLEData` connect `Cesium Core & Positions` to `TREA Mission UI Components`, `Traffic Satellite Scheduling`, `Orbit Calculator Worker`, `TREA Mission State & Report`, `API Route Handlers`, `TLE Import Routes`, `Cinematic Shots System`, `Maneuver Calculations`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Why does `createSatrec()` connect `Cesium Core & Positions` to `TREA Mission UI Components`, `Traffic Satellite Scheduling`, `Orbit Calculator Worker`, `TLE Parsing & Format`, `TLE Import Routes`, `Maneuver Calculations`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Why does `Button()` connect `UI Component Library` to `TREA Mission UI Components`, `Chase Cockpit Architecture`, `Orbit Calculator Worker`, `TREA Mission State & Report`, `Community 43`, `TLE Parsing & Format`, `Mission Simulator Logic`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **What connects `TimeControl`, `CesiumNS`, `TRAFFIC_MODEL_SCALE` to the rest of the system?**
  _390 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `TREA Mission UI Components` be split into smaller, more focused modules?**
  _Cohesion score 0.05359719645433931 - nodes in this community are weakly interconnected._
- **Should `Cesium Core & Positions` be split into smaller, more focused modules?**
  _Cohesion score 0.05290490100616683 - nodes in this community are weakly interconnected._
- **Should `Chase Cockpit Architecture` be split into smaller, more focused modules?**
  _Cohesion score 0.08880666049953746 - nodes in this community are weakly interconnected._