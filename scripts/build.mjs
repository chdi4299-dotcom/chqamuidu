import { rm, mkdir, copyFile } from 'node:fs/promises';
// This command packages locally. On Netlify it must never publish without approval.
if (process.env.NETLIFY === 'true' && process.env.VEZLIO_ALLOW_NETLIFY_DEPLOY !== 'approved') {
  console.error('Publication is locked. Explicit owner approval is required before enabling a Netlify build.');
  process.exit(1);
}
if (process.env.NETLIFY === 'true' && ['deploy-preview','branch-deploy'].includes(process.env.CONTEXT)) {
  console.error('Branch and pull-request deployments are disabled.');
  process.exit(1);
}
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
// Explicit allowlist: never publish server source, credentials, migrations or tests.
for (const file of ['index.html','styles.css','app.js','config.js','favicon.svg','admin.js','admin.css']) {
  await copyFile(file, `dist/${file}`);
}
console.log('Packaged static storefront in dist/. Protected /admin HTML is served only by the authenticated function. No deployment performed.');
