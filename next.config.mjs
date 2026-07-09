/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack(config, { isServer, webpack }) {
    if (isServer) return config;
    config.plugins.push(
      new webpack.DefinePlugin({
        CESIUM_BASE_URL: JSON.stringify('/cesium/'),
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
