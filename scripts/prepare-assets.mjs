import { mkdir, rm, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const source = new URL('../page/', import.meta.url);
const destination = new URL('../public/media/', import.meta.url);
const images = {
  '会话页.png': 'conversation',
  '标签页.png': 'tabs',
  '模型选择.png': 'models',
  '供应商.png': 'providers',
  'MCP.png': 'mcp',
  '用量.png': 'usage',
};

await mkdir(destination, { recursive: true });
for (const [filename, name] of Object.entries(images)) {
  const input = fileURLToPath(new URL(filename, source));
  const output = fileURLToPath(new URL(`${name}.webp`, destination));
  await sharp(input).webp({ quality: 90, effort: 6 }).toFile(output);
  console.log(`[OK] ${name}.webp (${(await stat(output)).size} bytes)`);
}

const video = fileURLToPath(new URL('会话演示.mp4', source));
const loop = fileURLToPath(new URL('session-demo.mp4', destination));
const poster = fileURLToPath(new URL('session-demo-poster.webp', destination));
const modified = Math.max((await stat(video)).mtimeMs, (await stat(fileURLToPath(import.meta.url))).mtimeMs);
const outputs = await Promise.all([loop, poster].map(path => stat(path).catch(() => null)));
if (outputs.some(output => !output || output.mtimeMs < modified)) {
  const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
  execFileSync(ffmpeg, [
    '-y', '-hide_banner', '-loglevel', 'error', '-i', video,
    '-an', '-vf', 'fps=24,scale=1440:-2,setsar=1', '-c:v', 'libx264', '-crf', '22',
    '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', loop,
  ], { stdio: 'inherit' });
  execFileSync(ffmpeg, [
    '-y', '-hide_banner', '-loglevel', 'error', '-ss', '0.3', '-i', video,
    '-frames:v', '1', '-vf', 'scale=1440:-2', '-quality', '88', poster,
  ], { stdio: 'inherit' });
}
console.log(`[OK] session-demo.mp4 (${(await stat(loop)).size} bytes, silent and fast-start)`);
console.log('[OK] session-demo-poster.webp (frame extracted from the session recording)');
await Promise.all(['memory.webp', 'demo.mp4', 'conversation-small.webp', 'demo-loop.mp4', 'demo-poster.webp']
  .map(name => rm(new URL(name, destination), { force: true })));
