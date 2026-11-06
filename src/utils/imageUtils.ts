/**
 * Image Compression, Dark-Mode OCR Preprocessing, and Full-Screen Lightbox Utilities
 */

function loadBlobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not decode uploaded image.'));
    };
    img.src = objectUrl;
  });
}

/**
 * Compresses an uploaded screenshot/photo to a compact JPEG Data URL (~30-55 KB)
 * safe for offline localStorage and Firestore document persistence (<1 MB limit).
 */
export async function compressImageToDataUrl(
  file: Blob,
  maxDimension: number = 720,
  quality: number = 0.72
): Promise<string> {
  const img = await loadBlobToImage(file);
  let { width, height } = img;

  if (width > maxDimension || height > maxDimension) {
    if (width >= height) {
      height = Math.max(1, Math.round((height * maxDimension) / width));
      width = maxDimension;
    } else {
      width = Math.max(1, Math.round((width * maxDimension) / height));
      height = maxDimension;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Prepares a clean grayscale + contrast-enhanced canvas Data URL for client-side OCR.
 * Automatically detects dark-mode group chat screenshots (Messenger / Discord / Dark UI)
 * and inverts them to dark-text-on-light-background for high OCR accuracy.
 */
export async function preprocessImageForOcr(
  file: Blob,
  maxDimension: number = 1200
): Promise<string> {
  const img = await loadBlobToImage(file);
  let { width, height } = img;

  if (width > maxDimension || height > maxDimension) {
    if (width >= height) {
      height = Math.max(1, Math.round((height * maxDimension) / width));
      width = maxDimension;
    } else {
      width = Math.max(1, Math.round((width * maxDimension) / height));
      height = maxDimension;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // Sample average luminance to detect dark-mode chat screenshots
  let lumSum = 0;
  const totalPixels = width * height;
  for (let i = 0; i < data.length; i += 16) {
    lumSum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  const avgLum = lumSum / Math.max(1, Math.ceil(totalPixels / 4));
  const isDarkMode = avgLum < 105;

  // Convert to crisp high-contrast grayscale (inverting if dark-mode screenshot)
  for (let i = 0; i < data.length; i += 4) {
    let gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (isDarkMode) {
      gray = 255 - gray;
    }
    // Gentle contrast stretch around midpoint
    const stretched = Math.max(0, Math.min(255, (gray - 128) * 1.35 + 128));
    data[i] = stretched;
    data[i + 1] = stretched;
    data[i + 2] = stretched;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * Opens a full-screen zoomable modal preview for any attached screenshot or photo.
 */
export function openImageLightbox(photoUrl: string, caption?: string): void {
  const existing = document.getElementById('cerebruv-image-lightbox');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'cerebruv-image-lightbox';
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: rgba(18, 18, 22, 0.86);
    backdrop-filter: blur(6px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 18px;
    animation: fadeIn 0.18s ease-out;
  `;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.innerHTML = '&times;';
  closeBtn.title = 'Close Preview';
  closeBtn.style.cssText = `
    position: absolute;
    top: 16px;
    right: 16px;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.28);
    background: rgba(18, 18, 22, 0.75);
    color: #FFFFFF;
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  const imgEl = document.createElement('img');
  imgEl.src = photoUrl;
  imgEl.alt = caption || 'Attached Screenshot';
  imgEl.style.cssText = `
    max-width: min(94vw, 680px);
    max-height: 78vh;
    object-fit: contain;
    border-radius: 12px;
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.55);
    background: #FFFFFF;
  `;

  overlay.appendChild(closeBtn);
  overlay.appendChild(imgEl);

  if (caption && caption.trim()) {
    const capEl = document.createElement('div');
    capEl.textContent = caption.trim();
    capEl.style.cssText = `
      margin-top: 12px;
      max-width: min(90vw, 560px);
      padding: 8px 14px;
      border-radius: 10px;
      background: rgba(250, 247, 242, 0.96);
      color: #121216;
      font-size: 0.78rem;
      font-weight: 600;
      text-align: center;
      line-height: 1.4;
    `;
    overlay.appendChild(capEl);
  }

  const dismiss = () => {
    overlay.remove();
    window.removeEventListener('keydown', onKey);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') dismiss();
  };

  closeBtn.addEventListener('click', dismiss);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) dismiss();
  });
  window.addEventListener('keydown', onKey);

  document.body.appendChild(overlay);
}
