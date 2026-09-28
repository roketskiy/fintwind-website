const root = document.documentElement;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const video = document.querySelector<HTMLVideoElement>('#demo-video');
const videoError = document.querySelector<HTMLElement>('.video-error');
const imageDialog = document.querySelector<HTMLDialogElement>('#image-dialog');
const expandedImage = document.querySelector<HTMLImageElement>('#expanded-image');
let dialogTrigger: HTMLElement | null = null;
let videoInView = false;

function updatePlayback() {
  if (!video) return;
  const shouldPlay = videoInView && !reducedMotion.matches
    && document.visibilityState === 'visible' && !imageDialog?.open && !video.error;
  if (!shouldPlay) {
    video.pause();
    return;
  }
  if (!video.getAttribute('src') && video.dataset.src) video.src = video.dataset.src;
  if (video.paused) {
    // Keep the poster visible when the browser blocks autoplay.
    void video.play().catch(() => {});
  }
}

if (video) {
  video.muted = true;
  video.addEventListener('error', () => {
    video.closest('.demo-stage')?.classList.add('demo-fallback');
    if (videoError) videoError.hidden = false;
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      videoInView = entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.1);
      updatePlayback();
    }, { threshold: [0, 0.1] }).observe(video);
  } else {
    videoInView = true;
    updatePlayback();
  }
  document.addEventListener('visibilitychange', updatePlayback);
  reducedMotion.addEventListener('change', updatePlayback);
}

document.querySelectorAll<HTMLAnchorElement>('[data-zoom]').forEach(trigger => {
  trigger.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    if (!imageDialog || !expandedImage || !trigger.dataset.zoom) return;
    event.preventDefault();
    expandedImage.src = trigger.dataset.zoom;
    expandedImage.alt = trigger.dataset.alt || 'Fintwind 界面截图';
    dialogTrigger = trigger;
    imageDialog.showModal();
    root.classList.add('dialog-open');
    updatePlayback();
  });
});

if (imageDialog) {
  imageDialog.querySelector('[data-close-dialog]')?.addEventListener('click', () => imageDialog.close());
  imageDialog.addEventListener('click', event => {
    if (event.target !== imageDialog) return;
    const bounds = imageDialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) imageDialog.close();
  });
  imageDialog.addEventListener('close', () => {
    root.classList.remove('dialog-open');
    dialogTrigger?.focus({ preventScroll: true });
    dialogTrigger = null;
    updatePlayback();
  });
}

const setupLink = document.querySelector<HTMLAnchorElement>('#download-setup');
const portableLink = document.querySelector<HTMLAnchorElement>('#download-portable');
const architectureFieldset = document.querySelector<HTMLFieldSetElement>('.architecture');
if (architectureFieldset) architectureFieldset.disabled = false;

function syncDownloadArchitecture() {
  const input = document.querySelector<HTMLInputElement>('input[name="architecture"]:checked');
  if (!input || !setupLink || !portableLink) return;
  const { downloadRoot, version } = setupLink.dataset;
  if (!downloadRoot || !version || !['x86_64', 'aarch64'].includes(input.value)) return;
  const prefix = `${downloadRoot}/fintwind-${version}-${input.value}`;
  setupLink.href = `${prefix}-Setup.exe`;
  portableLink.href = `${prefix}-pc-windows-msvc.zip`;
}

document.querySelectorAll<HTMLInputElement>('input[name="architecture"]').forEach(input => {
  input.addEventListener('change', syncDownloadArchitecture);
});
syncDownloadArchitecture();
window.addEventListener('pageshow', syncDownloadArchitecture);

// Reveal only nearby content; everything remains visible without JavaScript.
if (!reducedMotion.matches && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-revealed');
      observer.unobserve(entry.target);
    }
  }, { threshold: 0.08 });
  document.querySelectorAll<HTMLElement>('[data-reveal]').forEach(element => {
    element.classList.add('reveal-ready');
    observer.observe(element);
  });
  reducedMotion.addEventListener('change', event => {
    if (!event.matches) return;
    observer.disconnect();
    document.querySelectorAll('.reveal-ready').forEach(element => element.classList.add('is-revealed'));
  });
}

