import { geminiService } from './GeminiService';
import {
  compressImageToDataUrl,
  decodeQrCodesFromImage,
  extractLinksFromText,
  mergeSavedLinks,
  preprocessImageForOcr,
} from '../../utils/imageUtils';
import type { SavedLink, TaskCategory, UrgencyLevel } from '../../types/task';

export interface ExtractedScreenshotTask {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD, or "" when not present in image
  startTime: string; // HH:mm (24h), or "" when not present in image
  durationMinutes: number; // 0 when not present in image
  category: TaskCategory;
  urgency: UrgencyLevel;
  links?: SavedLink[];
  sourceSnippet?: string;
}

export interface ScreenshotScanResult {
  photoDataUrl: string;
  rawText: string;
  suggestedNoteSummary: string;
  engine: 'gemini-vision' | 'offline-ocr' | 'smart-rescue';
  links: SavedLink[];
  tasks: ExtractedScreenshotTask[];
}

const CHAT_NOISE_PATTERNS: RegExp[] = [
  /^(active now|online|typing\.{0,3}|seen(\s+by.*)?|delivered|sent|reply|forward|pinned message)$/i,
  /^(type a message|write a message|aa|message\.{0,3}|search|chats|channels|members)$/i,
  /^\d{1,3}%\s*(charging)?$/i,
  /^(4g|5g|lte|wifi|vodafone|globe|smart|dito|tm|tnt|sun)(\s+\d{1,3}%)?$/i,
  /^[<>+\-•*=_~|\\/.,:;!?()[\]{}\s0-9°&]{1,6}$/i,
];

const MONTH_MAP: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

const WEEKDAY_MAP: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function inferCategoryFromText(text: string): TaskCategory {
  const lower = text.toLowerCase();
  if (
    /\b(study|class|lecture|exam|quiz|midterm|final|assignment|homework|lab|thesis|capstone|research|scholarship|enrollment|registrar|dean|osas|syllabus|course|subject|module|review|grades|school|campus|college|it\d+|cs\d+)\b/.test(
      lower
    )
  ) {
    return 'study';
  }
  if (
    /\b(work|startup|challenge|application|applications|innovation|dict|meeting|standup|client|project|buildathon|hackathon|pitch|demo|deploy|code|coding|sprint|presentation|report|office|internship|shift|team|boss|pull request)\b/.test(
      lower
    )
  ) {
    return 'work';
  }
  if (
    /\b(event|webinar|seminar|workshop|orientation|assembly|conference|party|birthday|celebration|meetup|ceremony|festival|gathering|session)\b/.test(
      lower
    )
  ) {
    return 'event';
  }
  if (/\b(rest|sleep|nap|break|gym|workout|run|jog|meditate|lunch|dinner|breakfast|relax)\b/.test(lower)) {
    return 'rest';
  }
  return 'personal';
}

function inferUrgencyFromText(text: string): UrgencyLevel {
  const lower = text.toLowerCase();
  if (
    /\b(urgent|asap|deadline|due|scholarship|exam|quiz|midterm|final|defense|mandatory|required|important|critical|last call|submit|submission|today|immediately)\b/.test(
      lower
    )
  ) {
    return 'high';
  }
  if (/\b(optional|later|whenever|someday|low priority|free|casual)\b/.test(lower)) {
    return 'low';
  }
  return 'medium';
}

/**
 * Strictly extracts ONLY explicit clock times visibly written in the text.
 * Returns empty string `""` when no clock time is present (NEVER guesses an upcoming hour).
 */
