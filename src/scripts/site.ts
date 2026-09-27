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
