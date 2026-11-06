import { taskRepository, noteRepository, userStatsRepository } from '../storage';
import { geminiService } from '../ai/GeminiService';
import { eventBus, AppEvents } from '../events';
import { analyzeDayWorkload } from '../../components/FocusOrbit/orbitCalculator';
import type { TaskCategory, UrgencyLevel } from '../../types/task';

export type LocalVoiceIntent =
  | 'query_schedule'
  | 'create_task'
  | 'complete_task'
  | 'create_note'
  | 'navigate_tab';

export interface ParsedVoiceCommand {
  intent: LocalVoiceIntent;
  title: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm (24h)
  durationMinutes: number;
  durationSpecified?: boolean;
  category: TaskCategory;
  urgency: UrgencyLevel;
  targetTab?: 'orbit' | 'tasks' | 'graph' | 'cloud';
  rawText: string;
}

export interface VoiceExecutionOutcome {
  intent: LocalVoiceIntent;
  headline: string;
  spokenReply: string;
}

const MUTE_STORAGE_KEY = 'cerebruv_voice_muted';
const VOICE_URI_STORAGE_KEY = 'cerebruv_preferred_voice_uri';

const MONTHS: Record<string, number> = {
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

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const SPOKEN_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  forty: 40,
  'forty-five': 45,
  'forty five': 45,
  fifty: 50,
  sixty: 60,
  ninety: 90,
};

export class VoiceService {
  private availableVoices: SpeechSynthesisVoice[] = [];
  private muted: boolean = false;
  private speaking: boolean = false;
  private listening: boolean = false;
  private preferredVoiceURI: string | null = null;

  // Active speech / media recorder handles
  private activeRecognition: any = null;
  private activeMediaRecorder: MediaRecorder | null = null;
  private activeStream: MediaStream | null = null;
  private activeAudioCtx: AudioContext | null = null;
  private silenceTimer: ReturnType<typeof setInterval> | null = null;
  private maxRecordTimeout: ReturnType<typeof setTimeout> | null = null;
  private useMediaRecorderFallback: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.muted = localStorage.getItem(MUTE_STORAGE_KEY) === 'true';
      this.preferredVoiceURI = localStorage.getItem(VOICE_URI_STORAGE_KEY);

