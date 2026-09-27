import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('screenshots are directly discoverable and return focus after keyboard zoom', async ({ page }) => {
  await page.goto('/');
  const screenshots = page.locator('a[data-zoom]');
  expect(await screenshots.count()).toBeGreaterThanOrEqual(5);
  for (const screenshot of await screenshots.all()) await expect(screenshot).toBeVisible();
  const zoom = page.getByRole('link', { name: '放大用量统计截图' });
  await zoom.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: '界面原图' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(zoom).toBeFocused();
});

test('the session demo keeps playing through pointer input and suspends offscreen', async ({ page, isMobile }) => {
  await page.goto('/');
  const video = page.locator('#demo-video');
  await video.scrollIntoViewIfNeeded();
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime), { timeout: 15000 }).toBeGreaterThan(0);
  expect(await video.evaluate((element: HTMLVideoElement) => ({ muted: element.muted, controls: element.controls, loop: element.loop, inline: element.playsInline })))
    .toEqual({ muted: true, controls: false, loop: true, inline: true });
  await expect(video).toHaveAttribute('src', /media\/session-demo\.mp4$/);
  expect(await video.evaluate((element: HTMLVideoElement) => ({ width: element.videoWidth, height: element.videoHeight })))
    .toEqual({ width: 1440, height: 856 });
  const startedAt = await video.evaluate((element: HTMLVideoElement) => element.currentTime);
  if (isMobile) await page.locator('.demo-stage').tap();
  else await page.locator('.demo-stage').click();
  expect(await video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(false);
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(startedAt);
  await page.locator('.demo-stage').dblclick();
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(false);
  await page.locator('#download').scrollIntoViewIfNeeded();
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);
  await video.scrollIntoViewIfNeeded();
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(false);
});

test('download options resolve to the verified Windows release artifacts', async ({ page }) => {
  await page.goto('/#download');
  const setup = page.getByRole('link', { name: '下载安装包' });
  const portable = page.getByRole('link', { name: '下载便携版 ZIP' });
  await expect(setup).toHaveAttribute('href', /v0\.2\.1\/fintwind-0\.2\.1-x86_64-Setup\.exe$/);
  await page.getByRole('radio', { name: 'ARM64' }).check();
  await expect(setup).toHaveAttribute('href', /aarch64-Setup\.exe$/);
  await expect(portable).toHaveAttribute('href', /aarch64-pc-windows-msvc\.zip$/);
  await page.getByText('需要先安装 OpenCode 吗？', { exact: true }).click();
  await expect(page.getByText('OpenCode v2.0.16', { exact: false }).last()).toBeVisible();
});

test('restored architecture selection updates downloads on initialization and pageshow', async ({ page }) => {
  let loadScript!: () => void;
  const scriptGate = new Promise<void>(resolve => { loadScript = resolve; });
  await page.route('**/_astro/*.js', async route => {
    await scriptGate;
    await route.continue();
  });
  await page.goto('/#download', { waitUntil: 'commit' });
  // Restore the checked property without a change event, as browsers do.
  await page.getByRole('radio', { name: 'ARM64' }).evaluate((input: HTMLInputElement) => { input.checked = true; });
  loadScript();
  await page.waitForLoadState();
  const setup = page.getByRole('link', { name: '下载安装包' });
  const portable = page.getByRole('link', { name: '下载便携版 ZIP' });
  await expect(setup).toHaveAttribute('href', /aarch64-Setup\.exe$/);
  await expect(portable).toHaveAttribute('href', /aarch64-pc-windows-msvc\.zip$/);
  await page.getByRole('radio', { name: 'x64 Intel / AMD' }).evaluate((input: HTMLInputElement) => {
    input.checked = true;
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  await expect(setup).toHaveAttribute('href', /x86_64-Setup\.exe$/);
  await expect(portable).toHaveAttribute('href', /x86_64-pc-windows-msvc\.zip$/);
});

test('white theme overrides old theme settings and reduced motion stops autoplay', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('fintwind-theme', 'dark'));
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.locator('#demo-video')).toBeHidden();
  await expect(page.locator('.demo-still')).toBeVisible();
  expect(await page.locator('#demo-video').getAttribute('src')).toBeNull();
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations).toEqual([]);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const video = page.locator('#demo-video');
  await video.scrollIntoViewIfNeeded();
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime), { timeout: 15000 }).toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);
});

test('all local media and navigation targets are usable', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('response', response => {
    if (response.url().startsWith('http://127.0.0.1:4173') && response.status() >= 400) {
      failures.push(`${response.status()} ${response.url()}`);
    }
  });
  await page.goto('/');
  for (const image of await page.locator('a[data-zoom] img').all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  }
  const missingAnchors = await page.locator('a[href^="#"]').evaluateAll(links =>
    links.map(link => link.getAttribute('href')!).filter(href => !document.getElementById(href.slice(1))),
  );
  expect(missingAnchors).toEqual([]);
  expect(failures).toEqual([]);
});

test('without JavaScript, video and both download architectures remain usable', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  try {
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.getByRole('link', { name: '打开演示视频' })).toHaveAttribute('href', /media\/session-demo\.mp4$/);
    await expect(page.getByRole('radio', { name: 'ARM64' })).toBeDisabled();
    await expect(page.getByRole('link', { name: '下载 ARM64 安装包' })).toHaveAttribute('href', /aarch64-Setup\.exe$/);
    await expect(page.getByRole('link', { name: '下载 ARM64 便携版' })).toHaveAttribute('href', /aarch64-pc-windows-msvc\.zip$/);
    await expect(page.getByRole('link', { name: '放大模型选择截图' })).toHaveAttribute('href', /media\/models\.webp$/);
    for (const screenshot of await page.locator('a[data-zoom]').all()) await expect(screenshot).toBeVisible();
  } finally {
    await context.close();
  }
});
