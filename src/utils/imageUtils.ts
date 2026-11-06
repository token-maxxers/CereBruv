/**
 * Image Compression, Color-Aware OCR Preprocessing, Offline QR Code Decoder,
 * URL/Shortlink Extractor, Live Camera Viewfinder Modal, and Full-Screen Lightbox Utilities
 */

import jsQR from 'jsqr';
import type { SavedLink } from '../types/task';

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
  maxDimension: number = 760,
  quality: number = 0.74
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
 * Prepares a high-clarity grayscale canvas Data URL for client-side OCR:
 * 1. Upscales small posters/screenshots (~1500px) so small URLs/footers stay crisp.
 * 2. Preserves colored letters (red/orange/blue/yellow) on white posters WITHOUT clipping.
 * 3. Removes dark outer screenshot letterbox borders so Otsu thresholding isn't skewed.
 * 4. Appends an upscaled inverted strip for any dark footer/header ribbon (e.g. white URLs/emails on blue footer bars).
 * 5. Automatically inverts full dark-mode chat screenshots (Messenger / Discord / Dark UI).
 */
export async function preprocessImageForOcr(
  file: Blob,
  targetDimension: number = 1500
): Promise<string> {
  const img = await loadBlobToImage(file);
  const origW = img.width || 1;
  const origH = img.height || 1;

  // Scale up small screenshots/posters (up to 2.2x) or cap ultra-large camera photos at targetDimension
  const maxOrig = Math.max(origW, origH);
  const scale =
    maxOrig > targetDimension
      ? targetDimension / maxOrig
      : maxOrig < 1100
        ? Math.min(2.2, 1350 / maxOrig)
        : 1;

  const width = Math.max(1, Math.round(origW * scale));
  const height = Math.max(1, Math.round(origH * scale));

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = width;
  srcCanvas.height = height;
  const srcCtx = srcCanvas.getContext('2d')!;
  srcCtx.fillStyle = '#FFFFFF';
  srcCtx.fillRect(0, 0, width, height);
  srcCtx.drawImage(img, 0, 0, width, height);

  const srcImageData = srcCtx.getImageData(0, 0, width, height);
  const data = srcImageData.data;

  // Measure interior 60% luminance so dark outer screenshot frames don't misclassify light posters
  const xStart = Math.floor(width * 0.2);
  const xEnd = Math.ceil(width * 0.8);
  const yStart = Math.floor(height * 0.2);
  const yEnd = Math.ceil(height * 0.8);
  let centerLumSum = 0;
  let centerSamples = 0;
  for (let y = yStart; y < yEnd; y += 4) {
    for (let x = xStart; x < xEnd; x += 4) {
      const idx = (y * width + x) * 4;
      centerLumSum += 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      centerSamples++;
    }
  }
  const centerAvgLum = centerLumSum / Math.max(1, centerSamples);
  const isDarkMode = centerAvgLum < 100;

  // Detect if a light-mode poster has a dark footer ribbon (bottom 16%) with white contact links/emails
  let hasDarkFooterRibbon = false;
  const footerStartRow = Math.floor(height * 0.84);
  if (!isDarkMode && height >= 200) {
    let darkRowCount = 0;
    const checkRows = Math.max(1, height - footerStartRow);
    for (let y = footerStartRow; y < height; y++) {
      let rowLum = 0;
      let cols = 0;
      for (let x = Math.floor(width * 0.1); x < Math.ceil(width * 0.9); x += 4) {
        const idx = (y * width + x) * 4;
        rowLum += 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        cols++;
      }
      const avgRow = rowLum / Math.max(1, cols);
      // Dark colored banner (not near-black screenshot frame border < 45)
      if (avgRow >= 45 && avgRow <= 125) {
        darkRowCount++;
      }
    }
    hasDarkFooterRibbon = darkRowCount >= Math.max(8, Math.floor(checkRows * 0.18));
  }

  // Keep raw copy of bottom ribbon before in-place modification if needed
  let invertedFooterCanvas: HTMLCanvasElement | null = null;
  if (hasDarkFooterRibbon) {
    const ribbonH = height - footerStartRow;
    const upW = Math.min(2000, Math.round(width * 1.35));
    const upH = Math.max(40, Math.round(ribbonH * 1.65));
    invertedFooterCanvas = document.createElement('canvas');
    invertedFooterCanvas.width = upW;
    invertedFooterCanvas.height = upH;
    const fCtx = invertedFooterCanvas.getContext('2d')!;
    fCtx.fillStyle = '#FFFFFF';
    fCtx.fillRect(0, 0, upW, upH);
    fCtx.drawImage(srcCanvas, 0, footerStartRow, width, ribbonH, 0, 0, upW, upH);
    const fData = fCtx.getImageData(0, 0, upW, upH);
    const fd = fData.data;
    for (let i = 0; i < fd.length; i += 4) {
      const lum = 0.299 * fd[i] + 0.587 * fd[i + 1] + 0.114 * fd[i + 2];
      // Whiten dark outer screenshot frame (< 46 lum) while inverting banner + white text
      const inv = lum < 46 ? 255 : Math.max(0, Math.min(255, Math.round(255 - lum)));
      fd[i] = inv;
      fd[i + 1] = inv;
      fd[i + 2] = inv;
    }
    fCtx.putImageData(fData, 0, 0);
  }

  // Whiten outer dark screenshot border margins (outer 4.5%) on light-mode images
  const borderX = Math.floor(width * 0.045);
  const borderY = Math.floor(height * 0.045);

  for (let y = 0; y < height; y++) {
    const isOuterY = y < borderY || y >= height - borderY;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      let outGray: number;
      if (isDarkMode) {
        outGray = 255 - lum;
      } else {
        const isOuterBorder = isOuterY || x < borderX || x >= width - borderX;
        if (isOuterBorder && lum < 75) {
          outGray = 255;
        } else {
          // Preserve red/orange/blue/yellow letters as crisp dark ink while keeping yellow highlight boxes light
          outGray = Math.min(lum, 0.35 * lum + 0.65 * g);
        }
      }

      const clamped = Math.max(0, Math.min(255, Math.round(outGray)));
      data[idx] = clamped;
      data[idx + 1] = clamped;
      data[idx + 2] = clamped;
    }
  }

  srcCtx.putImageData(srcImageData, 0, 0);

  if (!invertedFooterCanvas) {
    return srcCanvas.toDataURL('image/png');
  }

  // Combine main processed poster + inverted footer ribbon into a single OCR pass canvas
  const finalW = Math.max(width, invertedFooterCanvas.width);
  const gap = 28;
  const finalH = height + gap + invertedFooterCanvas.height;
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = finalW;
  finalCanvas.height = finalH;
  const finalCtx = finalCanvas.getContext('2d')!;
  finalCtx.fillStyle = '#FFFFFF';
  finalCtx.fillRect(0, 0, finalW, finalH);
  finalCtx.drawImage(srcCanvas, 0, 0);
  finalCtx.drawImage(invertedFooterCanvas, 0, height + gap);

  return finalCanvas.toDataURL('image/png');
}

