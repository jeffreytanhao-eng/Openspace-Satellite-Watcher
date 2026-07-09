'use client';

import dynamic from 'next/dynamic';

const HomePage = dynamic(() => import('@/components/HomePage'), {
  ssr: false,
  loading: () => (
    <div className="h-screen flex items-center justify-center bg-space-950 text-space-400">
      <div className="w-8 h-8 border-2 border-cosmic-blue border-t-transparent rounded-full animate-spin"></div>
    </div>
  ),
});

export default function Home() {
  return <HomePage />;
}
