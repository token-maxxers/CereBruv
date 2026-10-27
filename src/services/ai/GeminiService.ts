import { getAI, GoogleAIBackend, getGenerativeModel } from 'firebase/ai';
import { app } from '../firebase';
import type { Task } from '../../types/task';
import type { IAIService } from './IAIService';

export class GeminiService implements IAIService {
  private model: ReturnType<typeof getGenerativeModel> | null = null;

  private getModel() {
    if (!this.model) {
      const ai = getAI(app, { backend: new GoogleAIBackend() });
      this.model = getGenerativeModel(ai, {
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
    return this.model;
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
      const model = this.getModel();
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      if (!text) {
        throw new Error('Empty AI response received.');
      }
      return text;
    };

    return Promise.race([aiCall(), timeoutPromise]);
  }
}

export const geminiService = new GeminiService();
