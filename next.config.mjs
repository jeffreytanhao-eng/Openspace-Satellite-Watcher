import path from 'node:path';
import fs from 'node:fs';

/**
 * Copies Cesium static assets (Workers, Assets, ThirdParty, Widgets)
 * from node_modules/cesium/Build/Cesium/ into public/cesium/
 * so that they are served statically at /ces/ on Vercel / any host.
 *
 * Run synchronously at config-load time so it executes before webpack runs
 * for both `next dev` and `next build`.
 */
function copyCesiumAssets() {
  // Use minified build for production, unminified for development
  const cesiumBuildDir = process.env.NODE_ENV === 'production'
    ? path.resolve(process.cwd(), 'node_modules', 'cesium', 'Build', 'Cesium')
    : path.resolve(process.cwd(), 'node_modules', 'cesium', 'Build', 'CesiumUnminified');
  const targetDir = path.resolve(process.cwd(), 'public', 'cesium');

  if (!fs.existsSync(cesiumBuildDir)) {
    console.warn('[next.config] Cesium build directory not found:', cesiumBuildDir);
    return;
  }

  fs.mkdirSync(targetDir, { recursive: true });

  const dirsToCopy = ['Assets', 'Workers', 'ThirdParty', 'Widgets'];

  for (const dir of dirsToCopy) {
    const src = path.join(cesiumBuildDir, dir);
    const dest = path.join(targetDir, dir);
    if (fs.existsSync(src)) {
      try {
        fs.cpSync(src, dest, { recursive: true, force: true });
      } catch {
        // File locked on Windows, assume assets exist
      }
    }
  }

  // Also copy the main UMD bundle and helpers
  const filesToCopy = ['Cesium.js', 'index.cjs', 'index.js'];
  for (const file of filesToCopy) {
    const src = path.join(cesiumBuildDir, file);
    const dest = path.join(targetDir, file);
    if (fs.existsSync(src)) {
      try {
        fs.copyFileSync(src, dest);
      } catch {
        // File locked
      }
    }
  }
}

// Copy assets eagerly so they are ready on first dev run too.
try {
  copyCesiumAssets();
} catch (e) {
  console.warn('[next.config] Cesium assets copy skipped:', e?.message || e);
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack(config, { dev, isServer, webpack }) {
    // Prevent Cesium from running on the server
    if (isServer) return config;

    // Expose CESIUM_BASE_URL so Cesium looks for Workers/Assets/Widgets at /cesium/
    config.plugins.push(
      new webpack.DefinePlugin({
        CESIUM_BASE_URL: JSON.stringify('/cesium/'),
        // Prevent Cesium's AMD-detection branch from firing inside webpack
        'typeof define': JSON.stringify('undefined'),
      })
    );

    // Cesium uses inline `require` for various binary/text assets.
    // Mark cesium as having side effects so tree-shaking doesn't break it.
    config.module.rules.push({
      test: /\.(?:glb|gltf|wasm|pnts|i3dm|cmpt|terrain|ktx2|crn)$/,
      type: 'asset/resource',
    });

    return config;
  },
};

export default nextConfig;
