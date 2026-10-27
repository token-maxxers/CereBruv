import { getAI, GoogleAIBackend, getGenerativeModel, Schema } from 'firebase/ai';
import { app } from '../firebase';
import type { Task, TaskCategory, UrgencyLevel } from '../../types/task';
import type { IAIService } from './IAIService';

export class GeminiService implements IAIService {
  private textModel: ReturnType<typeof getGenerativeModel> | null = null;
  private visionModel: ReturnType<typeof getGenerativeModel> | null = null;

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
      const model = this.getTextModel();
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      if (!text) {
        throw new Error('Empty AI response received.');
      }
      return text;
    };

    return Promise.race([aiCall(), timeoutPromise]);
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
}

export const geminiService = new GeminiService();
