import { geminiService } from './GeminiService';
import { compressImageToDataUrl, preprocessImageForOcr } from '../../utils/imageUtils';
import type { TaskCategory, UrgencyLevel } from '../../types/task';

export interface ExtractedScreenshotTask {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm (24h)
  durationMinutes: number;
  category: TaskCategory;
  urgency: UrgencyLevel;
  sourceSnippet?: string;
}

export interface ScreenshotScanResult {
  photoDataUrl: string;
  rawText: string;
  suggestedNoteSummary: string;
  engine: 'gemini-vision' | 'offline-ocr' | 'smart-rescue';
  tasks: ExtractedScreenshotTask[];
}

const CHAT_NOISE_PATTERNS: RegExp[] = [
  /^(active now|online|typing\.{0,3}|seen(\s+by.*)?|delivered|sent|reply|forward|pinned message)$/i,
  /^(type a message|write a message|aa|message\.{0,3}|search|chats|channels|members)$/i,
  /^\d{1,3}%\s*(charging)?$/i,
  /^(4g|5g|lte|wifi|vodafone|globe|smart|dito|tm|tnt|sun)(\s+\d{1,3}%)?$/i,
  /^\d{1,2}:\d{2}\s*(am|pm)?$/i,
  /^[<>+\-•*=_~|\\/.,:;!?()[\]{}\s0-9]{1,4}$/i,
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
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
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
    /\b(work|meeting|standup|client|project|buildathon|hackathon|pitch|demo|deploy|code|coding|sprint|presentation|report|office|internship|shift|team|boss|email|pull request)\b/.test(
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
    /\b(urgent|asap|deadline|due|scholarship|exam|quiz|midterm|final|defense|mandatory|required|important|critical|last call|reminder|submit|submission|today|now|immediately)\b/.test(
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

function extractTimeFromText(text: string, fallbackIndex: number = 0): { time24: string; matchedRaw?: string } {
  const lower = text.toLowerCase();

  if (/\bnoon\b/.test(lower)) {
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

  // Match 24-hour time e.g. "14:30", "08:00"
  const h24Match = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (h24Match) {
    const hour = parseInt(h24Match[1], 10);
    const min = parseInt(h24Match[2], 10);
    return {
      time24: `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`,
      matchedRaw: h24Match[0],
    };
  }

  if (/\bmorning\b/.test(lower)) return { time24: '09:00', matchedRaw: 'morning' };
  if (/\bafternoon\b/.test(lower)) return { time24: '14:00', matchedRaw: 'afternoon' };
  if (/\b(evening|tonight)\b/.test(lower)) return { time24: '19:00', matchedRaw: 'evening' };

  // Default to a sensible upcoming hour
  const now = new Date();
  const nextHour = (now.getHours() + 1 + fallbackIndex) % 24;
  return {
    time24: `${String(nextHour).padStart(2, '0')}:00`,
  };
}

function extractDateFromText(text: string, defaultDateStr: string): string {
  const lower = text.toLowerCase();
  const baseDate = defaultDateStr ? new Date(defaultDateStr + 'T00:00:00') : new Date();

  if (/\btoday\b/.test(lower)) {
    return formatLocalDate(new Date());
  }
  if (/\btomorrow\b/.test(lower)) {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);
    return formatLocalDate(tmr);
  }

  // Month name + day e.g. "Nov 10", "November 7", "7 Nov"
  const monthDayMatch = lower.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i
  );
  if (monthDayMatch) {
    const mIdx = MONTH_MAP[monthDayMatch[1].toLowerCase()];
    const dayNum = parseInt(monthDayMatch[2], 10);
    if (mIdx !== undefined && dayNum >= 1 && dayNum <= 31) {
      const d = new Date(baseDate.getFullYear(), mIdx, dayNum);
      return formatLocalDate(d);
    }
  }

  // Day + Month name e.g. "10 November"
  const dayMonthMatch = lower.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i
  );
  if (dayMonthMatch) {
    const dayNum = parseInt(dayMonthMatch[1], 10);
    const mIdx = MONTH_MAP[dayMonthMatch[2].toLowerCase()];
    if (mIdx !== undefined && dayNum >= 1 && dayNum <= 31) {
      const d = new Date(baseDate.getFullYear(), mIdx, dayNum);
      return formatLocalDate(d);
    }
  }

  // Weekday name e.g. "on Monday", "this Friday"
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

  return defaultDateStr;
}

function extractDurationMinutes(text: string, category: TaskCategory): number {
  const minMatch = text.match(/\b(\d{1,3})\s*(?:mins?|minutes?)\b/i);
  if (minMatch) {
    return Math.min(360, Math.max(15, parseInt(minMatch[1], 10)));
  }
  const hrMatch = text.match(/\b(\d(?:\.\d)?)\s*(?:hrs?|hours?)\b/i);
  if (hrMatch) {
    return Math.min(360, Math.max(15, Math.round(parseFloat(hrMatch[1]) * 60)));
  }
  if (category === 'study' || category === 'work') return 60;
  if (category === 'event') return 90;
  return 45;
}

function cleanTaskTitle(line: string): string {
  let cleaned = line
    .replace(/^[\s•*\-–—>#0-9.)[\]]+/, '')
    .replace(/\b(announcement|reminder|notice|heads up|important|urgent|attention|fyi)\s*[:\-–—]?\s*/gi, '')
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

  if (cleaned.length > 78) {
    cleaned = cleaned.slice(0, 75).trim() + '...';
  }
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return cleaned;
}

export class ScreenshotScannerService {
  /**
   * Parses raw announcement / schedule text (from OCR or user paste/edit) into
   * structured, editable task suggestions for the Focus Orbit & Mind Graph.
   */
  parseAnnouncementTextToTasks(
    rawText: string,
    fileName: string,
    defaultDateStr: string
  ): ExtractedScreenshotTask[] {
    const lines = rawText
      .split(/\r?\n/)
      .map(l => l.replace(/[|¦~`^]/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(l => {
        if (l.length < 4) return false;
        const alphaCount = (l.match(/[a-zA-Z]/g) || []).length;
        if (alphaCount < 3) return false;
        return !CHAT_NOISE_PATTERNS.some(rx => rx.test(l));
      });

    const combinedText = lines.join(' ');
    const globalDate = extractDateFromText(combinedText, defaultDateStr);
    const globalTime = extractTimeFromText(combinedText, 0);

    const tasks: ExtractedScreenshotTask[] = [];
    const seenTitles = new Set<string>();

    // Score lines by how actionable they look (deadlines, times, verbs, academic/work keywords)
    const scoredLines = lines.map((line, idx) => {
      let score = 0;
      const lower = line.toLowerCase();
      if (/\b(deadline|due|submit|submission|scholarship|exam|quiz|meeting|class|orientation|seminar|register|pass|bring|prepare|complete|attend|defense|pitch|project|assignment|homework|schedule)\b/.test(lower)) {
        score += 4;
      }
      if (/\b(1[0-2]|0?[1-9])(?:[:.][0-5]\d)?\s*(a\.?m\.?|p\.?m\.?)\b/i.test(line) || /\b([01]?\d|2[0-3]):[0-5]\d\b/.test(line)) {
        score += 3;
      }
      if (/^[\s•*\-–—0-9.)]+/.test(line)) {
        score += 2;
      }
      if (line.length >= 10 && line.length <= 95) {
        score += 1;
      }
      return { line, idx, score };
    });

    // Pick top candidate lines (preserving chronological order)
    const topCandidates = scoredLines
      .filter(item => item.score >= 2 || scoredLines.length <= 3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .sort((a, b) => a.idx - b.idx);

    topCandidates.forEach((item, index) => {
      // Combine with adjacent line context if current line is only a date/time label
      const contextLine =
        lines[item.idx + 1] && item.line.length < 22
          ? `${item.line} - ${lines[item.idx + 1]}`
          : item.line;

      const title = cleanTaskTitle(contextLine);
      if (!title || title.length < 4) return;
      const normKey = title.toLowerCase();
      if (seenTitles.has(normKey)) return;
      seenTitles.add(normKey);

      const category = inferCategoryFromText(contextLine + ' ' + combinedText);
      const urgency = inferUrgencyFromText(contextLine + ' ' + combinedText);
      const lineTime = extractTimeFromText(contextLine, index);
      const startTime = lineTime.matchedRaw ? lineTime.time24 : index === 0 ? globalTime.time24 : lineTime.time24;
      const date = extractDateFromText(contextLine, globalDate);
      const durationMinutes = extractDurationMinutes(contextLine, category);

      tasks.push({
        id: `scan_task_${Date.now()}_${index}`,
        title,
        date,
        startTime,
        durationMinutes,
        category,
        urgency,
        sourceSnippet: contextLine,
      });
    });

    // Zero-Fail Fallback: If OCR text was sparse or purely conversational, create 1 smart editable task
    if (tasks.length === 0) {
      const cleanFileLabel = fileName
        .replace(/\.[^/.]+$/, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\b(screenshot|img|image|photo|pic|whatsapp|messenger|fb|received)\b/gi, '')
        .replace(/\b\d{4,}\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      const fallbackSource = lines[0] || cleanFileLabel || 'Review Announcement Screenshot';
      const title = cleanTaskTitle(fallbackSource) || 'Review Announcement Screenshot';
      const category = inferCategoryFromText(fallbackSource + ' ' + fileName);
      const urgency = inferUrgencyFromText(fallbackSource + ' ' + fileName);

      tasks.push({
        id: `scan_task_${Date.now()}_0`,
        title,
        date: globalDate || defaultDateStr,
        startTime: globalTime.time24,
        durationMinutes: extractDurationMinutes(fallbackSource, category),
        category,
        urgency,
        sourceSnippet: lines.slice(0, 2).join(' • ') || `From screenshot "${fileName}"`,
      });
    }

    return tasks;
  }

  /**
   * Runs client-side OCR (native TextDetector if supported, else Tesseract.js WASM worker)
   * on the preprocessed screenshot image. Works 100% on localhost and offline once cached.
   */
  private async runClientSideOcr(
    file: Blob,
    onProgress?: (statusText: string) => void
  ): Promise<string> {
    // 1. Try Experimental Chromium Shape Detection API (TextDetector) if enabled in browser
    if (typeof window !== 'undefined' && 'TextDetector' in window) {
      try {
        onProgress?.('Scanning screenshot text with browser TextDetector...');
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

    // 2. Run Tesseract.js WebAssembly OCR on high-contrast preprocessed canvas
    try {
      onProgress?.('Enhancing screenshot contrast for offline OCR...');
      const preprocessedDataUrl = await preprocessImageForOcr(file, 1150);

      onProgress?.('Starting on-device OCR engine...');
      const Tesseract = await import('tesseract.js');
      const recognizePromise = Tesseract.recognize(preprocessedDataUrl, 'eng', {
        logger: (msg: { status?: string; progress?: number }) => {
          if (msg.status === 'recognizing text' && typeof msg.progress === 'number') {
            const pct = Math.round(msg.progress * 100);
            onProgress?.(`Reading announcement screenshot (${pct}%)...`);
          } else if (msg.status) {
            onProgress?.(`OCR: ${msg.status}...`);
          }
        },
      });

      // 14-second safety timeout so UI never hangs
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 14000));
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
   * Main entry point for scanning an uploaded screenshot or photo.
   * Uses Gemini Vision when online in production, and automatically falls back to
   * client-side OCR + Smart Announcement Parser on localhost or offline.
   */
  async scanScreenshot(
    file: File,
    defaultDateStr: string,
    onProgress?: (statusText: string) => void
  ): Promise<ScreenshotScanResult> {
    onProgress?.('Compressing screenshot preview...');
    const photoDataUrl = await compressImageToDataUrl(file, 720, 0.72);

    const isLocalhost =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine;

    // Layer 1: Try Cloud Gemini Vision when online and not on un-attested localhost
    if (isOnline && !isLocalhost) {
      try {
        onProgress?.('Scanning screenshot with Gemini Vision AI...');
        const geminiItems = await geminiService.extractTasksFromImage(file);
        if (geminiItems.length > 0) {
          const now = new Date();
          const tasks: ExtractedScreenshotTask[] = geminiItems.map((item, idx) => {
            const nextHour = (now.getHours() + 1 + idx) % 24;
            return {
              id: `gemini_task_${Date.now()}_${idx}`,
              title: item.title || 'Extracted Task',
              date: defaultDateStr,
              startTime: `${String(nextHour).padStart(2, '0')}:00`,
              durationMinutes: item.durationMinutes || 45,
              category: item.category || 'study',
              urgency: item.urgency || 'medium',
              sourceSnippet: `Detected by Gemini Vision from "${file.name}"`,
            };
          });
          const summary = tasks.map(t => `${t.title} (${t.startTime})`).join(' • ');
          return {
            photoDataUrl,
            rawText: summary,
            suggestedNoteSummary: `Screenshot "${file.name}": ${summary}`,
            engine: 'gemini-vision',
            tasks,
          };
        }
      } catch {
        // Fall through to client-side OCR
      }
    }

    // Layer 2: Client-Side On-Device OCR + Smart Announcement Parser
    const ocrText = await this.runClientSideOcr(file, onProgress);
    const tasks = this.parseAnnouncementTextToTasks(ocrText, file.name, defaultDateStr);

    const cleanOcrLines = ocrText
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length >= 4 && !CHAT_NOISE_PATTERNS.some(rx => rx.test(l)));

    const suggestedNoteSummary =
      cleanOcrLines.length > 0
        ? cleanOcrLines.slice(0, 3).join(' — ').slice(0, 220)
        : `Screenshot note: ${tasks[0]?.title || file.name}`;

    return {
      photoDataUrl,
      rawText: cleanOcrLines.join('\n'),
      suggestedNoteSummary,
      engine: cleanOcrLines.length > 0 ? 'offline-ocr' : 'smart-rescue',
      tasks,
    };
  }
}

export const screenshotScannerService = new ScreenshotScannerService();
