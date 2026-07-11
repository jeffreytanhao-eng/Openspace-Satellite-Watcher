// Setup environment variables for Vercel builds
// Usage:
//   postinstall: node scripts/setup-env.cjs postinstall  -> runs prisma generate with DATABASE_URL
//   build:       node scripts/setup-env.cjs              -> runs next build with DATABASE_URL
const { spawnSync } = require('child_process');

// Map Vercel Neon env vars
if (!process.env.DATABASE_URL) {
  if (process.env.POSTGRES_PRISMA_URL) {
    process.env.DATABASE_URL = process.env.POSTGRES_PRISMA_URL;
  } else if (process.env.POSTGRES_URL) {
    process.env.DATABASE_URL = process.env.POSTGRES_URL;
  } else {
    // Fallback: set a dummy URL so prisma generate doesn't fail at postinstall
    // prisma generate only parses the schema, doesn't connect to the DB
    process.env.DATABASE_URL = 'postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public';
  }
}
if (!process.env.POSTGRES_URL_NON_POOLING && process.env.DATABASE_URL_UNPOOLED) {
  process.env.POSTGRES_URL_NON_POOLING = process.env.DATABASE_URL_UNPOOLED;
}

const isPostinstall = process.argv[2] === 'postinstall';
const cmd = isPostinstall ? ['prisma', 'generate'] : ['next', 'build'];
console.log(`[setup-env] Running: npx ${cmd.join(' ')} (DATABASE_URL=${!!process.env.DATABASE_URL})`);

const result = spawnSync('npx', cmd, {
  stdio: 'inherit',
  env: process.env,
  cwd: require('path').join(__dirname, '..'),
});
process.exit(result.status || 0);