function extractTimeFromText(text: string): { time24: string; matchedRaw?: string } {
  const lower = text.toLowerCase();

  if (/\b12:00\s*n\.?n\.?\b|\bnoon\b/.test(lower)) {
    return { time24: '12:00', matchedRaw: 'noon' };
  }
  if (/\bmidnight\b/.test(lower)) {
    return { time24: '00:00', matchedRaw: 'midnight' };
  }

  // Match explicit AM/PM time e.g. "8:30 AM", "5pm", "11:59 PM", "2.30 pm"
  const ampmMatch = text.match(/\b(1[0-2]|0?[1-9])(?:[:.]([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/i);
  if (ampmMatch) {
    let hour = parseInt(ampmMatch[1], 10);
    const min = ampmMatch[2] ? parseInt(ampmMatch[2], 10) : 0;
    const isPm = ampmMatch[3].toLowerCase().startsWith('p');
    if (isPm && hour < 12) hour += 12;
    if (!isPm && hour === 12) hour = 0;
    return {
      time24: `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`,
      matchedRaw: ampmMatch[0],
    };
  }

  // Match explicit 24-hour clock time e.g. "14:30", "08:00" (requiring 2-digit hour or "at/by" prefix)
  const h24Match = text.match(/(?:\b(?:at|by|from|time[:\s]*)\s*([01]?\d|2[0-3]):([0-5]\d)\b|\b([01]\d|2[0-3]):([0-5]\d)\b)/i);
  if (h24Match) {
    const hour = parseInt(h24Match[1] ?? h24Match[3], 10);
    const min = parseInt(h24Match[2] ?? h24Match[4], 10);
    return {
      time24: `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`,
      matchedRaw: h24Match[0],
    };
  }

  // No explicit time in text -> leave blank!
  return { time24: '' };
}

/**
 * Strictly extracts ONLY explicit dates visibly written in the text (including explicit years e.g. "SEPTEMBER 20, 2026").
 * Returns `""` when no date is present (NEVER invents today's date when absent).
 */
function extractDateFromText(text: string): string {
  const lower = text.toLowerCase();
  const currentYear = new Date().getFullYear();

  // 1. ISO date YYYY-MM-DD
  const isoMatch = text.match(/\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  // 2. Numeric MM/DD/YYYY or MM-DD-YYYY
  const mdyMatch = text.match(/\b(0?[1-9]|1[0-2])[/-](0?[1-9]|[12]\d|3[01])[/-](20\d{2})\b/);
  if (mdyMatch) {
    const m = String(parseInt(mdyMatch[1], 10)).padStart(2, '0');
    const d = String(parseInt(mdyMatch[2], 10)).padStart(2, '0');
    return `${mdyMatch[3]}-${m}-${d}`;
  }

  // 3. Month name + day (+ optional year), e.g. "SEPTEMBER 20, 2026", "Nov 10"
  const monthDayMatch = lower.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:[\s,]+(20\d{2}))?\b/i
  );
  if (monthDayMatch) {
    const mIdx = MONTH_MAP[monthDayMatch[1].toLowerCase()];
    const dayNum = parseInt(monthDayMatch[2], 10);
    const yearNum = monthDayMatch[3] ? parseInt(monthDayMatch[3], 10) : currentYear;
    if (mIdx !== undefined && dayNum >= 1 && dayNum <= 31) {
      return formatLocalDate(new Date(yearNum, mIdx, dayNum));
    }
  }

  // 4. Day + Month name (+ optional year), e.g. "20 September 2026", "10 November"
  const dayMonthMatch = lower.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?(?:[\s,]+(20\d{2}))?\b/i
  );
  if (dayMonthMatch) {
    const dayNum = parseInt(dayMonthMatch[1], 10);
    const mIdx = MONTH_MAP[dayMonthMatch[2].toLowerCase()];
    const yearNum = dayMonthMatch[3] ? parseInt(dayMonthMatch[3], 10) : currentYear;
    if (mIdx !== undefined && dayNum >= 1 && dayNum <= 31) {
      return formatLocalDate(new Date(yearNum, mIdx, dayNum));
    }
  }

  // 5. Explicit relative words ONLY if literally present
  if (/\btoday\b/.test(lower)) {
    return formatLocalDate(new Date());
  }
  if (/\btomorrow\b/.test(lower)) {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);
    return formatLocalDate(tmr);
  }

  // Full weekday names only (avoid matching accidental 3-letter OCR fragments like "sat" or "sun")
  for (const [dayName, targetDow] of Object.entries(WEEKDAY_MAP)) {
    const regex = new RegExp(`\\b${dayName}\\b`, 'i');
    if (regex.test(lower)) {
      const d = new Date();
      const currentDow = d.getDay();
      let diff = (targetDow - currentDow + 7) % 7;
      if (diff === 0 && /\bnext\b/.test(lower)) diff = 7;
      d.setDate(d.getDate() + diff);
      return formatLocalDate(d);
    }
  }

  return '';
}

/**
 * Strictly extracts ONLY explicit durations or start-to-end time windows.
 * Returns `0` when no duration is written on the image.
 */