const IGNORED_DOMAIN_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico',
  'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'csv', 'txt', 'mp3', 'mp4', 'mov', 'zip'
]);

/**
 * Normalizes a raw URL, bare shortlink, or email string into a clean navigable SavedLink.
 */
export function normalizeToSavedLink(rawInput: string, forceKind?: SavedLink['kind']): SavedLink | null {
  let cleaned = rawInput
    .trim()
    .replace(/^[<([{"'`]+/, '')
    .replace(/[>)\]}"'`,.;:!?]+$/, '')
    .trim();

  if (!cleaned || cleaned.length < 4) return null;

  // Email address
  if (/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(cleaned)) {
    return {
      url: `mailto:${cleaned}`,
      label: cleaned,
      kind: forceKind || 'email',
    };
  }
  if (cleaned.toLowerCase().startsWith('mailto:')) {
    const addr = cleaned.slice(7).trim();
    if (!addr) return null;
    return {
      url: `mailto:${addr}`,
      label: addr,
      kind: forceKind || 'email',
    };
  }

  // Explicit http/https URL
  if (/^https?:\/\//i.test(cleaned)) {
    const shortLabel = cleaned.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
    return {
      url: cleaned,
      label: forceKind === 'qr' ? `QR: ${shortLabel.slice(0, 42)}` : shortLabel.slice(0, 48),
      kind: forceKind || 'url',
    };
  }

  // Bare domain or shortlink (e.g. bit.ly/PSCXI_ApplicationForm_R6, facebook.com/IIDBR6, forms.gle/xyz)
  if (/^(?:www\.)?[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?:\/[^\s]*)?$/i.test(cleaned)) {
    const hostPart = cleaned.split('/')[0].toLowerCase();
    const tld = hostPart.split('.').pop() || '';
    if (IGNORED_DOMAIN_EXTENSIONS.has(tld) && !cleaned.includes('/')) {
      return null;
    }
    const fullUrl = `https://${cleaned}`;
    const shortLabel = cleaned.replace(/^www\./i, '').replace(/\/$/, '');
    return {
      url: fullUrl,
      label: forceKind === 'qr' ? `QR: ${shortLabel.slice(0, 42)}` : shortLabel.slice(0, 48),
      kind: forceKind || 'url',
    };
  }

  // If QR code contains non-URL text that still has a URL inside it, extract that URL
  if (forceKind === 'qr') {
    const nested = extractLinksFromText(cleaned);
    if (nested.length > 0) {
      return {
        ...nested[0],
        label: nested[0].label.startsWith('QR:') ? nested[0].label : `QR: ${nested[0].label}`,
        kind: 'qr',
      };
    }
  }

  return null;
}

/**
 * Extracts all clickable URLs, shortlinks (bit.ly, forms.gle, facebook.com, *.gov.ph, etc.),
 * and email addresses from text, deduplicating by normalized URL.
 */
export function extractLinksFromText(text: string): SavedLink[] {
  if (!text || !text.trim()) return [];

  // Heal common minor OCR spacing glitches right after "bit.ly/" or "facebook.com/" if any
  const normalizedText = text
    .replace(/\b(bit\.ly|forms\.gle|tinyurl\.com|facebook\.com|fb\.me)\s*\/\s*/gi, '$1/');

  const results: SavedLink[] = [];
  const seenUrls = new Set<string>();

  const addCandidate = (raw: string, kind?: SavedLink['kind']) => {
    const link = normalizeToSavedLink(raw, kind);
    if (!link) return;
    const key = link.url.toLowerCase().replace(/\/$/, '');
    if (seenUrls.has(key)) return;
    seenUrls.add(key);
    results.push(link);
  };

  // 1. Explicit http(s):// and www. links
  const explicitUrlRegex = /\b(?:https?:\/\/|www\.)[^\s<>"{}|\\^`[\]]+/gi;
  for (const m of normalizedText.matchAll(explicitUrlRegex)) {
    addCandidate(m[0], 'url');
  }

  // 2. Emails (before bare domain matching so email domains aren't duplicated as bare URLs)
  const emailSpans: Array<[number, number]> = [];
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  for (const m of normalizedText.matchAll(emailRegex)) {
    const start = m.index ?? 0;
    emailSpans.push([start, start + m[0].length]);
    addCandidate(m[0], 'email');
  }

  // 3. Bare shortlinks & domains (bit.ly/..., forms.gle/..., facebook.com/..., *.gov.ph, *.edu.ph, *.com/path, etc.)
  const bareDomainRegex =
    /\b(?:(?:bit\.ly|forms\.gle|tinyurl\.com|cutt\.ly|rebrand\.ly|linktr\.ee|t\.co|goo\.gl|fb\.me|m\.me|facebook\.com|instagram\.com|linkedin\.com|docs\.google\.com|drive\.google\.com|meet\.google\.com|zoom\.us|github\.com|canva\.com|figma\.com)\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+|(?:[A-Za-z0-9-]+\.)+(?:gov\.ph|edu\.ph|com\.ph|org\.ph|com|org|net|edu|gov|io|app|dev|ai)(?:\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]*)?)\b/gi;

  for (const m of normalizedText.matchAll(bareDomainRegex)) {
    const idx = m.index ?? 0;
    // Skip if part of an email address (e.g. @dict.gov.ph) or preceded by ://
    if (idx > 0 && normalizedText[idx - 1] === '@') continue;
    if (idx >= 3 && normalizedText.slice(idx - 3, idx) === '://') continue;
    const insideEmail = emailSpans.some(([s, e]) => idx >= s && idx < e);
    if (insideEmail) continue;
    addCandidate(m[0], 'url');
  }

  return results;
}

/**
 * Merges multiple SavedLink arrays while deduplicating normalized URLs (preferring 'qr' badge if same URL).
 */
export function mergeSavedLinks(...lists: Array<SavedLink[] | undefined>): SavedLink[] {
  const map = new Map<string, SavedLink>();
  for (const list of lists) {
    if (!list) continue;
    for (const item of list) {
      if (!item || !item.url) continue;
      const key = item.url.toLowerCase().replace(/\/$/, '');
      const existing = map.get(key);
      if (!existing) {
        map.set(key, item);
      } else if (item.kind === 'qr' && existing.kind !== 'qr') {
        map.set(key, item);
      }
    }
  }
  return Array.from(map.values());
}

/**
 * Decodes QR codes directly from an uploaded screenshot or camera photo (100% offline capable).
 * Combines native BarcodeDetector (if supported) + multi-region jsQR scanning for small poster QR codes.
 */
export async function decodeQrCodesFromImage(file: Blob): Promise<SavedLink[]> {
  const foundRaw: string[] = [];

  // 1. Native Chromium/Mobile BarcodeDetector (excels at stylized QR codes with center logos)
  if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
    try {
      const bitmap = await createImageBitmap(file);
      const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
      const codes = await detector.detect(bitmap);
      if (Array.isArray(codes)) {
        codes.forEach((c: any) => {
          if (c && typeof c.rawValue === 'string' && c.rawValue.trim()) {
            foundRaw.push(c.rawValue.trim());
          }
        });
      }
    } catch {
      // Continue to jsQR fallback
    }
  }

  // 2. Multi-region jsQR scan (full image + targeted poster quadrants for small embedded QR codes)
  try {
    const img = await loadBlobToImage(file);
    const scanRegion = (sx: number, sy: number, sw: number, sh: number, targetSize: number, binarize: boolean) => {
      const scale = Math.min(targetSize / Math.max(1, sw), targetSize / Math.max(1, sh));
      const cw = Math.max(64, Math.round(sw * scale));
      const ch = Math.max(64, Math.round(sh * scale));
      const c = document.createElement('canvas');
      c.width = cw;
      c.height = ch;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, cw, ch);
      ctx.imageSmoothingEnabled = !binarize;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);

      const imgData = ctx.getImageData(0, 0, cw, ch);
      if (binarize) {
        const d = imgData.data;
        let sum = 0;
        for (let i = 0; i < d.length; i += 16) {
          sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        }
        const avg = sum / Math.max(1, Math.ceil(d.length / 16));
        const thresh = Math.max(95, Math.min(165, avg * 0.88));
        for (let i = 0; i < d.length; i += 4) {
          const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          const v = lum < thresh ? 0 : 255;
          d[i] = v;
          d[i + 1] = v;
          d[i + 2] = v;
        }
      }

      const qr = jsQR(imgData.data, cw, ch, { inversionAttempts: 'attemptBoth' });
      if (qr && qr.data && qr.data.trim()) {
        foundRaw.push(qr.data.trim());
        return true;
      }
      return false;
    };

    const W = img.width;
    const H = img.height;
    // Full frame first
    const hitFull = scanRegion(0, 0, W, H, 1100, false);
    if (!hitFull) {
      // Sub-regions where poster QR codes typically sit (right-middle, bottom-right, bottom-left, center, quadrants)
      const crops: Array<[number, number, number, number]> = [
        [0.48, 0.35, 0.52, 0.55], // Right-middle (e.g. PSC poster QR placement)
        [0.42, 0.42, 0.58, 0.58], // Bottom-right quadrant
        [0.0, 0.42, 0.58, 0.58],  // Bottom-left quadrant
        [0.42, 0.0, 0.58, 0.58],  // Top-right quadrant
        [0.0, 0.0, 0.58, 0.58],   // Top-left quadrant
        [0.2, 0.2, 0.6, 0.6],     // Center crop
      ];
      for (const [rx, ry, rw, rh] of crops) {
        const found = scanRegion(
          Math.floor(W * rx),
          Math.floor(H * ry),
          Math.floor(W * rw),
          Math.floor(H * rh),
          720,
          false
        );
        if (found) break;
        const foundBin = scanRegion(
          Math.floor(W * rx),
          Math.floor(H * ry),
          Math.floor(W * rw),
          Math.floor(H * rh),
          720,
          true
        );
        if (foundBin) break;
      }
    }
  } catch (err) {
    console.warn('QR decode fallback notice:', err);
  }

  const links: SavedLink[] = [];
  for (const raw of foundRaw) {
    const normalized = normalizeToSavedLink(raw, 'qr');
    if (normalized) {
      links.push(normalized);
    }
  }
  return mergeSavedLinks(links);
}

/**
 * Renders clean, clickable 1-tap saved link pills (with geometric SVG icons — zero emojis).
 */
export function renderSavedLinksHtml(links?: SavedLink[], darkTheme: boolean = false): string {
  if (!links || links.length === 0) return '';

  const escapeAttr = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const pills = links
    .map(link => {
      const iconSvg =
        link.kind === 'qr'
          ? `<svg viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" fill="none" stroke-width="2.3"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM18 18h3v3h-3z"/></svg>`
          : link.kind === 'email'
            ? `<svg viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" fill="none" stroke-width="2.2"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22,6 12,13 2,6"/></svg>`
            : `<svg viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" fill="none" stroke-width="2.3"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;

      const bg = darkTheme ? 'rgba(56, 189, 248, 0.16)' : 'rgba(229, 46, 46, 0.09)';
      const border = darkTheme ? 'rgba(56, 189, 248, 0.45)' : 'rgba(229, 46, 46, 0.32)';
      const color = darkTheme ? '#7DD3FC' : '#C81E1E';

      return `<a
        href="${escapeAttr(link.url)}"
        target="_blank"
        rel="noopener noreferrer"
        class="saved-link-pill"
        title="Open ${escapeAttr(link.url)}"
        style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px; background: ${bg}; border: 1px solid ${border}; color: ${color}; font-size: 0.64rem; font-weight: 800; text-decoration: none; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer;"
      >${iconSvg}<span style="overflow: hidden; text-overflow: ellipsis;">${escapeAttr(link.label)}</span></a>`;
    })
    .join('');

  return `<div class="saved-links-row" style="display: flex; align-items: center; gap: 5px; flex-wrap: wrap; margin-top: 4px;">${pills}</div>`;
}

/**
 * Opens a built-in Live Camera Viewfinder modal (works on both laptop webcams & mobile front/rear cameras)
 * so the user can snap a photo of a flyer, whiteboard, or QR code directly inside the PWA.
 */
export function openLiveCameraModal(
  onCapture: (file: File) => void,
  onFallbackUpload?: () => void
): void {
  const existing = document.getElementById('cerebruv-live-camera-modal');
  if (existing) existing.remove();

  let activeStream: MediaStream | null = null;
  let facingMode: 'environment' | 'user' = 'environment';

  const stopStream = () => {
    if (activeStream) {
      activeStream.getTracks().forEach(t => t.stop());
      activeStream = null;
    }
  };

  const overlay = document.createElement('div');
  overlay.id = 'cerebruv-live-camera-modal';
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: rgba(18, 18, 22, 0.92);
    backdrop-filter: blur(8px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 16px;
  `;

  overlay.innerHTML = `
    <div style="width: min(96vw, 460px); background: #FAF7F2; border-radius: 18px; border: 1.5px solid rgba(18,18,22,0.16); overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,0.6); display: flex; flex-direction: column;">
      <!-- Modal Header -->
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid rgba(18,18,22,0.1);">
        <div style="display: flex; align-items: center; gap: 7px;">
          <span style="width: 8px; height: 8px; border-radius: 50%; background: #E52E2E;"></span>
          <strong style="font-size: 0.78rem; font-weight: 800; color: #121216; text-transform: uppercase; letter-spacing: 0.04em;">
            Live Camera Capture
          </strong>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <button type="button" id="cam-flip-btn" title="Switch Front / Rear Camera" style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 999px; border: 1px solid rgba(18,18,22,0.18); background: #F5EFEB; color: #121216; font-size: 0.68rem; font-weight: 700; cursor: pointer;">
            <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" fill="none" stroke-width="2.2">
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            Flip
          </button>
          <button type="button" id="cam-close-btn" title="Close Camera" style="width: 28px; height: 28px; border-radius: 50%; border: none; background: rgba(18,18,22,0.08); color: #121216; font-size: 1.15rem; font-weight: 700; cursor: pointer; line-height: 1;">&times;</button>
        </div>
      </div>

      <!-- Video Viewfinder -->
      <div style="position: relative; width: 100%; aspect-ratio: 4 / 3; background: #121216; display: flex; align-items: center; justify-content: center; overflow: hidden;">
        <video id="cam-video-el" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: cover; display: block;"></video>
        <div style="position: absolute; inset: 14px; border: 1.5px dashed rgba(255,255,255,0.45); border-radius: 12px; pointer-events: none;"></div>
        <div id="cam-status-msg" style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 20px; text-align: center; color: #FAF7F2; font-size: 0.78rem; font-weight: 600; background: rgba(18,18,22,0.78);">
          Starting camera...
        </div>
      </div>

      <!-- Footer Shutter & Upload Fallback -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 14px; background: #FAF7F2;">
        <button type="button" id="cam-upload-fallback-btn" style="padding: 8px 12px; border-radius: 999px; border: 1px solid rgba(18,18,22,0.2); background: #F5EFEB; color: #121216; font-size: 0.72rem; font-weight: 700; cursor: pointer;">
          Upload File Instead
        </button>
        <button type="button" id="cam-shutter-btn" disabled style="flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 16px; border-radius: 999px; border: none; background: #E52E2E; color: #FFFFFF; font-size: 0.76rem; font-weight: 800; cursor: pointer; opacity: 0.55;">
          <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none" stroke-width="2.3">
            <circle cx="12" cy="12" r="9"></circle>
            <circle cx="12" cy="12" r="4" fill="currentColor"></circle>
          </svg>
          Capture & Scan
        </button>
      </div>
    </div>
  `;

  const videoEl = overlay.querySelector<HTMLVideoElement>('#cam-video-el')!;
  const statusMsg = overlay.querySelector<HTMLDivElement>('#cam-status-msg')!;
  const shutterBtn = overlay.querySelector<HTMLButtonElement>('#cam-shutter-btn')!;
  const flipBtn = overlay.querySelector<HTMLButtonElement>('#cam-flip-btn')!;
  const closeBtn = overlay.querySelector<HTMLButtonElement>('#cam-close-btn')!;
  const fallbackBtn = overlay.querySelector<HTMLButtonElement>('#cam-upload-fallback-btn')!;

  const closeModal = () => {
    stopStream();
    overlay.remove();
    window.removeEventListener('keydown', onKeyDown);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeModal();
  };
  window.addEventListener('keydown', onKeyDown);

  const startCamera = async () => {
    stopStream();
    shutterBtn.disabled = true;
    shutterBtn.style.opacity = '0.55';
    statusMsg.style.display = 'flex';
    statusMsg.textContent = 'Accessing camera...';

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      statusMsg.textContent = 'Camera access is not supported in this browser. Use "Upload File Instead" below.';
      return;
    }

    try {
      try {
        activeStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1600 },
            height: { ideal: 1200 },
          },
          audio: false,
        });
      } catch {
        // Fallback for laptop webcams with strict constraints
        activeStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      videoEl.srcObject = activeStream;
      await videoEl.play().catch(() => {});
      statusMsg.style.display = 'none';
      shutterBtn.disabled = false;
      shutterBtn.style.opacity = '1';
    } catch {
      statusMsg.textContent =
        'Camera permission was denied or no camera was detected. Click "Upload File Instead" below to pick an image.';
    }
  };

  flipBtn.addEventListener('click', () => {
    facingMode = facingMode === 'environment' ? 'user' : 'environment';
    startCamera();
  });

  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  fallbackBtn.addEventListener('click', () => {
    closeModal();
    onFallbackUpload?.();
  });

  shutterBtn.addEventListener('click', () => {
    if (!videoEl.videoWidth || !videoEl.videoHeight) return;
    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = videoEl.videoWidth;
    captureCanvas.height = videoEl.videoHeight;
    const ctx = captureCanvas.getContext('2d')!;
    ctx.drawImage(videoEl, 0, 0, captureCanvas.width, captureCanvas.height);

    captureCanvas.toBlob(
      (blob) => {
        closeModal();
        if (blob) {
          const capturedFile = new File([blob], `Camera_Capture_${Date.now()}.jpg`, {
            type: 'image/jpeg',
          });
          onCapture(capturedFile);
        }
      },
      'image/jpeg',
      0.9
    );
  });

  document.body.appendChild(overlay);
  startCamera();
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
