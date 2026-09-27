import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import lighthouse from 'lighthouse';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const reports = new URL('../reports/', import.meta.url);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp4': 'video/mp4' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const path = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!path.startsWith(root.endsWith(sep) ? root : root + sep) || !(await stat(path)).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream' });
    response.end(await readFile(path));
  } catch {
    response.writeHead(404).end();
  }
});

let browser;
try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(4174, '127.0.0.1', resolve);
  });
  browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--remote-debugging-port=9223'] });
  await mkdir(reports, { recursive: true });
  const result = await lighthouse('http://127.0.0.1:4174', {
    port: 9223,
    output: ['html', 'json'],
    logLevel: 'error',
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    disableFullPageScreenshot: true,
    skipAudits: ['screenshot-thumbnails', 'final-screenshot', 'full-page-screenshot'],
  });
  if (!result) throw new Error('Lighthouse did not return a result');
  await writeFile(new URL('lighthouse.html', reports), result.report[0]);
  await writeFile(new URL('lighthouse.json', reports), result.report[1]);
  console.log(JSON.stringify({
    categories: Object.fromEntries(Object.entries(result.lhr.categories).map(([key, value]) => [key, value.score])),
    lcp: result.lhr.audits['largest-contentful-paint'].displayValue,
    cls: result.lhr.audits['cumulative-layout-shift'].displayValue,
    totalBlockingTime: result.lhr.audits['total-blocking-time'].displayValue,
  }, null, 2));
} finally {
  await browser?.close();
  server.close();
}