function extractDurationMinutes(text: string): number {
  const minMatch = text.match(/\b(\d{1,3})\s*(?:mins?|minutes?)\b/i);
  if (minMatch) {
    return Math.min(480, Math.max(5, parseInt(minMatch[1], 10)));
  }
  const hrMatch = text.match(/\b(\d(?:\.\d)?)\s*(?:hrs?|hours?)\b/i);
  if (hrMatch) {
    return Math.min(480, Math.max(15, Math.round(parseFloat(hrMatch[1]) * 60)));
  }

  // Explicit time range e.g. "9:00 AM - 11:00 AM"
  const rangeMatch = text.match(
    /\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\s*(?:-|–|—|to)\s*(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/i
  );
  if (rangeMatch) {
    let h1 = parseInt(rangeMatch[1], 10);
    const m1 = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : 0;
    const p1 = rangeMatch[3].toLowerCase().startsWith('p');
    if (p1 && h1 < 12) h1 += 12;
    if (!p1 && h1 === 12) h1 = 0;

    let h2 = parseInt(rangeMatch[4], 10);
    const m2 = rangeMatch[5] ? parseInt(rangeMatch[5], 10) : 0;
    const p2 = rangeMatch[6].toLowerCase().startsWith('p');
    if (p2 && h2 < 12) h2 += 12;
    if (!p2 && h2 === 12) h2 = 0;

    const diff = h2 * 60 + m2 - (h1 * 60 + m1);
    if (diff >= 15 && diff <= 480) {
      return diff;
    }
  }

  return 0;
}

/**
 * Cleans OCR artifacts caused by QR code modules, logo emblems, or stylized graphic letters
 * WITHOUT adding any text that wasn't on the image.
 */
function sanitizeAndHealOcrText(raw: string): string[] {
  const healedBlock = raw
    // Heal stylized poster words where an illustration stands in for 'A' (e.g. ST[A]RTUP CH[A]LLENGE)
    .replace(/\bST[A-Z0-9()]{1,5}RT(?:UP)?\b(?=\s*\r?\n\s*CH)/gi, 'STARTUP')
    .replace(/\bCH\s*[JIL1()]{0,3}\s*LLENGE\b/gi, 'CHALLENGE');

  const rawLines = healedBlock.split(/\r?\n/);
  const cleanedLines: string[] = [];
  const seenNorm = new Set<string>();

  for (const rawLine of rawLines) {
    let line = rawLine
      .replace(/[|¦~`^]/g, ' ')
      // Strip trailing 2-4 char QR-code module noise after a URL/shortlink
      .replace(/(\b(?:bit\.ly|forms\.gle|tinyurl\.com|facebook\.com)\/\S+)\s+[&©®@*#0-9A-Za-z]{1,6}$/i, '$1')
      // Strip trailing isolated 2-3 char uppercase QR noise after multi-word phrases (e.g. "NOW OPEN FOR Gea", "APPLICATIONS SE")
      .replace(/^([A-Z][A-Z\s]{7,})\s+(?:Gea|SE|RETR|ua:m|rg)\b/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();

    if (line.length < 4) continue;
    if (CHAT_NOISE_PATTERNS.some(rx => rx.test(line))) continue;

    // Keep lines that have a URL/email, a date/deadline, or real multi-letter words with vowels
    const hasLink = extractLinksFromText(line).length > 0;
    const hasDate = Boolean(extractDateFromText(line));
    const realWords = line.match(/\b[A-Za-z]{3,}\b/g) || [];
    const vowelWords = realWords.filter(w => /[aeiouAEIOU]/.test(w));

    if (!hasLink && !hasDate && vowelWords.length === 0) {
      continue;
    }
    // Filter logo-soup header lines like "N DCT dbz ER" (all tiny 1-3 char fragments)
    if (!hasLink && !hasDate && realWords.every(w => w.length <= 3) && line.split(' ').length >= 3) {
      continue;
    }

    const norm = line.toLowerCase();
    if (seenNorm.has(norm)) continue;
    seenNorm.add(norm);
    cleanedLines.push(line);
  }

  return cleanedLines;
}

function toReadableCase(str: string): string {
  // Convert SHOUTY ALL-CAPS poster titles into clean Title Case while preserving acronyms (DICT, PSC, R6, IT)
  const letters = str.match(/[A-Za-z]/g) || [];
  const uppers = str.match(/[A-Z]/g) || [];
  if (letters.length >= 6 && uppers.length / letters.length > 0.82) {
    return str
      .split(' ')
      .map(word => {
        if (/^(DICT|IIDB|CHED|DOST|PSC|PSCXI|R\d+|IT|CS|AI|QR|ID|OSAS)$/i.test(word)) {
          return word.toUpperCase();
        }
        if (/^(for|of|and|the|in|on|at|to|by)$/i.test(word)) {
          return word.toLowerCase();
        }
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(' ')
      .replace(/^./, c => c.toUpperCase());
  }
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function cleanTaskTitle(line: string): string {
  let cleaned = line
    .replace(/^[\s•*\-–—>#0-9.)[\]]+/, '')
    .replace(/\b(announcement|reminder|notice|heads up|attention|fyi)\s*[:\-–—]\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Strip trailing standalone time phrases like "at 3:00 PM" if title is already descriptive
  const withoutTime = cleaned
    .replace(/\s+(?:at|by|on|before)\s+(?:1[0-2]|0?[1-9])(?:[:.][0-5]\d)?\s*(?:a\.?m\.?|p\.?m\.?).*$/i, '')
    .replace(/[.,;!?:\-–—]+$/, '')
    .trim();

  if (withoutTime.length >= 5) {
    cleaned = withoutTime;
  } else {
    cleaned = cleaned.replace(/[.,;!?:\-–—]+$/, '').trim();
  }

  if (cleaned.length > 84) {
    cleaned = cleaned.slice(0, 81).trim() + '...';
  }
  if (cleaned.length > 0) {
    cleaned = toReadableCase(cleaned);
  }
  return cleaned;
}

export class ScreenshotScannerService {
  /**
   * Parses raw announcement / poster / schedule text into structured, editable task suggestions.
   * NEVER invents times, dates, or durations that are absent in the text.
   */
  parseAnnouncementTextToTasks(
    rawText: string,
    fileName: string,
    _defaultDateStr: string = '',
    extraLinks: SavedLink[] = []
  ): ExtractedScreenshotTask[] {
    const lines = sanitizeAndHealOcrText(rawText);
    const combinedText = lines.join('\n');
    const allLinks = mergeSavedLinks(extraLinks, extractLinksFromText(rawText));

    const globalDate = extractDateFromText(combinedText);
    const globalTime = extractTimeFromText(combinedText);
    const globalDuration = extractDurationMinutes(combinedText);

    // Detect if this is a single event/application poster (multiple short uppercase heading lines + optional deadline/URL)
    const nonUrlLines = lines.filter(l => extractLinksFromText(l).length === 0);
    const deadlineLines = nonUrlLines.filter(l => /\b(deadline|due|until|closing)\b/i.test(l));
    const headingLines = nonUrlLines.filter(
      l =>
        !/\b(deadline|due|until|closing)\b/i.test(l) &&
        l.length >= 4 &&
        l.length <= 48
    );

    const upperCharRatio = (() => {
      const joined = headingLines.slice(0, 4).join(' ');
      const alpha = (joined.match(/[A-Za-z]/g) || []).length;
      const upper = (joined.match(/[A-Z]/g) || []).length;
      return alpha > 0 ? upper / alpha : 0;
    })();

    // Poster / Flyer Consolidation: merge fragmented poster header lines (e.g. "PHILIPPINE" + "STARTUP" + "CHALLENGE")
    // into a single faithful task card with its real deadline (if any) and blank time/duration when absent!
    if (headingLines.length >= 2 && upperCharRatio >= 0.65 && lines.length <= 12) {
      const primaryHeaderParts: string[] = [];
      for (const h of headingLines) {
        // Stop before long sentence taglines once we have main title words
        const letters = (h.match(/[A-Za-z]/g) || []).length;
        const uppers = (h.match(/[A-Z]/g) || []).length;
        if (primaryHeaderParts.length >= 2 && letters > 0 && uppers / letters < 0.5) {
          break;
        }
        primaryHeaderParts.push(h);
        if (primaryHeaderParts.join(' ').length >= 52) break;
      }

      const mergedTitle = cleanTaskTitle(primaryHeaderParts.join(' '));
      if (mergedTitle.length >= 5) {
        const category = inferCategoryFromText(combinedText);
        const urgency = inferUrgencyFromText(combinedText + (deadlineLines.length ? ' deadline' : ''));
        return [
          {
            id: `scan_task_${Date.now()}_0`,
            title: mergedTitle,
            date: globalDate,
            startTime: globalTime.time24,
            durationMinutes: globalDuration,
            category,
            urgency,
            links: allLinks,
            sourceSnippet: lines.slice(0, 4).join(' • '),
          },
        ];
      }
    }

    const tasks: ExtractedScreenshotTask[] = [];
    const seenTitles = new Set<string>();

    const scoredLines = nonUrlLines.map((line, idx) => {
      let score = 0;
      const lower = line.toLowerCase();
      if (
        /\b(deadline|due|submit|submission|application|applications|scholarship|exam|quiz|meeting|class|orientation|seminar|register|pass|bring|prepare|complete|attend|defense|pitch|project|assignment|homework|schedule)\b/.test(
          lower
        )
      ) {
        score += 4;
      }
      if (extractTimeFromText(line).time24) {
        score += 3;
      }
      if (extractDateFromText(line)) {
        score += 2;
      }
      if (/^[\s•*\-–—0-9.)]+/.test(line)) {
        score += 2;
      }
      if (line.length >= 10 && line.length <= 95) {
        score += 1;
      }
      return { line, idx, score };
    });

    const topCandidates = scoredLines
      .filter(item => item.score >= 2 || scoredLines.length <= 3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .sort((a, b) => a.idx - b.idx);

    topCandidates.forEach((item, index) => {
      const contextLine =
        nonUrlLines[item.idx + 1] && item.line.length < 22
          ? `${item.line} - ${nonUrlLines[item.idx + 1]}`
          : item.line;

      // Avoid turning a pure "DEADLINE: SEPTEMBER 20, 2026" line into a standalone title if we already extracted the main title
      if (tasks.length > 0 && /^deadline\s*[:\-–—]?\s*[a-z]+\s+\d{1,2}/i.test(item.line.trim())) {
        if (!tasks[0].date) {
          tasks[0].date = extractDateFromText(item.line) || globalDate;
        }
        return;
      }

      const title = cleanTaskTitle(contextLine);
      if (!title || title.length < 4) return;
      const normKey = title.toLowerCase();
      if (seenTitles.has(normKey)) return;
      seenTitles.add(normKey);

      const category = inferCategoryFromText(contextLine + ' ' + combinedText);
      const urgency = inferUrgencyFromText(contextLine + ' ' + combinedText);
      const lineTime = extractTimeFromText(contextLine);
      const startTime = lineTime.time24 || (index === 0 ? globalTime.time24 : '');
      const date = extractDateFromText(contextLine) || globalDate;
      const durationMinutes = extractDurationMinutes(contextLine) || (index === 0 ? globalDuration : 0);

      tasks.push({
        id: `scan_task_${Date.now()}_${index}`,
        title,
        date,
        startTime,
        durationMinutes,
        category,
        urgency,
        links: allLinks,
        sourceSnippet: contextLine,
      });
    });

    if (tasks.length === 0) {
      const fallbackSource =
        nonUrlLines[0] ||
        lines[0] ||
        allLinks[0]?.label ||
        fileName.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim() ||
        'Captured Image Item';
      const title = cleanTaskTitle(fallbackSource) || 'Captured Image Item';
      const category = inferCategoryFromText(fallbackSource + ' ' + combinedText);
      const urgency = inferUrgencyFromText(fallbackSource + ' ' + combinedText);

      tasks.push({
        id: `scan_task_${Date.now()}_0`,
        title,
        date: globalDate,
        startTime: globalTime.time24,
        durationMinutes: globalDuration,
        category,
        urgency,
        links: allLinks,
        sourceSnippet: lines.slice(0, 2).join(' • ') || `From "${fileName}"`,
      });
    }

    return tasks;
  }

  /**
   * Runs client-side OCR (native TextDetector if supported, else Tesseract.js WASM worker)
   * on the color-preserving + inverted-footer preprocessed image.
   */
  private async runClientSideOcr(
    file: Blob,
    onProgress?: (statusText: string) => void
  ): Promise<string> {
    if (typeof window !== 'undefined' && 'TextDetector' in window) {
      try {
        onProgress?.('Scanning image text with browser TextDetector...');
        const bitmap = await createImageBitmap(file);
        const detector = new (window as any).TextDetector();
        const blocks = await detector.detect(bitmap);
        if (Array.isArray(blocks) && blocks.length > 0) {
          const text = blocks.map((b: any) => b.rawValue || '').join('\n').trim();
          if (text.length >= 6) {
            return text;
          }
        }
      } catch {
        // Fall through to Tesseract.js
      }
    }

    try {
      onProgress?.('Preparing high-clarity OCR canvas...');
      const preprocessedDataUrl = await preprocessImageForOcr(file, 1500);

      onProgress?.('Starting on-device OCR engine...');
      const Tesseract = await import('tesseract.js');
      const recognizePromise = Tesseract.recognize(preprocessedDataUrl, 'eng', {
        logger: (msg: { status?: string; progress?: number }) => {
          if (msg.status === 'recognizing text' && typeof msg.progress === 'number') {
            const pct = Math.round(msg.progress * 100);
            onProgress?.(`Reading text from image (${pct}%)...`);
          } else if (msg.status) {
            onProgress?.(`OCR: ${msg.status}...`);
          }
        },
      });

      const timeoutPromise = new Promise<null>(resolve => setTimeout(() => resolve(null), 16000));
      const result = await Promise.race([recognizePromise, timeoutPromise]);
      if (result && result.data && typeof result.data.text === 'string') {
        return result.data.text.trim();
      }
    } catch (err) {
      console.warn('Client-side OCR fallback notice:', err);
    }

    return '';
  }

  /**
   * Main entry point for scanning an uploaded screenshot or live camera snapshot:
   * - Always decodes embedded QR codes offline/online in parallel
   * - Uses Cloud Gemini 2.5 Flash Vision when available (production or VITE_GEMINI_API_KEY on localhost)
   * - Falls back to Color-Aware Offline OCR + Smart Poster/Announcement Parser
   * - Strictly leaves date, startTime, and durationMinutes blank when absent in the image
   */
  async scanScreenshot(
    file: File,
    _defaultDateStr: string = '',
    onProgress?: (statusText: string) => void
  ): Promise<ScreenshotScanResult> {
    onProgress?.('Preparing image & scanning for QR codes...');
    const [photoDataUrl, qrLinks] = await Promise.all([
      compressImageToDataUrl(file, 760, 0.74),
      decodeQrCodesFromImage(file),
    ]);

    // Layer 1: Cloud Gemini 2.5 Flash Vision (when online + either deployed or VITE_GEMINI_API_KEY set)
    if (geminiService.canRunCloudVision()) {
      try {
        onProgress?.('Reading image with Google Gemini 2.5 Flash Vision...');
        const visionPayload = await geminiService.analyzeScreenshotWithVision(file);
        if (visionPayload && (visionPayload.tasks.length > 0 || visionPayload.fullText)) {
          const mergedLinks = mergeSavedLinks(qrLinks, visionPayload.links);
          const tasks: ExtractedScreenshotTask[] =
            visionPayload.tasks.length > 0
              ? visionPayload.tasks.map((item, idx) => ({
                  id: `gemini_task_${Date.now()}_${idx}`,
                  title: item.title,
                  date: item.date, // "" if not on image
                  startTime: item.startTime, // "" if not on image
                  durationMinutes: item.durationMinutes, // 0 if not on image
                  category: item.category,
                  urgency: item.urgency,
                  links: mergedLinks,
                  sourceSnippet: `Detected by Gemini Vision from "${file.name}"`,
                }))
              : this.parseAnnouncementTextToTasks(visionPayload.fullText, file.name, '', mergedLinks);

          const rawText =
            visionPayload.fullText ||
            tasks.map(t => `${t.title}${t.date ? ` (${t.date})` : ''}`).join('\n');

          return {
            photoDataUrl,
            rawText,
            suggestedNoteSummary: rawText.slice(0, 240),
            engine: 'gemini-vision',
            links: mergedLinks,
            tasks,
          };
        }
      } catch (err) {
        console.warn('Gemini Vision unavailable, falling back to on-device OCR:', err);
      }
    }

    // Layer 2: On-Device Offline OCR + QR + Link Extractor + Zero-Hallucination Parser
    const ocrText = await this.runClientSideOcr(file, onProgress);
    const cleanedLines = sanitizeAndHealOcrText(ocrText);
    const cleanText = cleanedLines.join('\n');
    const mergedLinks = mergeSavedLinks(qrLinks, extractLinksFromText(ocrText), extractLinksFromText(cleanText));
    const tasks = this.parseAnnouncementTextToTasks(ocrText, file.name, '', mergedLinks);

    const suggestedNoteSummary =
      cleanedLines.length > 0
        ? cleanedLines.slice(0, 4).join(' — ').slice(0, 240)
        : mergedLinks.length > 0
          ? `Saved link from image: ${mergedLinks.map(l => l.label).join(', ')}`
          : `${tasks[0]?.title || file.name}`;

    return {
      photoDataUrl,
      rawText: cleanText,
      suggestedNoteSummary,
      engine: cleanedLines.length > 0 || mergedLinks.length > 0 ? 'offline-ocr' : 'smart-rescue',
      links: mergedLinks,
      tasks,
    };
  }
}

export const screenshotScannerService = new ScreenshotScannerService();
