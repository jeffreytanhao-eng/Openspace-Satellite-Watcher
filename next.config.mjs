/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Prisma 客户端需要动态加载引擎二进制文件，不能被 Webpack 打包
  // 否则在 Vercel Serverless 环境下会报错（尤其是写入操作）
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client'],
  },
  webpack(config, { isServer, webpack }) {
    // Mark cesium as external — loaded via CDN <script> to avoid
    // bundling its build output which contains octal escape sequences
    // that break in template literals.
    config.externals = config.externals || [];
    config.externals.push({ cesium: 'Cesium' });

    if (isServer) return config;
    config.plugins.push(
      new webpack.DefinePlugin({
        CESIUM_BASE_URL: JSON.stringify('https://cdn.jsdelivr.net/npm/cesium@1.142.0/Build/Cesium/'),
        'typeof define': JSON.stringify('undefined'),
      })
    );
    config.module.rules.push({
      test: /\.(?:glb|gltf|wasm|pnts|i3dm|cmpt|terrain|ktx2|crn)$/,
      type: 'asset/resource',
    });
    return config;
  },
};

export default nextConfig;
