// Setup environment variables for Prisma before build
// On Vercel, Neon integration provides POSTGRES_PRISMA_URL instead of DATABASE_URL
// Prisma CLI reads from .env file by default (not .env.production)
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// Map Vercel Neon env vars
if (!process.env.DATABASE_URL && process.env.POSTGRES_PRISMA_URL) {
  process.env.DATABASE_URL = process.env.POSTGRES_PRISMA_URL;
}
if (!process.env.DATABASE_URL && process.env.POSTGRES_URL) {
  process.env.DATABASE_URL = process.env.POSTGRES_URL;
}
if (!process.env.POSTGRES_URL_NON_POOLING && process.env.DATABASE_URL_UNPOOLED) {
  process.env.POSTGRES_URL_NON_POOLING = process.env.DATABASE_URL_UNPOOLED;
}
// Also write to .env file so Prisma CLI can read it
const envPath = path.join(__dirname, '..', '.env');
let envContent = '';
if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, 'utf8');
}
if (process.env.DATABASE_URL) {
  if (envContent.match(/^DATABASE_URL=/m)) {
    envContent = envContent.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL="${process.env.DATABASE_URL}"`);
  } else {
    envContent += `\nDATABASE_URL="${process.env.DATABASE_URL}"\n`;
  }
  fs.writeFileSync(envPath, envContent);
  console.log('[setup-env] DATABASE_URL configured');
} else {
  console.log('[setup-env] DATABASE_URL already set or not needed');
}

// Now run prisma db push
console.log('[setup-env] Running: prisma db push');
const prismaResult = spawnSync('npx', ['prisma', 'db push'], {
  stdio: 'inherit',
  env: process.env,
  cwd: path.join(__dirname, '..'),
});
if (prismaResult.status !== 0) {
  process.exit(prismaResult.status || 1);
}

// Then run next build
console.log('[setup-env] Running: next build');
const nextResult = spawnSync('npx', ['next', 'build'], {
  stdio: 'inherit',
  env: process.env,
  cwd: path.join(__dirname, '..'),
});
process.exit(nextResult.status || 0);
