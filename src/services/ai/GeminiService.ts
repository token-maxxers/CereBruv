import { getAI, GoogleAIBackend, getGenerativeModel, Schema } from 'firebase/ai';
import { app } from '../firebase';
import { sortTasksSmartly, timeStringToFractionalHour } from '../../components/FocusOrbit/orbitCalculator';
import { extractLinksFromText, mergeSavedLinks, normalizeToSavedLink } from '../../utils/imageUtils';
import type { SavedLink, Task, TaskCategory, UrgencyLevel } from '../../types/task';
import type { IAIService } from './IAIService';

export interface GeminiVisionScanPayload {
  fullText: string;
  links: SavedLink[];
  tasks: Array<{
    title: string;
    category: TaskCategory;
    date: string;        // YYYY-MM-DD or "" if not shown in image
    startTime: string;   // HH:mm (24h) or "" if not shown in image
    durationMinutes: number; // 0 if not shown in image
    urgency: UrgencyLevel;
  }>;
}

export class GeminiService implements IAIService {
  private textModel: ReturnType<typeof getGenerativeModel> | null = null;
  private visionModel: ReturnType<typeof getGenerativeModel> | null = null;
  private appCheckOrAuthBlocked: boolean = false;

  public getDirectApiKey(): string {
    const key = (import.meta as any).env?.VITE_GEMINI_API_KEY;
    return typeof key === 'string' ? key.trim() : '';
  }

  public canRunCloudVision(): boolean {
    const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
    if (!isOnline) return false;
    if (this.getDirectApiKey()) return true;
    return !this.isLocalhostWithoutAppCheck();
  }

  private isLocalhostWithoutAppCheck(): boolean {
    if (this.appCheckOrAuthBlocked) return true;
    if (typeof window !== 'undefined') {
      const host = window.location.hostname;
      if (host === 'localhost' || host === '127.0.0.1') {
        return true;
      }
    }
    return false;
  }

  private buildSmartLocalCheckIn(tasks: Task[]): string {
    const pending = tasks.filter(t => !t.completed);
    if (pending.length === 0) {
      return 'All tasks crushed today, Bruv! Streak protected.';
    }
    const now = new Date();
    const nowHour = now.getHours() + now.getMinutes() / 60;
    const sorted = sortTasksSmartly(pending, nowHour);
    const next = sorted[0];
    const prio = next.urgency === 'high' ? 'high-priority ' : '';

    if (!next.startTime) {
      return `Focus on your ${prio}${next.category} item "${next.title}" whenever you have an open block, Bruv.`;
    }

    const startH = timeStringToFractionalHour(next.startTime);
    const endH = startH + Math.max(15, next.durationMinutes || 0) / 60;
    if (endH < nowHour) {
      return `Heads up, Bruv: "${next.title}" (${next.startTime}) is overdue. Complete it or reschedule to protect your XP!`;
    }
    const durSuffix = next.durationMinutes > 0 ? ` (${next.durationMinutes}m)` : '';
    return `Focus on your ${prio}${next.category} block "${next.title}" at ${next.startTime}${durSuffix}, Bruv.`;
  }

  private getTextModel() {
    if (!this.textModel) {
      const ai = getAI(app, { backend: new GoogleAIBackend() });
      this.textModel = getGenerativeModel(ai, {
        model: 'gemini-2.5-flash',
        systemInstruction: {
          role: 'system',
          parts: [
            {
              type: 'text',
              text: 'You are CereBruv ("Bruv"), a friendly, punchy, supportive AI second-brain and time-blocking companion. Speak in mascot voice calling the user "bruv". Give quick actionable encouragement based on their schedule. Maximum 2 sentences. No emojis.'
            }
          ]
        }
      });
    }
    return this.textModel;
  }

