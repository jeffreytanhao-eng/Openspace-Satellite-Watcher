'use client';

// TREA-01 赛车视角驾驶舱 — 独立路由 /cockpit
// ------------------------------------------------------------
// 与主应用完全隔离:不修改任何现有文件,仅新增 4 个文件:
//   src/app/cockpit/page.tsx            (本文件,路由入口)
//   src/components/cockpit/ChaseCockpit.tsx
//   src/hooks/useChaseViewer.ts
//   src/lib/cockpit/traffic-sats.ts
// 回退方式:删除 src/app/cockpit/ 目录即可完全移除,主页与任务中心不受影响。

import dynamic from 'next/dynamic';

const ChaseCockpit = dynamic(() => import('@/components/cockpit/ChaseCockpit'), {
  ssr: false,
  loading: () => (
    <div className="h-screen flex items-center justify-center bg-black text-cyan-400">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm font-mono">加载卫星视角…</span>
      </div>
    </div>
  ),
});

export default function CockpitPage() {
  return <ChaseCockpit />;
}
