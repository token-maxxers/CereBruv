import { getAI, GoogleAIBackend, getGenerativeModel, Schema } from 'firebase/ai';
import { app } from '../firebase';
import { sortTasksSmartly, timeStringToFractionalHour } from '../../components/FocusOrbit/orbitCalculator';
import type { Task, TaskCategory, UrgencyLevel } from '../../types/task';
import type { IAIService } from './IAIService';

export class GeminiService implements IAIService {
  private textModel: ReturnType<typeof getGenerativeModel> | null = null;
  private visionModel: ReturnType<typeof getGenerativeModel> | null = null;
  private appCheckOrAuthBlocked: boolean = false;

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
    const startH = timeStringToFractionalHour(next.startTime);
    const endH = startH + next.durationMinutes / 60;
    if (endH < nowHour) {
      return `Heads up, Bruv: "${next.title}" (${next.startTime}) is overdue. Complete it or reschedule to protect your XP!`;
    }
    const prio = next.urgency === 'high' ? 'high-priority ' : '';
    return `Focus on your ${prio}${next.category} block "${next.title}" at ${next.startTime} (${next.durationMinutes}m), Bruv.`;
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
          responseSchema: Schema.array({
            items: Schema.object({
              properties: {
                title: Schema.string(),
                category: Schema.enumString({
                  enum: ['study', 'work', 'personal', 'event', 'rest']
                }),
                durationMins: Schema.integer(),
                urgency: Schema.enumString({
                  enum: ['low', 'medium', 'high']
                })
              },
              optionalProperties: []
            })
          })
        }
      });
    }
    return this.visionModel;
  }

  async analyzeWorkload(tasks: Task[]): Promise<string> {
    if (this.isLocalhostWithoutAppCheck()) {
      return this.buildSmartLocalCheckIn(tasks);
    }

    const taskSummary = tasks.map(t => ({
      title: t.title,
      category: t.category,
      startTime: t.startTime,
      durationMinutes: t.durationMinutes,
      completed: t.completed,
      urgency: t.urgency
    }));

    const prompt = `Here is my current task schedule for today in JSON:
${JSON.stringify(taskSummary, null, 2)}

In 1-2 short sentences (max 2 sentences), give me your mascot check-in and advice on what to tackle or focus on next, bruv.`;

    // 5-second timeout controller
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('AI analysis timed out (5s limit reached)')), 5000);
    });

    const aiCall = async (): Promise<string> => {
      try {
        const model = this.getTextModel();
        const result = await model.generateContent(prompt);
        const text = result.response.text().trim();
        if (!text) {
          return this.buildSmartLocalCheckIn(tasks);
        }
        return text;
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

  async extractTasksFromImage(imageBlob: Blob): Promise<Partial<Task>[]> {
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
    const model = this.getVisionModel();

    const prompt = 'Extract all actionable tasks, to-do items, reminders, or events from this handwritten or printed note/image. Estimate realistic category (study, work, personal, event, rest), durationMins (e.g. 30, 45, 60), and urgency (low, medium, high). Return an array of objects.';

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

    const jsonText = result.response.text().trim();
    if (!jsonText) return [];

    try {
      const rawParsed = JSON.parse(jsonText);
      if (!Array.isArray(rawParsed)) return [];

      return rawParsed.map((item: any) => ({
        title: String(item.title || 'Untitled Task').trim(),
        category: (['study', 'work', 'personal', 'event', 'rest'].includes(item.category)
          ? item.category
          : 'personal') as TaskCategory,
        durationMinutes: typeof item.durationMins === 'number' && item.durationMins > 0 ? item.durationMins : 30,
        urgency: (['low', 'medium', 'high'].includes(item.urgency)
          ? item.urgency
          : 'medium') as UrgencyLevel
      }));
    } catch (e) {
      console.warn('Failed to parse Gemini task extraction JSON:', e);
      return [];
    }
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