      if ('speechSynthesis' in window) {
        const loadVoices = () => {
          this.availableVoices = window.speechSynthesis.getVoices();
          this.emitState();
        };
        loadVoices();
        window.speechSynthesis.onvoiceschanged = loadVoices;
      }
    }
  }

  private emitState(statusText?: string): void {
    eventBus.emit(AppEvents.VOICE_STATE_CHANGED, {
      muted: this.muted,
      speaking: this.speaking,
      listening: this.listening,
      statusText,
    });
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public isSpeaking(): boolean {
    return this.speaking;
  }

  public isListening(): boolean {
    return this.listening;
  }

  public getEnglishVoices(): SpeechSynthesisVoice[] {
    if (this.availableVoices.length === 0 && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.availableVoices = window.speechSynthesis.getVoices();
    }
    const enVoices = this.availableVoices.filter(v => v.lang.toLowerCase().startsWith('en'));
    return enVoices.length > 0 ? enVoices : this.availableVoices;
  }

  public getPreferredVoice(): SpeechSynthesisVoice | undefined {
    const voices = this.getEnglishVoices();
    if (this.preferredVoiceURI) {
      const saved = voices.find(v => v.voiceURI === this.preferredVoiceURI);
      if (saved) return saved;
    }

    return (
      voices.find(v => v.name.includes('Google UK English Male')) ||
      voices.find(v => v.name.includes('Google') && v.lang.startsWith('en')) ||
      voices.find(v => v.name.toLowerCase().includes('natural') && v.lang.startsWith('en')) ||
      voices.find(v => v.lang === 'en-GB' || v.lang === 'en-US') ||
      voices[0]
    );
  }

  public setPreferredVoiceURI(voiceURI: string): void {
    this.preferredVoiceURI = voiceURI;
    localStorage.setItem(VOICE_URI_STORAGE_KEY, voiceURI);
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    localStorage.setItem(MUTE_STORAGE_KEY, String(this.muted));
    if (this.muted) {
      this.stopSpeaking();
    }
    this.emitState();
    return this.muted;
  }

  public stopSpeaking(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      this.speaking = false;
      this.emitState();
    }
  }

  /**
   * Toggles Siri-style voice listening on/off.
   * Uses native Web Speech API in Chrome/Edge, and automatically falls back to
   * MediaRecorder + Gemini audio transcription in browsers like Brave that block Web Speech API.
   */
  public async toggleListening(
    getSelectedDate: () => string,
    onTranscriptUpdate?: (text: string) => void
  ): Promise<void> {
    if (this.listening) {
      this.stopListening();
      return;
    }

    this.stopSpeaking();
    this.listening = true;
    this.emitState('Listening, Bruv... Speak your command');

    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    // If browser doesn't support SpeechRecognition or previously failed with Brave network block, use MediaRecorder
    if (!SpeechRec || this.useMediaRecorderFallback) {
      await this.startMediaRecorderListening(getSelectedDate, onTranscriptUpdate);
      return;
    }

    try {
      const recognition = new SpeechRec();
      this.activeRecognition = recognition;
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      let finalTranscript = '';
      let currentInterim = '';
      let switchedToFallback = false;

      recognition.onresult = (event: any) => {
        let interim = '';
        let finalChunk = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const piece = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalChunk += piece;
          } else {
            interim += piece;
          }
        }

        if (finalChunk) {
          finalTranscript = (finalTranscript + ' ' + finalChunk).trim();
        }
        currentInterim = interim;
        const combined = (finalTranscript + ' ' + currentInterim).trim();
        if (combined) {
          onTranscriptUpdate?.(combined);
          eventBus.emit(AppEvents.MASCOT_SPEAK, {
            headline: 'Listening, Bruv...',
            subspeech: `"${combined}"`,
          });
        }
      };

      recognition.onerror = async (event: any) => {
        // Brave Browser throws 'network' or 'service-not-allowed' immediately on start()
        if (event.error === 'network' || event.error === 'service-not-allowed') {
          switchedToFallback = true;
          this.useMediaRecorderFallback = true;
          this.activeRecognition = null;
          await this.startMediaRecorderListening(getSelectedDate, onTranscriptUpdate);
          return;
        }

        this.listening = false;
        this.activeRecognition = null;
        const msg =
          event.error === 'not-allowed'
            ? 'Microphone permission blocked. Allow mic access in browser bar, Bruv.'
            : 'Did not catch that, Bruv. Tap my avatar to try again.';
        eventBus.emit(AppEvents.MASCOT_SPEAK, {
          headline: 'Mic Check, Bruv',
          subspeech: msg,
        });
        this.emitState();
      };

      recognition.onend = async () => {
        if (switchedToFallback) return;
        this.listening = false;
        this.activeRecognition = null;
        this.emitState();

        const spoken = (finalTranscript || currentInterim).trim();
        if (spoken) {
          onTranscriptUpdate?.('');
          await this.executeVoiceCommand(spoken, getSelectedDate());
        } else {
          eventBus.emit(AppEvents.MASCOT_SPEAK, {
            headline: 'Ready when you are, Bruv.',
            subspeech: 'Tap my avatar and say "Hey Bruv, what\'s my schedule?"',
          });
        }
      };

      recognition.start();
    } catch {
      this.useMediaRecorderFallback = true;
      await this.startMediaRecorderListening(getSelectedDate, onTranscriptUpdate);
    }
  }

  public stopListening(): void {
    if (this.activeRecognition) {
      try {
        this.activeRecognition.stop();
      } catch {}
      this.activeRecognition = null;
    }

    if (this.silenceTimer) {
      clearInterval(this.silenceTimer);
      this.silenceTimer = null;
    }

    if (this.maxRecordTimeout) {
      clearTimeout(this.maxRecordTimeout);
      this.maxRecordTimeout = null;
    }

    if (this.activeMediaRecorder && this.activeMediaRecorder.state !== 'inactive') {
      try {
        this.activeMediaRecorder.stop();
      } catch {}
      return;
    }

    this.cleanupMediaStream();
    this.listening = false;
    this.emitState();
  }

  private cleanupMediaStream(): void {
    if (this.activeStream) {
      this.activeStream.getTracks().forEach(t => t.stop());
      this.activeStream = null;
    }
    if (this.activeAudioCtx) {
      this.activeAudioCtx.close().catch(() => {});
      this.activeAudioCtx = null;
    }
  }

  /**
   * Fallback microphone recorder for browsers like Brave where Web Speech API is disabled.
   * Uses Web Audio API silence detection to automatically stop when the user finishes speaking.
   */
  private async startMediaRecorderListening(
    getSelectedDate: () => string,
    onTranscriptUpdate?: (text: string) => void
  ): Promise<void> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.listening = false;
      this.emitState();
      eventBus.emit(AppEvents.MASCOT_SPEAK, {
        headline: 'Mic Unavailable, Bruv',
        subspeech: 'Browser does not support microphone capture. Type your command below.',
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.activeStream = stream;

      const chunks: BlobPart[] = [];
      const recorder = new MediaRecorder(stream);
      this.activeMediaRecorder = recorder;

      eventBus.emit(AppEvents.MASCOT_SPEAK, {
        headline: 'Listening, Bruv...',
        subspeech: 'Speak your command now (tap avatar when finished).',
      });

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = async () => {
        this.cleanupMediaStream();
        this.activeMediaRecorder = null;

        const audioBlob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (audioBlob.size < 1000) {
          this.listening = false;
          this.emitState();
          return;
        }

        eventBus.emit(AppEvents.MASCOT_SPEAK, {
          headline: 'Thinking it through, Bruv...',
          subspeech: 'Processing your voice command...',
        });

        try {
          const transcript = await geminiService.transcribeAudio(audioBlob);
          this.listening = false;
          this.emitState();

          if (transcript) {
            onTranscriptUpdate?.(transcript);
            await this.executeVoiceCommand(transcript, getSelectedDate());
            onTranscriptUpdate?.('');
          } else {
            eventBus.emit(AppEvents.MASCOT_SPEAK, {
              headline: "Didn't catch that, Bruv.",
              subspeech: 'Tap my avatar to speak again or type your command below.',
            });
          }
        } catch (err) {
          console.warn('Audio transcription failed:', err);
          this.listening = false;
          this.emitState();
          eventBus.emit(AppEvents.MASCOT_SPEAK, {
            headline: 'Voice Note, Bruv',
            subspeech: 'Brave blocks Web Speech API & Gemini quota was reached. Open in Chrome for unlimited offline-free mic, or type below!',
          });
        }
      };

      recorder.start();

      // Setup Web Audio silence detection (auto-stops 1.4s after user finishes speaking)
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx: AudioContext = new AudioCtx();
        this.activeAudioCtx = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);

        const data = new Uint8Array(analyser.frequencyBinCount);
        let hasSpoken = false;
        let silenceStart = 0;

        this.silenceTimer = setInterval(() => {
          analyser.getByteFrequencyData(data);
          const avg = data.reduce((sum, val) => sum + val, 0) / data.length;

          if (avg > 18) {
            hasSpoken = true;
            silenceStart = 0;
          } else if (hasSpoken) {
            if (!silenceStart) {
              silenceStart = Date.now();
            } else if (Date.now() - silenceStart > 1400) {
              this.stopListening();
            }
          }
        }, 120);
      } catch {}

      // Safety max recording duration (7 seconds)
      this.maxRecordTimeout = setTimeout(() => {
        if (this.listening) {
          this.stopListening();
        }
      }, 7000);
    } catch {
      this.listening = false;
      this.emitState();
      eventBus.emit(AppEvents.MASCOT_SPEAK, {
        headline: 'Mic Blocked, Bruv',
        subspeech: 'Allow microphone permission in your browser address bar to talk to CereBruv.',
      });
    }
  }

  /**
   * Speaks a message aloud using the browser's offline-capable native SpeechSynthesis engine.
   */
  public speak(text: string, forceUnmute = false): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (this.muted && !forceUnmute) return;

    const cleanText = text.replace(/["*_`~]/g, '').trim();
    if (!cleanText) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 0.98;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    const voice = this.getPreferredVoice();
    if (voice) {
      utterance.voice = voice;
    }

    utterance.onstart = () => {
      this.speaking = true;
      this.emitState();
    };

    utterance.onend = () => {
      this.speaking = false;
      this.emitState();
    };

    utterance.onerror = () => {
      this.speaking = false;
      this.emitState();
    };

    window.speechSynthesis.speak(utterance);
  }

  /**
   * Normalizes phonetic mishears of "Hey Bruv" and spoken numbers.
   */
  private normalizeTranscript(raw: string): string {
    let text = raw.trim();

    text = text.replace(
      /^(hey|yo|ok|okay|hi|hello)\s+(cerebruv|bruv|bro|brev|brave|brad|bruh|prof|love|grab|rob)[,.:!\s]*/i,
      'hey bruv '
    );

    Object.entries(SPOKEN_NUMBERS).forEach(([word, num]) => {
      const regex = new RegExp(`\\b(at|for|in|around)\\s+${word}\\b`, 'gi');
      text = text.replace(regex, `$1 ${num}`);
    });

    return text.trim();
  }

  public isCommandPhrase(input: string): boolean {
    const normalized = this.normalizeTranscript(input).toLowerCase();
    if (
      normalized.startsWith('hey bruv') ||
      /^(schedule|add|plan|book)\s+.+\b(at|tomorrow|today|morning|afternoon|evening|tonight|noon)\b/i.test(normalized) ||
      /^(done with|complete|finish)\s+/i.test(normalized) ||
      /^(what('s| is) my schedule|read my schedule|what('s| is) next)/i.test(normalized) ||
      /^open\s+(orbit|tasks|graph|cloud)\b/i.test(normalized)
    ) {
      return true;
    }
    return false;
  }

  /**
   * 100% Local, Deterministic Keyword & Date/Time Parser (Zero API / Zero Quota).
   */
  public parseCommandLocally(rawTranscript: string, referenceDateStr: string): ParsedVoiceCommand {
    const normalized = this.normalizeTranscript(rawTranscript);
    let body = normalized.replace(/^hey bruv[,.:!\s]*/i, '').trim();
    const lowerBody = body.toLowerCase();

    // RULE 1: Navigation
    const navMatch = lowerBody.match(/^(?:open|show|go to|switch to)\s+(?:the\s+|my\s+)?(orbit|tasks?|graph|cloud)\b/i);
    if (navMatch) {
      const rawTab = navMatch[1].toLowerCase();
      const targetTab = rawTab.startsWith('task') ? 'tasks' : (rawTab as 'orbit' | 'graph' | 'cloud');
      return {
        intent: 'navigate_tab',
        title: targetTab,
        date: referenceDateStr,
        startTime: '09:00',
        durationMinutes: 30,
        category: 'personal',
        urgency: 'medium',
        targetTab,
        rawText: rawTranscript,
      };
    }

    // RULE 2: Schedule Check
    const isScheduleQuery =
      lowerBody === '' ||
      lowerBody === 'schedule' ||
      lowerBody === 'my schedule' ||
      lowerBody === 'status' ||
      /^(what('s| is)|read|check|tell me|how('s| is))\b.*\b(schedule|orbit|tasks|agenda|plan|day|next|free time)\b/i.test(lowerBody) ||
      /\b(what('s| is) my schedule|what('s| is) next|read my schedule|check my schedule)\b/i.test(lowerBody);

    if (isScheduleQuery) {
      return {
        intent: 'query_schedule',
        title: '',
        date: this.extractDate(lowerBody, referenceDateStr).dateStr,
        startTime: '09:00',
        durationMinutes: 30,
        category: 'personal',
        urgency: 'medium',
        rawText: rawTranscript,
      };
    }

    // RULE 3: Complete Task
    const completeMatch = body.match(/^(?:done with|complete|finish|check off|mark)\s+(?:task\s+)?(.+?)(?:\s+done|\s+complete)?$/i);
    if (completeMatch && completeMatch[1]) {
      return {
        intent: 'complete_task',
        title: completeMatch[1].trim(),
        date: referenceDateStr,
        startTime: '09:00',
        durationMinutes: 30,
        category: 'personal',
        urgency: 'medium',
        rawText: rawTranscript,
      };
    }

    // RULE 4: Explicit Brain-Dump Note
    const explicitNoteMatch = body.match(/^(?:note|take a note|save note|brain dump|remember to|remember)\s*[:,-]?\s*(.+)$/i);
    if (explicitNoteMatch && explicitNoteMatch[1]) {
      return {
        intent: 'create_note',
        title: explicitNoteMatch[1].trim(),
        date: referenceDateStr,
        startTime: '09:00',
        durationMinutes: 30,
        category: 'personal',
        urgency: 'medium',
        rawText: explicitNoteMatch[1].trim(),
      };
    }

    // RULE 5: Add / Schedule Task
    let working = body;
    const dateExtraction = this.extractDate(working, referenceDateStr);
    working = dateExtraction.remainingText;

    const timeExtraction = this.extractTime(working);
    working = timeExtraction.remainingText;

    const durationExtraction = this.extractDuration(working);
    working = durationExtraction.remainingText;

    const urgencyExtraction = this.extractUrgency(working);
    working = urgencyExtraction.remainingText;

    const startsWithTaskVerb = /^(?:please\s+)?(?:add|schedule|plan|book|set|create)\b/i.test(working);

    if (!startsWithTaskVerb && !dateExtraction.matched && !timeExtraction.matched && !durationExtraction.matched) {
      return {
        intent: 'create_note',
        title: body || rawTranscript,
        date: referenceDateStr,
        startTime: timeExtraction.startTime,
        durationMinutes: durationExtraction.durationMinutes,
        category: 'personal',
        urgency: 'medium',
        rawText: body || rawTranscript,
      };
    }

    let cleanedTitle = working
      .replace(/^(?:please\s+)?(?:add|schedule|plan|book|set|create)\s+(?:a\s+|an\s+|my\s+|the\s+)?(?:task\s+(?:to|for)?\s*|event\s+(?:to|for)?\s*)?/i, '')
      .replace(/\b(?:will be|is at|scheduled)\b/gi, ' ')
      .replace(/\s+(?:on|at|for|in|by|to|the|my|a|an)\s*$/gi, '')
      .replace(/^\s*(?:on|at|for|in|to)\s+/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (!cleanedTitle) {
      cleanedTitle = 'Scheduled Focus Block';
    }

    const titleCased = cleanedTitle.charAt(0).toUpperCase() + cleanedTitle.slice(1);
    const category = this.inferCategory(titleCased + ' ' + rawTranscript);

    return {
      intent: 'create_task',
      title: titleCased,
      date: dateExtraction.dateStr,
      startTime: timeExtraction.startTime,
      durationMinutes: durationExtraction.durationMinutes,
      durationSpecified: durationExtraction.matched,
      category,
      urgency: urgencyExtraction.urgency,
      rawText: rawTranscript,
    };
  }

  public async executeVoiceCommand(
    rawTranscript: string,
    currentSelectedDate: string
  ): Promise<VoiceExecutionOutcome> {
    const parsed = this.parseCommandLocally(rawTranscript, currentSelectedDate);

    // 1. Navigate Tab
    if (parsed.intent === 'navigate_tab' && parsed.targetTab) {
      eventBus.emit(AppEvents.NAVIGATE_TAB, parsed.targetTab);
      const tabLabel = parsed.targetTab.charAt(0).toUpperCase() + parsed.targetTab.slice(1);
      const headline = `Switched to ${tabLabel}, Bruv.`;
      const spokenReply = `I got you, Bruv. Opening your ${tabLabel} view.`;
      eventBus.emit(AppEvents.MASCOT_SPEAK, { headline, subspeech: spokenReply });
      this.speak(spokenReply);
      return { intent: 'navigate_tab', headline, spokenReply };
    }

    // 2. Query Schedule
    if (parsed.intent === 'query_schedule') {
      const allTasks = await taskRepository.getAllTasks();
      const targetDate = parsed.date || currentSelectedDate;
      const dayTasks = allTasks
        .filter(t => (t.date || targetDate) === targetDate)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));

      const now = new Date();
      const currentHourFraction = now.getHours() + now.getMinutes() / 60;
      const analysis = analyzeDayWorkload(dayTasks, currentHourFraction);
      const pending = dayTasks.filter(t => !t.completed);
      const freeHours = (analysis.totalFreeMinutes / 60).toFixed(1).replace(/\.0$/, '');

      const dateLabel = this.formatSpokenDateLabel(targetDate);
      let spokenReply = '';
      let headline = '';

      if (dayTasks.length === 0) {
        headline = `I got you, Bruv — Schedule clear ${dateLabel}.`;
        spokenReply = `I got you, Bruv. Your schedule for ${dateLabel} is clear, with ${freeHours} hours of open focus time.`;
      } else if (pending.length === 0) {
        headline = `I got you, Bruv — All ${dayTasks.length} tasks done!`;
        spokenReply = `I got you, Bruv. You crushed all ${dayTasks.length} tasks for ${dateLabel}. Enjoy your ${freeHours} hours of free time.`;
      } else {
        const nextTask = analysis.realisticNextTask || pending[0];
        const taskListSummary = pending
          .slice(0, 3)
          .map(t => `${t.title} at ${this.formatSpokenTime(t.startTime)}`)
          .join(', ');
        headline = `I got you, Bruv — ${pending.length} task${pending.length > 1 ? 's' : ''} ${dateLabel}.`;
        spokenReply = `I got you, Bruv. Here is your schedule for ${dateLabel}: ${taskListSummary}. Priority next task is ${nextTask.title}, with ${freeHours} hours of free orbit time.`;
      }

      eventBus.emit(AppEvents.MASCOT_SPEAK, { headline, subspeech: spokenReply });
      this.speak(spokenReply);
      return { intent: 'query_schedule', headline, spokenReply };
    }

    // 3. Complete Task
    if (parsed.intent === 'complete_task') {
      const allTasks = await taskRepository.getAllTasks();
      const needle = parsed.title.toLowerCase();
      const match = allTasks.find(
        t => !t.completed && t.title.toLowerCase().includes(needle)
      );

      if (match) {
        const updated = await taskRepository.toggleTaskCompletion(match.id);
        if (updated.completed) {
          const stats = await userStatsRepository.incrementTaskCount();
          eventBus.emit(AppEvents.STATS_UPDATED, stats);
        }
        eventBus.emit(AppEvents.TASK_COMPLETED, updated);

        const headline = `I got you, Bruv — "${match.title}" done (+25 XP)!`;
        const spokenReply = `I got you, Bruv. Marked ${match.title} complete and added 25 XP to your streak.`;
        eventBus.emit(AppEvents.MASCOT_SPEAK, { headline, subspeech: spokenReply });
        this.speak(spokenReply);
        return { intent: 'complete_task', headline, spokenReply };
      } else {
        const headline = `Task "${parsed.title}" not found, Bruv.`;
        const spokenReply = `I heard you, Bruv, but I couldn't find an open task matching ${parsed.title}.`;
        eventBus.emit(AppEvents.MASCOT_SPEAK, { headline, subspeech: spokenReply });
        this.speak(spokenReply);
        return { intent: 'complete_task', headline, spokenReply };
      }
    }

    // 4. Create Task
    if (parsed.intent === 'create_task') {
      await taskRepository.createTask({
        title: parsed.title,
        category: parsed.category,
        date: parsed.date,
        startTime: parsed.startTime,
        durationMinutes: parsed.durationMinutes,
        urgency: parsed.urgency,
        notes: `Voice Command: "${rawTranscript}"`,
      });

      if (parsed.date !== currentSelectedDate) {
        eventBus.emit(AppEvents.DATE_SELECTED, parsed.date);
      }
      eventBus.emit(AppEvents.TASK_CREATED);

      const dateLabel = this.formatSpokenDateLabel(parsed.date);
      const timeLabel = this.formatSpokenTime(parsed.startTime);
      const headline = `I got you, Bruv — Added "${parsed.title}"`;
      const spokenReply = parsed.durationSpecified
        ? `I got you, Bruv. Added ${parsed.title} for ${dateLabel} at ${timeLabel}, for ${parsed.durationMinutes} minutes.`
        : `I got you, Bruv. Added ${parsed.title} for ${dateLabel} at ${timeLabel}.`;

      eventBus.emit(AppEvents.MASCOT_SPEAK, { headline, subspeech: spokenReply });
      this.speak(spokenReply);
      return { intent: 'create_task', headline, spokenReply };
    }

    // 5. Create Note
    await noteRepository.createNote({ content: parsed.rawText });
    eventBus.emit(AppEvents.NOTE_CREATED);

    const headline = 'I got you, Bruv — Note saved.';
    const spokenReply = `I got you, Bruv. Saved "${parsed.rawText}" to your second brain.`;
    eventBus.emit(AppEvents.MASCOT_SPEAK, { headline, subspeech: spokenReply });
    this.speak(spokenReply);
    return { intent: 'create_note', headline, spokenReply };
  }

  private extractDate(text: string, refDateStr: string): { dateStr: string; remainingText: string; matched: boolean } {
    let remaining = text;
    const baseDate = new Date(refDateStr + 'T00:00:00');
    if (isNaN(baseDate.getTime())) {
      return { dateStr: this.toISODate(new Date()), remainingText: text, matched: false };
    }

    if (/\b(the\s+)?day after tomorrow\b/i.test(remaining)) {
      remaining = remaining.replace(/\b(the\s+)?day after tomorrow\b/gi, ' ');
      baseDate.setDate(baseDate.getDate() + 2);
      return { dateStr: this.toISODate(baseDate), remainingText: remaining, matched: true };
    }

    if (/\btomorrow\b/i.test(remaining)) {
      remaining = remaining.replace(/\b(for\s+|on\s+)?tomorrow\b/gi, ' ');
      baseDate.setDate(baseDate.getDate() + 1);
      return { dateStr: this.toISODate(baseDate), remainingText: remaining, matched: true };
    }

    if (/\btoday\b/i.test(remaining)) {
      remaining = remaining.replace(/\b(for\s+|on\s+)?today\b/gi, ' ');
      return { dateStr: this.toISODate(baseDate), remainingText: remaining, matched: true };
    }

    const monthDayRegex = /\b(?:on\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i;
    const mdMatch = remaining.match(monthDayRegex);
    if (mdMatch) {
      const monthIndex = MONTHS[mdMatch[1].toLowerCase()];
      const dayNum = parseInt(mdMatch[2], 10);
      if (monthIndex !== undefined && dayNum >= 1 && dayNum <= 31) {
        const target = new Date(baseDate.getFullYear(), monthIndex, dayNum);
        remaining = remaining.replace(monthDayRegex, ' ');
        return { dateStr: this.toISODate(target), remainingText: remaining, matched: true };
      }
    }

    const weekdayRegex = /\b(?:on\s+|next\s+|this\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i;
    const wdMatch = remaining.match(weekdayRegex);
    if (wdMatch) {
      const targetDay = WEEKDAYS[wdMatch[1].toLowerCase()];
      const currentDay = baseDate.getDay();
      let daysAhead = (targetDay - currentDay + 7) % 7;
      if (daysAhead === 0) daysAhead = 7;
      baseDate.setDate(baseDate.getDate() + daysAhead);
      remaining = remaining.replace(weekdayRegex, ' ');
      return { dateStr: this.toISODate(baseDate), remainingText: remaining, matched: true };
    }

    return { dateStr: refDateStr, remainingText: remaining, matched: false };
  }

  private extractTime(text: string): { startTime: string; remainingText: string; matched: boolean } {
    let remaining = text;

    const strictTimeRegex = /\b(?:(?:at|by|around|from)\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?|(\d{1,2})(?::(\d{2}))\s*(a\.?m\.?|p\.?m\.?)?|(\d{1,2})\s*(a\.?m\.?|p\.?m\.?))\b/i;
    const match = remaining.match(strictTimeRegex);

    if (match) {
      const rawHour = parseInt(match[1] || match[4] || match[7], 10);
      const rawMin = parseInt(match[2] || match[5] || '0', 10);
      const meridiem = (match[3] || match[6] || match[8] || '').toLowerCase().replace(/\./g, '');

      if (rawHour >= 0 && rawHour <= 23 && rawMin >= 0 && rawMin <= 59) {
        let hour24 = rawHour;
        if (meridiem === 'pm' && hour24 < 12) hour24 += 12;
        if (meridiem === 'am' && hour24 === 12) hour24 = 0;

        const formatted = `${String(hour24).padStart(2, '0')}:${String(rawMin).padStart(2, '0')}`;
        remaining = remaining.replace(strictTimeRegex, ' ');
        return { startTime: formatted, remainingText: remaining, matched: true };
      }
    }

    if (/\b(?:at\s+)?noon\b/i.test(remaining)) {
      return { startTime: '12:00', remainingText: remaining.replace(/\b(?:at\s+)?noon\b/gi, ' '), matched: true };
    }
    if (/\b(?:at\s+)?midnight\b/i.test(remaining)) {
      return { startTime: '00:00', remainingText: remaining.replace(/\b(?:at\s+)?midnight\b/gi, ' '), matched: true };
    }
    if (/\b(?:in the\s+|this\s+)?morning\b/i.test(remaining)) {
      return { startTime: '09:00', remainingText: remaining.replace(/\b(?:in the\s+|this\s+)?morning\b/gi, ' '), matched: true };
    }
    if (/\b(?:in the\s+|this\s+)?afternoon\b/i.test(remaining)) {
      return { startTime: '14:00', remainingText: remaining.replace(/\b(?:in the\s+|this\s+)?afternoon\b/gi, ' '), matched: true };
    }
    if (/\b(?:in the\s+|this\s+)?evening\b/i.test(remaining)) {
      return { startTime: '18:00', remainingText: remaining.replace(/\b(?:in the\s+|this\s+)?evening\b/gi, ' '), matched: true };
    }
    if (/\btonight\b/i.test(remaining)) {
      return { startTime: '20:00', remainingText: remaining.replace(/\btonight\b/gi, ' '), matched: true };
    }

    const now = new Date();
    const nextHour = (now.getHours() + 1) % 24;
    return {
      startTime: `${String(nextHour).padStart(2, '0')}:00`,
      remainingText: remaining,
      matched: false,
    };
  }

  private extractDuration(text: string): { durationMinutes: number; remainingText: string; matched: boolean } {
    let remaining = text;
    const durationRegex = /\b(?:for\s+)?(\d+(?:\.\d+)?)\s*(hours?|hrs?|hr|minutes?|mins?|min)\b/i;
    const match = remaining.match(durationRegex);

    if (match) {
      const amount = parseFloat(match[1]);
      const unit = match[2].toLowerCase();
      const mins = unit.startsWith('h') ? Math.round(amount * 60) : Math.round(amount);
      const clamped = Math.max(10, Math.min(480, mins));
      remaining = remaining.replace(durationRegex, ' ');
      return { durationMinutes: clamped, remainingText: remaining, matched: true };
    }

    return { durationMinutes: 60, remainingText: remaining, matched: false };
  }

  private extractUrgency(text: string): { urgency: UrgencyLevel; remainingText: string } {
    let remaining = text;
    if (/\b(urgent|high priority|critical|important|asap)\b/i.test(remaining)) {
      remaining = remaining.replace(/\b(urgent|high priority|critical|important|asap)\b/gi, ' ');
      return { urgency: 'high', remainingText: remaining };
    }
    if (/\b(low priority|optional|whenever)\b/i.test(remaining)) {
      remaining = remaining.replace(/\b(low priority|optional|whenever)\b/gi, ' ');
      return { urgency: 'low', remainingText: remaining };
    }
    return { urgency: 'medium', remainingText: remaining };
  }

  private inferCategory(text: string): TaskCategory {
    const lower = text.toLowerCase();
    if (/\b(study|exam|quiz|calculus|physics|math|homework|review|read|lecture|class|research|thesis)\b/.test(lower)) {
      return 'study';
    }
    if (/\b(work|meeting|standup|client|code|coding|deploy|project|sprint|debug|presentation|email)\b/.test(lower)) {
      return 'work';
    }
    if (/\b(webinar|seminar|conference|party|dinner|lunch|appointment|doctor|hackathon|buildathon|event)\b/.test(lower)) {
      return 'event';
    }
    if (/\b(sleep|nap|rest|break|meditate|relax|recharge)\b/.test(lower)) {
      return 'rest';
    }
    return 'personal';
  }

  private toISODate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private formatSpokenDateLabel(dateStr: string): string {
    const todayStr = this.toISODate(new Date());
    const tom = new Date();
    tom.setDate(tom.getDate() + 1);
    const tomorrowStr = this.toISODate(tom);

    if (dateStr === todayStr) return 'today';
    if (dateStr === tomorrowStr) return 'tomorrow';

    const parsed = new Date(dateStr + 'T00:00:00');
    if (isNaN(parsed.getTime())) return dateStr;
    return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  private formatSpokenTime(time24: string): string {
    const [hStr, mStr] = time24.split(':');
    const h = parseInt(hStr || '0', 10);
    const m = parseInt(mStr || '0', 10);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    if (m === 0) return `${hour12} ${period}`;
    return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
  }
}

export const voiceService = new VoiceService();
