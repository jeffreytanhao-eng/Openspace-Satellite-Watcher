import { Suspense } from 'react'
import Script from 'next/script'
import './globals.css'
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata = {
  title: '开放太空 - 卫星守望者',
  description: '开源太空卫星观测与追踪平台',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" className={cn("dark", "font-sans", inter.variable, "h-full")}>
      <head>
        <Script
          src="https://cdn.jsdelivr.net/npm/cesium@1.142.0/Build/Cesium/Cesium.js"
          strategy="beforeInteractive"
        />
      </head>
      <body className={cn("h-full", "bg-space-950", "text-space-100", "overflow-hidden")}>
        <Suspense fallback={<div className="h-screen flex items-center justify-center">Loading...</div>}>
          {children}
        </Suspense>
      </body>
    </html>
  )
}
