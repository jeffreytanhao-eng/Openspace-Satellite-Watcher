// Setup environment variables for Prisma before build
// On Vercel, Neon integration provides POSTGRES_PRISMA_URL instead of DATABASE_URL
const fs = require('fs');
const path = require('path');

const envVars = {};

// Map Vercel Neon env vars to Prisma expected vars
if (process.env.POSTGRES_PRISMA_URL && !process.env.DATABASE_URL) {
  envVars.DATABASE_URL = process.env.POSTGRES_PRISMA_URL;
}
if (process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
  envVars.DATABASE_URL = process.env.POSTGRES_URL;
}
if (process.env.DATABASE_URL_UNPOOLED && !process.env.POSTGRES_URL_NON_POOLING) {
  envVars.POSTGRES_URL_NON_POOLING = process.env.DATABASE_URL_UNPOOLED;
}

if (Object.keys(envVars).length > 0) {
  const envFile = path.join(__dirname, '..', '.env.production');
  let content = '';
  if (fs.existsSync(envFile)) {
    content = fs.readFileSync(envFile, 'utf8');
  }
  for (const [key, val] of Object.entries(envVars)) {
    // Remove existing entry if present
    content = content.replace(new RegExp(`^${key}=.*$`, 'm'), '');
    content += `${key}="${val}"\n`;
    console.log(`[setup-env] Set ${key}`);
  }
  fs.writeFileSync(envFile, content);
  console.log('[setup-env] Wrote env vars to .env.production');
} else {
  console.log('[setup-env] No env mapping needed');
}
