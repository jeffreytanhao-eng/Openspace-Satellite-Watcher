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
