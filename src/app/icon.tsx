import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';
// 在构建时跳过预渲染（@vercel/og 在中文路径下 fileURLToPath 会失败）
export const dynamic = 'force-dynamic';

// 复用左上角品牌标识的卫星图标作为 favicon
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #00d4ff, #7c3aed)',
          borderRadius: '50%',
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="2.5" />
          <line x1="12" y1="5" x2="12" y2="9.5" />
          <line x1="12" y1="14.5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="9.5" y2="12" />
          <line x1="14.5" y1="12" x2="19" y2="12" />
          <rect x="3" y="10" width="3" height="4" rx="0.5" />
          <rect x="18" y="10" width="3" height="4" rx="0.5" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