// ASCII wind field in the hero: a quiet grid of terminal glyphs that ripples
// around the pointer. Desktop pointers only; static or absent otherwise.
const asciiCanvas = document.querySelector<HTMLCanvasElement>('#hero-ascii');
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
if (asciiCanvas && !reducedMotion.matches && finePointer.matches) {
  const ctx = asciiCanvas.getContext('2d');
  const hero = asciiCanvas.closest<HTMLElement>('.hero');
  if (ctx && hero) {
    const CELL = 18;
    const RADIUS = 150;
    type Glyph = { x: number; y: number; jitter: number };
    let glyphs: Glyph[] = [];
    let width = 0;
    let height = 0;
    let raf = 0;
    let running = false;
    const pointer = { x: -9999, y: -9999, targetX: -9999, targetY: -9999, inside: false };

    function rebuild() {
      const rect = hero!.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      asciiCanvas!.width = Math.round(width * dpr);
      asciiCanvas!.height = Math.round(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      glyphs = [];
      const cols = Math.ceil(width / CELL);
      const rows = Math.ceil(height / CELL);
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          glyphs.push({
            x: col * CELL + CELL / 2,
            y: row * CELL + CELL / 2,
            jitter: Math.random() * Math.PI * 2,
          });
        }
      }
    }

    function frame(now: number) {
      const time = now / 1000;
      pointer.x += (pointer.targetX - pointer.x) * 0.14;
      pointer.y += (pointer.targetY - pointer.y) * 0.14;
      ctx!.clearRect(0, 0, width, height);
      ctx!.font = '600 13px ui-monospace, Consolas, "SF Mono", monospace';
      ctx!.textAlign = 'center';
      ctx!.textBaseline = 'middle';
      ctx!.fillStyle = '#176441';
      for (const glyph of glyphs) {
        const wave = Math.sin(glyph.x * 0.012 + time * 1.3 + Math.sin(glyph.y * 0.02 + time * 0.6) * 1.1 + glyph.jitter * 0.12);
        const dx = glyph.x - pointer.x;
        const dy = glyph.y - pointer.y;
        const distance = Math.hypot(dx, dy);
        const reach = Math.max(0, 1 - distance / RADIUS);
        const boost = reach * reach;
        const alpha = 0.045 + 0.05 * (0.5 + 0.5 * wave) + boost * 0.6;
        if (alpha < 0.02) continue;
        const push = boost * 5;
        const ox = distance > 0.001 ? (dx / distance) * push : 0;
        const oy = distance > 0.001 ? (dy / distance) * push : 0;
        ctx!.globalAlpha = Math.min(alpha, 0.8);
        ctx!.fillText(boost > 0.35 ? '_' : '>', glyph.x + ox, glyph.y + oy);
      }
      ctx!.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    }

    function start() {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
      cancelAnimationFrame(raf);
    }

    rebuild();
    window.addEventListener('resize', rebuild);
    hero.addEventListener('pointermove', event => {
      const rect = asciiCanvas!.getBoundingClientRect();
      pointer.targetX = event.clientX - rect.left;
      pointer.targetY = event.clientY - rect.top;
      pointer.inside = true;
    });
    hero.addEventListener('pointerleave', () => {
      pointer.inside = false;
      pointer.targetX = -9999;
      pointer.targetY = -9999;
    });
    new IntersectionObserver(entries => {
      const visible = entries.some(entry => entry.isIntersecting);
      if (visible && document.visibilityState === 'visible' && !reducedMotion.matches) start();
      else stop();
    }, { threshold: 0 }).observe(hero);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !reducedMotion.matches) start();
      else stop();
    });
    reducedMotion.addEventListener('change', event => {
      if (event.matches) stop();
    });
    start();
  }
}