  private getVisionModel() {
    if (!this.visionModel) {
      const ai = getAI(app, { backend: new GoogleAIBackend() });
      this.visionModel = getGenerativeModel(ai, {
        model: 'gemini-2.5-flash',
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: Schema.object({
            properties: {
              fullText: Schema.string(),
              links: Schema.array({ items: Schema.string() }),
              tasks: Schema.array({
                items: Schema.object({
                  properties: {
                    title: Schema.string(),
                    category: Schema.enumString({
                      enum: ['study', 'work', 'personal', 'event', 'rest']
                    }),
                    date: Schema.string(),
                    startTime: Schema.string(),
                    durationMins: Schema.integer(),
                    urgency: Schema.enumString({
                      enum: ['low', 'medium', 'high']
                    })
                  },
                  optionalProperties: []
                })
              })
            },
            optionalProperties: []
          })
        }
      });
    }
    return this.visionModel;
  }

  async analyzeWorkload(tasks: Task[]): Promise<string> {
    const directKey = this.getDirectApiKey();
    if (!directKey && this.isLocalhostWithoutAppCheck()) {
      return this.buildSmartLocalCheckIn(tasks);
    }

    const taskSummary = tasks.map(t => ({
      title: t.title,
      category: t.category,
      startTime: t.startTime || 'unscheduled',
      durationMinutes: t.durationMinutes || 0,
      completed: t.completed,
      urgency: t.urgency
    }));

    const prompt = `Here is my current task schedule for today in JSON:
${JSON.stringify(taskSummary, null, 2)}

In 1-2 short sentences (max 2 sentences), give me your mascot check-in and advice on what to tackle or focus on next, bruv.`;

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('AI analysis timed out (5s limit reached)')), 5000);
    });

    const aiCall = async (): Promise<string> => {
      try {
        if (directKey) {
          const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(directKey)}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                systemInstruction: {
                  parts: [
                    {
                      text: 'You are CereBruv ("Bruv"), a friendly, punchy, supportive AI second-brain companion. Maximum 2 sentences. No emojis.'
                    }
                  ]
                },
                contents: [{ role: 'user', parts: [{ text: prompt }] }]
              })
            }
          );
          if (!resp.ok) return this.buildSmartLocalCheckIn(tasks);
          const data = await resp.json();
          const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          return txt || this.buildSmartLocalCheckIn(tasks);
        }

        const model = this.getTextModel();
        const result = await model.generateContent(prompt);
        const text = result.response.text().trim();
        return text || this.buildSmartLocalCheckIn(tasks);
      } catch (err: any) {
        const msg = String(err?.message || err || '');
        if (msg.includes('401') || msg.includes('App Check') || msg.includes('fetch-error')) {
          this.appCheckOrAuthBlocked = true;
        }
        return this.buildSmartLocalCheckIn(tasks);
      }
    };

    return Promise.race([aiCall(), timeoutPromise]).catch(() => this.buildSmartLocalCheckIn(tasks));
  }

  /**
   * Rich Vision extractor used by ScreenshotScannerService:
   * - Uses direct Google AI Studio key if VITE_GEMINI_API_KEY is configured (works on localhost & prod)
   * - Falls back to Firebase Vertex/GoogleAI SDK in production
   * - Strictly leaves date, startTime, and durationMinutes BLANK/0 when absent in the image!
   */
  async analyzeScreenshotWithVision(imageBlob: Blob): Promise<GeminiVisionScanPayload | null> {
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = reader.result as string;
        const commaIdx = res.indexOf(',');
        resolve(commaIdx >= 0 ? res.slice(commaIdx + 1) : res);
      };
      reader.onerror = () => reject(new Error('Failed to read image blob'));
      reader.readAsDataURL(imageBlob);
    });

    const mimeType = imageBlob.type || 'image/jpeg';
    const currentYear = new Date().getFullYear();

    const prompt = `Carefully read ALL visible text in this image (including stylized poster titles where illustrations replace letters, subtitles, deadlines, URLs, shortlinks like bit.ly/..., social handles, and email addresses).
Return a JSON object with:
1. "fullText": clean, accurate transcription of the important text on the image.
2. "links": array of all visible URLs, shortlinks (e.g. "bit.ly/...", "facebook.com/..."), or email addresses exactly as shown.
3. "tasks": array of actionable tasks, applications, deadlines, or events found in the image.
STRICT ACCURACY RULES (DO NOT HALLUCINATE):
- NEVER add or invent information that is NOT visibly written in the image!
- "date": Format as "YYYY-MM-DD" ONLY if a date is explicitly written in the image (assume year ${currentYear} ONLY if month+day is written without a year). If NO date is written in the image, return "" (empty string).
- "startTime": Format as 24-hour "HH:mm" ONLY if a specific clock time (e.g. "8:00 AM", "3:30 PM", "14:00") is explicitly written in the image. If NO clock time is written in the image, MUST return "" (empty string). NEVER guess a time!
- "durationMins": Integer minutes ONLY if an explicit duration (e.g. "45 mins", "2 hours") or start-to-end time range is written in the image. Otherwise MUST return 0.
- "category": one of "study", "work", "personal", "event", "rest".
- "urgency": one of "low", "medium", "high" ("high" if a deadline/application/exam is mentioned).`;

    let rawJsonText = '';
    const directKey = this.getDirectApiKey();

    if (directKey) {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(directKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  { inlineData: { mimeType, data: base64Data } },
                  { text: prompt }
                ]
              }
            ],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1
            }
          })
        }
      );
      if (!resp.ok) {
        throw new Error(`Gemini API HTTP ${resp.status}`);
      }
      const data = await resp.json();
      rawJsonText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    } else {
      if (this.isLocalhostWithoutAppCheck()) {
        return null;
      }
      try {
        const model = this.getVisionModel();
        const result = await model.generateContent([
          {
            type: 'inlineData',
            inlineData: {
              mimeType,
              data: base64Data
            }
          },
          {
            type: 'text',
            text: prompt
          }
        ]);
        rawJsonText = result.response.text().trim();
      } catch (err: any) {
        const msg = String(err?.message || err || '');
        if (msg.includes('401') || msg.includes('App Check') || msg.includes('fetch-error')) {
          this.appCheckOrAuthBlocked = true;
        }
        throw err;
      }
    }

    if (!rawJsonText) return null;

    const parsed = JSON.parse(rawJsonText);
    const fullText = typeof parsed?.fullText === 'string' ? parsed.fullText.trim() : '';

    const rawLinkStrings: string[] = Array.isArray(parsed?.links) ? parsed.links : [];
    const normalizedModelLinks: SavedLink[] = [];
    rawLinkStrings.forEach((s) => {
      if (typeof s === 'string') {
        const link = normalizeToSavedLink(s);
        if (link) normalizedModelLinks.push(link);
      }
    });
    const textLinks = extractLinksFromText(fullText);
    const links = mergeSavedLinks(normalizedModelLinks, textLinks);

    const rawTasks: any[] = Array.isArray(parsed?.tasks) ? parsed.tasks : [];
    const tasks = rawTasks
      .map((item: any) => {
        const title = String(item?.title || '').trim();
        if (!title) return null;
        const rawDate = typeof item?.date === 'string' ? item.date.trim() : '';
        const validDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : '';
        const rawTime = typeof item?.startTime === 'string' ? item.startTime.trim() : '';
        const validTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(rawTime) ? rawTime : '';
        const validDur =
          typeof item?.durationMins === 'number' && item.durationMins > 0
            ? Math.min(480, Math.round(item.durationMins))
            : 0;

        return {
          title,
          category: (['study', 'work', 'personal', 'event', 'rest'].includes(item?.category)
            ? item.category
            : 'personal') as TaskCategory,
          date: validDate,
          startTime: validTime,
          durationMinutes: validDur,
          urgency: (['low', 'medium', 'high'].includes(item?.urgency)
            ? item.urgency
            : 'medium') as UrgencyLevel
        };
      })
      .filter((t): t is NonNullable<typeof t> => t !== null);

    return {
      fullText,
      links,
      tasks
    };
  }

  async extractTasksFromImage(imageBlob: Blob): Promise<Partial<Task>[]> {
    const payload = await this.analyzeScreenshotWithVision(imageBlob);
    if (!payload) return [];
    return payload.tasks.map((t) => ({
      title: t.title,
      category: t.category,
      date: t.date,
      startTime: t.startTime,
      durationMinutes: t.durationMinutes,
      urgency: t.urgency,
      links: payload.links
    }));
  }

  async transcribeAudio(audioBlob: Blob): Promise<string> {
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = reader.result as string;
        const commaIdx = res.indexOf(',');
        resolve(commaIdx >= 0 ? res.slice(commaIdx + 1) : res);
      };
      reader.onerror = () => reject(new Error('Failed to read audio blob'));
      reader.readAsDataURL(audioBlob);
    });

    const mimeType = audioBlob.type || 'audio/webm';
    const ai = getAI(app, { backend: new GoogleAIBackend() });
    const model = getGenerativeModel(ai, { model: 'gemini-2.5-flash' });

    const result = await model.generateContent([
      {
        type: 'inlineData',
        inlineData: {
          mimeType,
          data: base64Data
        }
      },
      {
        type: 'text',
        text: 'Transcribe the spoken English voice command in this audio clip verbatim. Return ONLY the raw transcribed words with no quotes, no markdown, and no extra commentary. If silence or unintelligible, return empty string.'
      }
    ]);

    return result.response.text().trim();
  }
}

export const geminiService = new GeminiService();
