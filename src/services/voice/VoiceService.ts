import { taskRepository, noteRepository, userStatsRepository } from '../storage';
import { geminiService } from '../ai/GeminiService';
import { eventBus, AppEvents } from '../events';
import { analyzeDayWorkload, sortTasksSmartly, timeStringToFractionalHour } from '../../components/FocusOrbit/orbitCalculator';
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
  categorySpecified?: boolean;
  urgency: UrgencyLevel;
  urgencySpecified?: boolean;
  targetTab?: 'orbit' | 'tasks' | 'thoughts' | 'graph' | 'cloud';
  rawText: string;
}

export interface PendingTaskDraft {
  title: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  durationSpecified: boolean;
  category: TaskCategory;
  categorySpecified: boolean;
  urgency: UrgencyLevel;
  urgencySpecified: boolean;
  rawTranscript: string;
}

export interface VoiceExecutionOutcome {
  intent: LocalVoiceIntent;
  headline: string;
  spokenReply: string;
}

export interface VoiceSyntaxStep {
  label: string;
  status: 'done' | 'active' | 'pending';
}

export interface VoicePredictionChip {
  label: string;
  insertText: string;
  replaceInput?: boolean;
}

export interface VoicePredictionGuide {
  template: string;
  nextPart: string;
  ghostSuffix: string;
  steps: VoiceSyntaxStep[];
  predictions: VoicePredictionChip[];
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
  private speechInactivityTimer: ReturnType<typeof setTimeout> | null = null;
  private maxRecordTimeout: ReturnType<typeof setTimeout> | null = null;
  private manualStopRequested: boolean = false;
  private useMediaRecorderFallback: boolean = false;
  private pendingTaskDraft: PendingTaskDraft | null = null;
  private liveOverrideTranscript: string | null = null;

  public setLiveTranscriptFromInput(text: string): void {
    if (this.listening) {
      this.liveOverrideTranscript = text;
    }
  }

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

  /**
   * Fixes common speech-to-text homophones at the start of a voice command
   * (e.g., Web Speech API frequently transcribes "Add" as "at", "ad", "had", or "and").
   */
  public normalizeSpokenCommandStart(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return raw;

    // Match optional "Hey Bruv" prefix followed by the first word
    const prefixMatch = trimmed.match(/^((?:hey|yo|ok|okay|hi|hello)\s+(?:cerebruv|bruv|bro|brev|brave|brad|bruh)[,.:!\s]*)?(.*)$/i);
    if (!prefixMatch) return raw;

    const wakePrefix = prefixMatch[1] || '';
    const rest = (prefixMatch[2] || '').trim();
    if (!rest) return raw;

    // If first word is "at", "ad", "had", "and", "ed", "odd" (and not "at [clock time]" like "at 8am")
    if (/^(?:at|ad|had|and|ed|odd)$/i.test(rest)) {
      return `${wakePrefix}Add`;
    }
    if (/^(?:at|ad|had|and|ed)\s+(?!\d{1,2}\b|noon\b|midnight\b)(.+)$/i.test(rest)) {
      return rest.replace(/^(?:at|ad|had|and|ed)\s+/i, `${wakePrefix}Add `);
    }
    if (/^(?:no|not|know|node)$/i.test(rest)) {
      return `${wakePrefix}Note`;
    }
    if (/^(?:no|not|know|node)\s+(.+)$/i.test(rest)) {
      return rest.replace(/^(?:no|not|know|node)\s+/i, `${wakePrefix}Note `);
    }
    return raw;
  }

  /**
   * Computes a simultaneous Predictive + Step-by-Step Guiding syntax model
   * for both inline input ghost-text and the interactive prediction bar.
   */
  public getLiveSyntaxTemplate(rawInput: string): VoicePredictionGuide | null {
    const trimmed = rawInput.trim();
    if (!trimmed) {
      return {
        template: 'Add [Task] at [Time] for [Duration] • Note [Thought] • Done with [Task]',
        nextPart: 'Choose or speak a command to start:',
        ghostSuffix: 'Add [Task Name] at [8:00 AM] for [45 mins]',
        steps: [
          { label: '1. Command (Add / Note / Done)', status: 'active' },
          { label: '2. Task or Thought', status: 'pending' },
          { label: '3. at [Time]', status: 'pending' },
          { label: '4. for [Duration]', status: 'pending' },
          { label: '5. Category & Priority', status: 'pending' },
        ],
        predictions: [
          { label: 'Add [Task]...', insertText: 'Add ', replaceInput: true },
          { label: 'Note [Thought]...', insertText: 'Note ', replaceInput: true },
          { label: 'Done with [Task]...', insertText: 'Done with ', replaceInput: true },
          { label: "What's my schedule?", insertText: "What's my schedule today?", replaceInput: true },
          { label: 'Open Thoughts', insertText: 'Open thoughts', replaceInput: true },
        ],
      };
    }

    const normalized = this.normalizeTranscript(trimmed);
    const body = normalized.replace(/^hey bruv[,.:!\s]*/i, '').trim();
    const lower = body.toLowerCase();

    // Partial prefix prediction while typing/speaking 1-3 characters (e.g. "a", "ad", "at", "sc", "pl")
    if (/^(?:a|ad|at|had|and|sc|sch|sche|sched|pl|pla|cr|cre)$/i.test(lower)) {
      const needsCompletion = !/^add$/i.test(lower);
      return {
        template: 'Add [Task Name] at [Time] for [Duration] under [Category] [Priority]',
        nextPart: needsCompletion
          ? 'Predicted "Add" — press Tab / tap chip or keep speaking [Task Name]'
          : 'Next: Say or type [Task Name]...',
        ghostSuffix: needsCompletion
          ? ' → Add [Task Name] at [8:00 AM] for [45m]'
          : ' [Task Name] at [8:00 AM] for [45m]',
        steps: [
          { label: '1. Add', status: 'active' },
          { label: '2. [Task Name]', status: 'pending' },
          { label: '3. at [Time]', status: 'pending' },
          { label: '4. for [Duration]', status: 'pending' },
          { label: '5. [Category / Priority]', status: 'pending' },
        ],
        predictions: [
          { label: 'Add ', insertText: 'Add ', replaceInput: true },
          { label: 'Add meeting at 9 AM', insertText: 'Add meeting at 9:00 AM for 45 mins under Work', replaceInput: true },
          { label: 'Add study session at 8 PM', insertText: 'Add study session at 8:00 PM for 1 hour under Study', replaceInput: true },
          { label: 'Add wake up at 7 AM', insertText: 'Add wake up at 7:00 AM for 30 mins under Personal high priority', replaceInput: true },
        ],
      };
    }

    // Partial prefix prediction for "Note" ("n", "no", "not")
    if (/^(?:n|no|not)$/i.test(lower)) {
      return {
        template: 'Note [Your Thought or Idea] under [Study | Work | Personal]',
        nextPart: 'Predicted "Note" — press Tab / tap chip or speak your thought',
        ghostSuffix: `${ 'Note'.slice(lower.length) } [Your Thought] under [Personal]`,
        steps: [
          { label: '1. Note', status: 'active' },
          { label: '2. [Your Thought]', status: 'pending' },
          { label: '3. under [Category]', status: 'pending' },
        ],
        predictions: [
          { label: 'Note ', insertText: 'Note ', replaceInput: true },
          { label: 'Note idea for project', insertText: 'Note idea for project under Work', replaceInput: true },
        ],
      };
    }

    // Partial prefix prediction for "Done with" ("d", "do", "don", "c", "co", "com")
    if (/^(?:d|do|don|c|co|com|f|fi|fin)$/i.test(lower)) {
      return {
        template: 'Done with [Task Name]',
        nextPart: 'Predicted "Done with" — press Tab / tap chip or say task name',
        ghostSuffix: ' → Done with [Task Name]',
        steps: [
          { label: '1. Done with', status: 'active' },
          { label: '2. [Task Name] (+25 XP)', status: 'pending' },
        ],
        predictions: [
          { label: 'Done with ', insertText: 'Done with ', replaceInput: true },
        ],
      };
    }

    // Partial prefix prediction for "What's my schedule" ("w", "wh", "wha", "s", "st", "sta")
    if (/^(?:w|wh|wha|s|st|sta)$/i.test(lower)) {
      return {
        template: "What's my schedule [today | tomorrow]?",
        nextPart: 'Predicted Schedule Check — tap chip or press Enter',
        ghostSuffix: " → What's my schedule today?",
        steps: [
          { label: "1. What's my schedule", status: 'active' },
          { label: '2. [today | tomorrow]', status: 'pending' },
        ],
        predictions: [
          { label: "What's my schedule today?", insertText: "What's my schedule today?", replaceInput: true },
          { label: "What's my schedule tomorrow?", insertText: "What's my schedule tomorrow?", replaceInput: true },
        ],
      };
    }

    // RULE 1: Full "Add / Schedule / Plan / Create" Guided + Predictive Flow
    if (/^(?:please\s+)?(?:add|schedule|plan|book|set|create)\b/i.test(lower)) {
      const afterVerb = body.replace(/^(?:please\s+)?(?:add|schedule|plan|book|set|create)\s*/i, '').trim();
      const hasTime = /\b(at|by|around|from|noon|midnight|morning|afternoon|evening|tonight|\d{1,2}\s*(?:a\.?m\.?|p\.?m\.?|:))\b/i.test(afterVerb);
      const endsWithAtPreposition = /\b(?:at|around|by|from)\s*$/i.test(afterVerb);
      const hasDuration = /\b(for\s+\d+|\d+\s*(?:hours?|hrs?|hr|minutes?|mins?|min))\b/i.test(afterVerb);
      const endsWithForPreposition = /\bfor\s*$/i.test(afterVerb);
      const hasCategory = /\b(study|work|personal|event|rest)\b/i.test(afterVerb);
      const endsWithUnderPreposition = /\b(?:under|in|category)\s*$/i.test(afterVerb);
      const hasPriority = /\b(high|medium|low|urgent|priority|critical)\b/i.test(afterVerb);

      const cleanTaskPreview = afterVerb
        .replace(/\b(at|by|around|from|for|under|in)\b.*$/i, '')
        .trim();

      const step1: VoiceSyntaxStep = { label: '✓ Add', status: 'done' };
      const step2: VoiceSyntaxStep = {
        label: cleanTaskPreview ? `✓ Task: "${cleanTaskPreview.slice(0, 18)}"` : '2. [Task Name]',
        status: cleanTaskPreview ? 'done' : 'active',
      };
      const step3: VoiceSyntaxStep = {
        label: hasTime && !endsWithAtPreposition ? '✓ Time' : '3. at [Time]',
        status: hasTime && !endsWithAtPreposition ? 'done' : cleanTaskPreview ? 'active' : 'pending',
      };
      const step4: VoiceSyntaxStep = {
        label: hasDuration && !endsWithForPreposition ? '✓ Duration' : '4. for [Duration]',
        status:
          hasDuration && !endsWithForPreposition
            ? 'done'
            : hasTime && !endsWithAtPreposition
              ? 'active'
              : 'pending',
      };
      const step5: VoiceSyntaxStep = {
        label: hasCategory && !endsWithUnderPreposition ? '✓ Category' : '5. under [Category]',
        status:
          hasCategory && !endsWithUnderPreposition
            ? 'done'
            : hasDuration && !endsWithForPreposition
              ? 'active'
              : 'pending',
      };
      const step6: VoiceSyntaxStep = {
        label: hasPriority ? '✓ Priority' : '6. [Priority]',
        status: hasPriority ? 'done' : hasCategory && !endsWithUnderPreposition ? 'active' : 'pending',
      };

      const steps = [step1, step2, step3, step4, step5, step6];

      // Step 2: Needs [Task Name]
      if (!afterVerb) {
        return {
          template: 'Add [Task Name] at [Time] for [Duration] under [Category] [Priority]',
          nextPart: 'Next: Say or type [Task Name] (e.g. "team meeting", "wake up")',
          ghostSuffix: rawInput.endsWith(' ')
            ? '[Task Name] at [8:00 AM] for [45 mins]'
            : ' [Task Name] at [8:00 AM] for [45 mins]',
          steps,
          predictions: [
            { label: 'meeting', insertText: 'meeting ' },
            { label: 'study session', insertText: 'study session ' },
            { label: 'workout', insertText: 'workout ' },
            { label: 'wake up', insertText: 'wake up ' },
          ],
        };
      }

      // Step 3a: User just typed/said "Add [Task] at" -> predict clock times directly!
      if (endsWithAtPreposition) {
        return {
          template: `${trimmed} [8:00 AM] for [45 mins] under [Category]`,
          nextPart: 'Next: Say or tap the [Time] (e.g. "8:00 AM", "2:30 PM")',
          ghostSuffix: rawInput.endsWith(' ')
            ? '[8:00 AM] for [45 mins] under [Work]'
            : ' [8:00 AM] for [45 mins] under [Work]',
          steps,
          predictions: [
            { label: '8:00 AM', insertText: '8:00 AM ' },
            { label: '9:00 AM', insertText: '9:00 AM ' },
            { label: '1:00 PM', insertText: '1:00 PM ' },
            { label: '6:00 PM', insertText: '6:00 PM ' },
            { label: '9:00 PM', insertText: '9:00 PM ' },
          ],
        };
      }

      // Step 3b: User has [Task Name], needs "at [Time]"
      if (!hasTime) {
        return {
          template: `Add "${afterVerb}" at [Time] for [Duration] under [Category]`,
          nextPart: 'Next: Say or tap "at [Time]" (e.g. "at 8:00 AM")',
          ghostSuffix: rawInput.endsWith(' ')
            ? 'at [8:00 AM] for [45 mins]'
            : ' at [8:00 AM] for [45 mins]',
          steps,
          predictions: [
            { label: 'at 8:00 AM', insertText: 'at 8:00 AM ' },
            { label: 'at 9:00 AM', insertText: 'at 9:00 AM ' },
            { label: 'at 2:00 PM', insertText: 'at 2:00 PM ' },
            { label: 'at 6:00 PM', insertText: 'at 6:00 PM ' },
            { label: 'tomorrow at 9 AM', insertText: 'tomorrow at 9:00 AM ' },
          ],
        };
      }

      // Step 4a: User ended with "for" -> predict durations directly
      if (endsWithForPreposition) {
        return {
          template: `${trimmed} [30 mins | 45 mins | 1 hour] under [Category]`,
          nextPart: 'Next: Say or tap the [Duration]',
          ghostSuffix: rawInput.endsWith(' ')
            ? '[45 mins] under [Work]'
            : ' [45 mins] under [Work]',
          steps,
          predictions: [
            { label: '30 mins', insertText: '30 mins ' },
            { label: '45 mins', insertText: '45 mins ' },
            { label: '1 hour', insertText: '1 hour ' },
            { label: '2 hours', insertText: '2 hours ' },
          ],
        };
      }

      // Step 4b: Needs "for [Duration]"
      if (!hasDuration) {
        return {
          template: `${trimmed} for [Duration] under [Study | Work | Personal | Event | Rest]`,
          nextPart: 'Next: Say "for [Duration]" (or tap avatar / Enter to finish)',
          ghostSuffix: rawInput.endsWith(' ')
            ? 'for [45 mins] under [Category]'
            : ' for [45 mins] under [Category]',
          steps,
          predictions: [
            { label: 'for 30 mins', insertText: 'for 30 mins ' },
            { label: 'for 45 mins', insertText: 'for 45 mins ' },
            { label: 'for 1 hour', insertText: 'for 1 hour ' },
            { label: 'for 2 hours', insertText: 'for 2 hours ' },
          ],
        };
      }

      // Step 5a: User ended with "under" -> predict categories directly
      if (endsWithUnderPreposition) {
        return {
          template: `${trimmed} [Study | Work | Personal | Event | Rest] [Priority]`,
          nextPart: 'Next: Say or tap [Category]',
          ghostSuffix: rawInput.endsWith(' ')
            ? '[Work | Study | Personal] [high priority]'
            : ' [Work | Study | Personal] [high priority]',
          steps,
          predictions: [
            { label: 'Work', insertText: 'Work ' },
            { label: 'Study', insertText: 'Study ' },
            { label: 'Personal', insertText: 'Personal ' },
            { label: 'Event', insertText: 'Event ' },
            { label: 'Rest', insertText: 'Rest ' },
          ],
        };
      }

      // Step 5b: Needs "under [Category]"
      if (!hasCategory) {
        return {
          template: `${trimmed} under [Study | Work | Personal | Event | Rest] [high priority]`,
          nextPart: 'Next: Say "under [Category]" (or tap avatar / Enter to finish)',
          ghostSuffix: rawInput.endsWith(' ')
            ? 'under [Work | Study | Personal]'
            : ' under [Work | Study | Personal]',
          steps,
          predictions: [
            { label: 'under Work', insertText: 'under Work ' },
            { label: 'under Study', insertText: 'under Study ' },
            { label: 'under Personal', insertText: 'under Personal ' },
            { label: 'under Event', insertText: 'under Event ' },
            { label: 'under Rest', insertText: 'under Rest ' },
          ],
        };
      }

      // Step 6: Needs [Priority]
      if (!hasPriority) {
        return {
          template: `${trimmed} [high | medium | low priority]`,
          nextPart: 'Optional: Say "[high | medium | low] priority" or tap avatar / Enter!',
          ghostSuffix: rawInput.endsWith(' ') ? '[high priority]' : ' [high priority]',
          steps,
          predictions: [
            { label: 'high priority', insertText: 'high priority' },
            { label: 'medium priority', insertText: 'medium priority' },
            { label: 'low priority', insertText: 'low priority' },
          ],
        };
      }

      return {
        template: `Ready to schedule: "${trimmed}"`,
        nextPart: 'All details set! Tap CereBruv avatar or press Enter to schedule.',
        ghostSuffix: ' ✓ (Press Enter or Tap Avatar)',
        steps,
        predictions: [],
      };
    }

    // RULE 2: Done with [Task Name]
    if (/^(?:done|done with|complete|finish|check off|mark)\b/i.test(lower)) {
      const afterVerb = body.replace(/^(?:done with|done|complete|finish|check off|mark)\s*/i, '').trim();
      const steps: VoiceSyntaxStep[] = [
        { label: '✓ Done with', status: 'done' },
        { label: afterVerb ? `✓ "${afterVerb}"` : '2. [Task Name]', status: afterVerb ? 'done' : 'active' },
      ];
      if (!afterVerb) {
        return {
          template: 'Done with [Task Name]',
          nextPart: 'Next: Say or type the [Task Name] you completed (+25 XP)',
          ghostSuffix: /^done$/i.test(lower)
            ? ' with [Task Name]'
            : rawInput.endsWith(' ')
              ? '[Task Name]'
              : ' [Task Name]',
          steps,
          predictions: /^done$/i.test(lower)
            ? [{ label: 'Done with ', insertText: 'Done with ', replaceInput: true }]
            : [],
        };
      }
      return {
        template: `Done with "${afterVerb}" (+25 XP)`,
        nextPart: 'Tap CereBruv avatar or press Enter to mark complete!',
        ghostSuffix: ' ✓ (+25 XP)',
        steps,
        predictions: [],
      };
    }

    // RULE 3: Note [Your Thought]
    if (/^(?:note|take a note|save note|brain dump|remember to|remember)\b/i.test(lower)) {
      const afterVerb = body.replace(/^(?:note|take a note|save note|brain dump|remember to|remember)\s*[:,-]?\s*/i, '').trim();
      const hasCat = /\b(study|work|personal|event|rest)\b/i.test(afterVerb);
      const steps: VoiceSyntaxStep[] = [
        { label: '✓ Note', status: 'done' },
        { label: afterVerb ? `✓ Thought` : '2. [Your Thought]', status: afterVerb ? 'done' : 'active' },
        { label: hasCat ? '✓ Category' : '3. under [Category]', status: hasCat ? 'done' : afterVerb ? 'active' : 'pending' },
      ];
      if (!afterVerb) {
        return {
          template: 'Note [Your Thought or Idea] under [Study | Work | Personal]',
          nextPart: 'Next: Speak or type your thought...',
          ghostSuffix: rawInput.endsWith(' ')
            ? '[Your Thought] under [Personal]'
            : ' [Your Thought] under [Personal]',
          steps,
          predictions: [
            { label: 'under Personal', insertText: 'under Personal' },
            { label: 'under Work', insertText: 'under Work' },
            { label: 'under Study', insertText: 'under Study' },
          ],
        };
      }
      return {
        template: `Note: "${afterVerb}" → Thoughts & Mind Graph`,
        nextPart: hasCat
          ? 'Tap CereBruv avatar or press Enter to save thought!'
          : 'Optional: Tag category or tap avatar / Enter to save!',
        ghostSuffix: hasCat
          ? ' ✓'
          : rawInput.endsWith(' ')
            ? 'under [Personal | Work | Study]'
            : ' under [Personal | Work | Study]',
        steps,
        predictions: hasCat
          ? []
          : [
              { label: 'under Personal', insertText: 'under Personal' },
              { label: 'under Work', insertText: 'under Work' },
              { label: 'under Study', insertText: 'under Study' },
            ],
      };
    }

    // RULE 4: Open [Tab]
    if (/^(?:open|show|go to|switch to)\b/i.test(lower)) {
      const hasTab = /\b(orbit|tasks?|thoughts?|notes?|graph|cloud)\b/i.test(lower);
      return {
        template: 'Open [orbit | tasks | thoughts | graph | cloud]',
        nextPart: hasTab ? 'Tap avatar or press Enter to switch tab!' : 'Next: Say or tap which tab to open',
        ghostSuffix: hasTab
          ? ' ✓'
          : rawInput.endsWith(' ')
            ? '[orbit | tasks | thoughts | graph | cloud]'
            : ' [orbit | tasks | thoughts | graph | cloud]',
        steps: [
          { label: '✓ Open', status: 'done' },
          { label: hasTab ? '✓ Tab Selected' : '2. [Tab Name]', status: hasTab ? 'done' : 'active' },
        ],
        predictions: [
          { label: 'orbit', insertText: 'Open orbit', replaceInput: true },
          { label: 'tasks', insertText: 'Open tasks', replaceInput: true },
          { label: 'thoughts', insertText: 'Open thoughts', replaceInput: true },
          { label: 'graph', insertText: 'Open graph', replaceInput: true },
          { label: 'cloud', insertText: 'Open cloud', replaceInput: true },
        ],
      };
    }

    // RULE 5: Schedule Query
    if (/^(?:what|read|check|tell|how|schedule|status)\b/i.test(lower)) {
      return {
        template: "What's my schedule [today | tomorrow]?",
        nextPart: 'Tap CereBruv avatar or press Enter to hear your schedule!',
        ghostSuffix: /\b(today|tomorrow)\b/i.test(lower) ? ' ✓' : ' today?',
        steps: [
          { label: "✓ Check Schedule", status: 'done' },
          { label: '2. [today | tomorrow]', status: 'active' },
        ],
        predictions: [
          { label: "What's my schedule today?", insertText: "What's my schedule today?", replaceInput: true },
          { label: "What's my schedule tomorrow?", insertText: "What's my schedule tomorrow?", replaceInput: true },
        ],
      };
    }

    // Fallback: User typed/spoke a task title or thought directly without "Add" or "Note" prefix
    const hasTime = /\b(at|by|around|from|\d{1,2}\s*(?:a\.?m\.?|p\.?m\.?|:))\b/i.test(lower);
    return {
      template: hasTime
        ? `Schedule Task: "${trimmed}" for [Duration] under [Category]`
        : `"${trimmed}" — Add "at [Time]" to schedule as Task, or press Enter for Thought`,
      nextPart: hasTime
        ? 'Next: Add "for [Duration]" or tap avatar / Enter to schedule!'
        : 'Predict: Tap "at [Time]" to schedule on Orbit, or save as Thought',
      ghostSuffix: hasTime
        ? rawInput.endsWith(' ')
          ? 'for [45 mins] under [Work]'
          : ' for [45 mins] under [Work]'
        : rawInput.endsWith(' ')
          ? 'at [8:00 AM] for [45 mins]'
          : ' at [8:00 AM] for [45 mins]',
      steps: [
        { label: `✓ "${trimmed.slice(0, 16)}"`, status: 'done' },
        { label: hasTime ? '✓ Time' : '2. at [Time] (for Task)', status: hasTime ? 'done' : 'active' },
        { label: '3. for [Duration]', status: hasTime ? 'active' : 'pending' },
      ],
      predictions: hasTime
        ? [
            { label: 'for 30 mins', insertText: 'for 30 mins ' },
            { label: 'for 45 mins', insertText: 'for 45 mins ' },
            { label: 'under Work', insertText: 'under Work ' },
            { label: 'high priority', insertText: 'high priority' },
          ]
        : [
            { label: `Add ${trimmed} at 8:00 AM`, insertText: `Add ${trimmed} at 8:00 AM `, replaceInput: true },
            { label: 'at 8:00 AM', insertText: 'at 8:00 AM ' },
            { label: 'at 2:00 PM', insertText: 'at 2:00 PM ' },
            { label: `Note ${trimmed}`, insertText: `Note ${trimmed}`, replaceInput: true },
          ],
    };
  }

  public getPendingTaskDraft(): PendingTaskDraft | null {
    return this.pendingTaskDraft;
  }

  public updatePendingTaskDraft(updates: Partial<PendingTaskDraft>): PendingTaskDraft | null {
    if (!this.pendingTaskDraft) return null;
    this.pendingTaskDraft = {
      ...this.pendingTaskDraft,
      ...updates,
    };
    eventBus.emit(AppEvents.VOICE_CLARIFY_TASK, this.pendingTaskDraft);
    return this.pendingTaskDraft;
  }

  public cancelPendingTaskDraft(): void {
    this.pendingTaskDraft = null;
    eventBus.emit(AppEvents.VOICE_CLARIFY_TASK, null);
  }

  public async confirmPendingTaskDraft(currentSelectedDate: string): Promise<VoiceExecutionOutcome | null> {
    const draft = this.pendingTaskDraft;
    if (!draft) return null;
    this.pendingTaskDraft = null;
    eventBus.emit(AppEvents.VOICE_CLARIFY_TASK, null);

    await taskRepository.createTask({
      title: draft.title,
      category: draft.category,
      date: draft.date,
      startTime: draft.startTime,
      durationMinutes: draft.durationMinutes,
      urgency: draft.urgency,
      notes: `Voice Command: "${draft.rawTranscript}"`,
    });

    if (draft.date !== currentSelectedDate) {
      eventBus.emit(AppEvents.DATE_SELECTED, draft.date);
    }
    eventBus.emit(AppEvents.TASK_CREATED);

    const dateLabel = this.formatSpokenDateLabel(draft.date);
    const timeLabel = this.formatSpokenTime(draft.startTime);
    const headline = `I got you, Bruv — Added "${draft.title}"`;
    const spokenReply = `I got you, Bruv. Scheduled ${draft.title} under ${draft.category} (${draft.urgency} priority) for ${dateLabel} at ${timeLabel}, for ${draft.durationMinutes} minutes.`;

    eventBus.emit(AppEvents.MASCOT_SPEAK, { headline, subspeech: spokenReply });
    this.speak(spokenReply);
    return { intent: 'create_task', headline, spokenReply };
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

  public setMuted(muted: boolean): void {
    this.muted = muted;
    localStorage.setItem(MUTE_STORAGE_KEY, String(this.muted));
    if (this.muted) {
      this.stopSpeaking();
    }
    this.emitState();
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
    this.manualStopRequested = false;
    this.liveOverrideTranscript = null;
    this.emitState('Listening, Bruv... Tap avatar again when finished');

    const initialHint = this.getLiveSyntaxTemplate('');
    eventBus.emit(AppEvents.VOICE_SYNTAX_HINT, initialHint);
    eventBus.emit(AppEvents.MASCOT_SPEAK, {
      headline: 'Listening, Bruv... (Tap avatar when done)',
      subspeech: initialHint ? initialHint.template : 'Speak at your own pace — I am listening.',
    });

    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    // If browser doesn't support SpeechRecognition or previously failed with Brave network block, use MediaRecorder
    if (!SpeechRec || this.useMediaRecorderFallback) {
      await this.startMediaRecorderListening(getSelectedDate, onTranscriptUpdate);
      return;
    }

    try {
      const recognition = new SpeechRec();
      this.activeRecognition = recognition;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      let accumulatedTranscript = '';
      let currentInterim = '';
      let switchedToFallback = false;

      const resetInactivityTimer = () => {
        if (this.speechInactivityTimer) {
          clearTimeout(this.speechInactivityTimer);
        }
        // Hold mic open for 6.5 seconds after the last spoken word so user can think & follow syntax template
        this.speechInactivityTimer = setTimeout(() => {
          if (this.listening) {
            this.stopListening();
          }
        }, 6500);
      };

      resetInactivityTimer();

      recognition.onresult = (event: any) => {
        resetInactivityTimer();
        let sessionFinal = '';
        let interim = '';

        for (let i = 0; i < event.results.length; i++) {
          const piece = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            sessionFinal += ' ' + piece;
          } else {
            interim += ' ' + piece;
          }
        }

        const rawCombined = (accumulatedTranscript + ' ' + sessionFinal + ' ' + interim).replace(/\s{2,}/g, ' ').trim();
        const combined = this.normalizeSpokenCommandStart(rawCombined);
        currentInterim = combined;
        this.liveOverrideTranscript = null;

        if (combined) {
          onTranscriptUpdate?.(combined);
          const hint = this.getLiveSyntaxTemplate(combined);
          eventBus.emit(AppEvents.VOICE_SYNTAX_HINT, hint);
          eventBus.emit(AppEvents.MASCOT_SPEAK, {
            headline: `Listening: "${combined}"`,
            subspeech: hint ? `${hint.template} — (${hint.nextPart})` : 'Keep speaking, or tap avatar to finish.',
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

        // Ignore 'no-speech' while user is still thinking before manual stop / inactivity timeout
        if (event.error === 'no-speech' && !this.manualStopRequested) {
          return;
        }

        if (this.speechInactivityTimer) {
          clearTimeout(this.speechInactivityTimer);
          this.speechInactivityTimer = null;
        }
        this.listening = false;
        this.activeRecognition = null;
        eventBus.emit(AppEvents.VOICE_SYNTAX_HINT, null);
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

        // If browser auto-ended recognition early during a brief pause and user hasn't stopped or timed out, seamlessly restart
        if (this.listening && !this.manualStopRequested && this.speechInactivityTimer) {
          if (currentInterim) {
            accumulatedTranscript = currentInterim;
          }
          try {
            recognition.start();
            return;
          } catch {
            // Fall through to finalize if restart fails
          }
        }

        if (this.speechInactivityTimer) {
          clearTimeout(this.speechInactivityTimer);
          this.speechInactivityTimer = null;
        }
        this.listening = false;
        this.activeRecognition = null;
        eventBus.emit(AppEvents.VOICE_SYNTAX_HINT, null);
        this.emitState();

        const spoken = (this.liveOverrideTranscript ?? (currentInterim || accumulatedTranscript)).trim();
        this.liveOverrideTranscript = null;
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
    this.manualStopRequested = true;
    if (this.speechInactivityTimer) {
      clearTimeout(this.speechInactivityTimer);
      this.speechInactivityTimer = null;
    }
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
            } else if (Date.now() - silenceStart > 4500) {
              this.stopListening();
            }
          }
        }, 120);
      } catch {}

      // Safety max recording duration (18 seconds)
      this.maxRecordTimeout = setTimeout(() => {
        if (this.listening) {
          this.stopListening();
        }
      }, 18000);
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
    if (this.pendingTaskDraft) return true;
    const normalized = this.normalizeTranscript(input).toLowerCase();
    if (
      normalized.startsWith('hey bruv') ||
      /^(schedule|add|plan|book|create)\b/i.test(normalized) ||
      /^(done|done with|complete|finish)\b/i.test(normalized) ||
      /^(note|take a note|save note|remember)\b/i.test(normalized) ||
      /^(what('s| is) my schedule|read my schedule|what('s| is) next)/i.test(normalized) ||
      /^open\s*(orbit|tasks|thoughts|notes|graph|cloud)?\b/i.test(normalized)
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
    const navMatch = lowerBody.match(/^(?:open|show|go to|switch to)\s+(?:the\s+|my\s+)?(orbit|tasks?|thoughts?|notes?|graph|cloud)\b/i);
    if (navMatch) {
      const rawTab = navMatch[1].toLowerCase();
      const targetTab = rawTab.startsWith('task')
        ? 'tasks'
        : rawTab.startsWith('thought') || rawTab.startsWith('note')
          ? 'thoughts'
          : (rawTab as 'orbit' | 'graph' | 'cloud');
      return {
        intent: 'navigate_tab',
        title: targetTab,
        date: referenceDateStr,
        startTime: '09:00',
        durationMinutes: 60,
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

    // RULE 4: Explicit Brain-Dump Note / Idea (Supports "note", "notes", "idea", "ideas")
    const explicitNoteMatch = body.match(/^(?:notes?|take a note|save a? note|brain dump|ideas?|remember to|remember)\b\s*[:,-]?\s*(.+)$/i);
    if (explicitNoteMatch && explicitNoteMatch[1]) {
      const rawNoteBody = explicitNoteMatch[1].trim();
      const catExtract = this.extractExplicitCategory(rawNoteBody);
      const urgExtract = this.extractUrgency(catExtract.remainingText);
      const cleanNoteText =
        urgExtract.remainingText
          .replace(/^(?:notes?|ideas?)\b\s*[:,-]?\s*/i, '')
          .replace(/[.,;!?]+\s*$/, '')
          .replace(/\s{2,}/g, ' ')
          .trim() || rawNoteBody;
      const resolvedCat = catExtract.matched ? catExtract.category : this.inferCategory(cleanNoteText);
      return {
        intent: 'create_note',
        title: cleanNoteText,
        date: referenceDateStr,
        startTime: '09:00',
        durationMinutes: 30,
        category: resolvedCat,
        categorySpecified: catExtract.matched,
        urgency: urgExtract.matched ? urgExtract.urgency : 'medium',
        urgencySpecified: urgExtract.matched,
        rawText: cleanNoteText,
      };
    }

    // RULE 5: Add / Schedule Task
    let working = body.replace(/^(?:(?:please|add|schedule|plan|book|set|create)\b\s*)+/i, '').trim();
    const startsWithTaskVerb = /^(?:please\s+)?(?:add|schedule|plan|book|set|create)\b/i.test(body);

    const dateExtraction = this.extractDate(working, referenceDateStr);
    working = dateExtraction.remainingText;

    const timeExtraction = this.extractTime(working);
    working = timeExtraction.remainingText;

    const durationExtraction = this.extractDuration(working);
    working = durationExtraction.remainingText;

    const urgencyExtraction = this.extractUrgency(working);
    working = urgencyExtraction.remainingText;

    const categoryExtraction = this.extractExplicitCategory(working);
    working = categoryExtraction.remainingText;

    if (!startsWithTaskVerb && !dateExtraction.matched && !timeExtraction.matched && !durationExtraction.matched) {
      const inferredNoteCat = categoryExtraction.matched
        ? categoryExtraction.category
        : this.inferCategory(working || body || rawTranscript);
      const cleanIdea = (working || body || rawTranscript)
        .replace(/^(?:notes?|ideas?)\b\s*[:,-]?\s*/i, '')
        .replace(/[.,;!?]+\s*$/, '')
        .trim();
      return {
        intent: 'create_note',
        title: cleanIdea,
        date: referenceDateStr,
        startTime: timeExtraction.startTime,
        durationMinutes: durationExtraction.durationMinutes,
        category: inferredNoteCat,
        urgency: urgencyExtraction.matched ? urgencyExtraction.urgency : 'medium',
        rawText: cleanIdea,
      };
    }

    let cleanedTitle = working
      .replace(/^(?:(?:please|add|schedule|plan|book|set|create|a|an|my|the|task|event|to|for)\b\s*)+/i, '')
      .replace(/\b(?:will be|is at|scheduled)\b/gi, ' ')
      .replace(/\s+(?:on|at|for|in|by|to|the|my|a|an)\s*$/gi, '')
      .replace(/^\s*(?:on|at|for|in|to)\s+/gi, '')
      .replace(/[.,;!?]+\s*$/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (!cleanedTitle) {
      cleanedTitle = 'Scheduled Focus Block';
    }

    const titleCased = cleanedTitle.charAt(0).toUpperCase() + cleanedTitle.slice(1);
    const category = categoryExtraction.matched
      ? categoryExtraction.category
      : this.inferCategory(titleCased + ' ' + rawTranscript);

    return {
      intent: 'create_task',
      title: titleCased,
      date: dateExtraction.dateStr,
      startTime: timeExtraction.startTime,
      durationMinutes: durationExtraction.durationMinutes,
      durationSpecified: durationExtraction.matched,
      category,
      categorySpecified: categoryExtraction.matched,
      urgency: urgencyExtraction.urgency,
      urgencySpecified: urgencyExtraction.matched,
      rawText: rawTranscript,
    };
  }

  public async executeVoiceCommand(
    rawTranscript: string,
    currentSelectedDate: string
  ): Promise<VoiceExecutionOutcome> {
    // 0. If awaiting clarification for a pending task draft, check if user is answering details via voice/text
    if (this.pendingTaskDraft) {
      const normalized = this.normalizeTranscript(rawTranscript).toLowerCase();
      if (/\b(cancel|nevermind|never mind|stop|discard)\b/i.test(normalized)) {
        this.cancelPendingTaskDraft();
        const headline = 'Task draft cancelled, Bruv.';
        const spokenReply = 'Got it, Bruv. Cancelled that task draft.';
        eventBus.emit(AppEvents.MASCOT_SPEAK, { headline, subspeech: spokenReply });
        this.speak(spokenReply);
        return { intent: 'create_task', headline, spokenReply };
      }

      const catCheck = this.extractExplicitCategory(normalized, true);
      const durCheck = this.extractDuration(normalized);
      const urgCheck = this.extractUrgency(normalized, true);
      const isConfirmWord = /\b(confirm|yes|yeah|yep|save|schedule it|add it|looks good|done|ok|okay)\b/i.test(normalized);

      if (catCheck.matched || durCheck.matched || urgCheck.matched || isConfirmWord) {
        if (catCheck.matched) {
          this.pendingTaskDraft.category = catCheck.category;
          this.pendingTaskDraft.categorySpecified = true;
        }
        if (durCheck.matched) {
          this.pendingTaskDraft.durationMinutes = durCheck.durationMinutes;
          this.pendingTaskDraft.durationSpecified = true;
        }
        if (urgCheck.matched) {
          this.pendingTaskDraft.urgency = urgCheck.urgency;
          this.pendingTaskDraft.urgencySpecified = true;
        }

        const confirmed = await this.confirmPendingTaskDraft(currentSelectedDate);
        if (confirmed) return confirmed;
      }
      // If user said a completely new command, clear draft and process new command
      this.cancelPendingTaskDraft();
    }

    // 0.5. If user only said a bare command starter word (e.g. "add", "done with", "note") without a task/thought name yet, show syntax guide instead of creating a placeholder
    const bareBody = this.normalizeTranscript(rawTranscript).replace(/^hey bruv[,.:!\s]*/i, '').trim().toLowerCase();
    if (/^(?:please\s+)?(?:add|schedule|plan|book|set|create|done|done with|complete|finish|note|take a note|save note|open)$/i.test(bareBody)) {
      const hint = this.getLiveSyntaxTemplate(rawTranscript);
      eventBus.emit(AppEvents.VOICE_SYNTAX_HINT, hint);
      const headline = hint ? `Syntax: ${hint.template}` : 'Tell me the task name, Bruv.';
      const spokenReply = `I'm ready, Bruv. Follow the template below: ${hint ? hint.template : 'Add task name at time'}.`;
      eventBus.emit(AppEvents.MASCOT_SPEAK, { headline, subspeech: spokenReply });
      this.speak(spokenReply);
      return { intent: 'query_schedule', headline, spokenReply };
    }

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
      const pending = sortTasksSmartly(dayTasks.filter(t => !t.completed), currentHourFraction);
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
        const overdueCount = pending.filter(
          t => timeStringToFractionalHour(t.startTime) + t.durationMinutes / 60 < currentHourFraction
        ).length;
        const taskListSummary = pending
          .slice(0, 3)
          .map(t => `${t.title} (${t.urgency} priority) at ${this.formatSpokenTime(t.startTime)}`)
          .join(', ');
        headline = `I got you, Bruv — ${pending.length} task${pending.length > 1 ? 's' : ''} ${dateLabel}.`;
        const overdueNote = overdueCount > 0 ? ` Note: ${overdueCount} task${overdueCount > 1 ? 's have' : ' has'} passed its scheduled window.` : '';
        spokenReply = `I got you, Bruv. Top priority next up is ${nextTask.title} at ${this.formatSpokenTime(nextTask.startTime)}. Full queue: ${taskListSummary}.${overdueNote} You have ${freeHours} hours of free orbit time.`;
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

    // 4. Create Task (with interactive Category / Duration / Priority clarification if not all specified)
    if (parsed.intent === 'create_task') {
      const allDetailsSpecified =
        Boolean(parsed.categorySpecified) &&
        Boolean(parsed.durationSpecified) &&
        Boolean(parsed.urgencySpecified);

      if (!allDetailsSpecified) {
        this.pendingTaskDraft = {
          title: parsed.title,
          date: parsed.date,
          startTime: parsed.startTime,
          durationMinutes: parsed.durationMinutes,
          durationSpecified: Boolean(parsed.durationSpecified),
          category: parsed.category,
          categorySpecified: Boolean(parsed.categorySpecified),
          urgency: parsed.urgency,
          urgencySpecified: Boolean(parsed.urgencySpecified),
          rawTranscript,
        };

        const dateLabel = this.formatSpokenDateLabel(parsed.date);
        const timeLabel = this.formatSpokenTime(parsed.startTime);
        const headline = `Got "${parsed.title}" (${dateLabel} at ${timeLabel}) — Confirm details, Bruv:`;
        const spokenReply = `I got "${parsed.title}" for ${dateLabel} at ${timeLabel}. What category, duration, and priority should I set, Bruv? You can say it or tap below.`;

        eventBus.emit(AppEvents.MASCOT_SPEAK, { headline, subspeech: spokenReply });
        eventBus.emit(AppEvents.VOICE_CLARIFY_TASK, this.pendingTaskDraft);
        this.speak(spokenReply);
        return { intent: 'create_task', headline, spokenReply };
      }

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
      const spokenReply = `I got you, Bruv. Scheduled ${parsed.title} under ${parsed.category} (${parsed.urgency} priority) for ${dateLabel} at ${timeLabel}, for ${parsed.durationMinutes} minutes.`;

      eventBus.emit(AppEvents.MASCOT_SPEAK, { headline, subspeech: spokenReply });
      this.speak(spokenReply);
      return { intent: 'create_task', headline, spokenReply };
    }

    // 5. Create Note / Idea (Saved to Thoughts Tab with Category & Priority — no alarms or deadlines)
    const noteCategory = parsed.category || this.inferCategory(parsed.rawText);
    const notePriority = parsed.urgency || 'medium';
    const noteContent = (parsed.title || parsed.rawText).trim();
    const savedNote = await noteRepository.createNote({
      content: noteContent,
      tags: [noteCategory],
      category: noteCategory,
      priority: notePriority,
    });
    eventBus.emit(AppEvents.NOTE_CREATED, savedNote);

    const headline = `Saved idea: "${noteContent}"`;
    const spokenReply = `Got it, Bruv. Saved "${noteContent}" to your Thoughts under ${noteCategory}.`;
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

  private extractUrgency(text: string, allowBareWords = false): { urgency: UrgencyLevel; remainingText: string; matched: boolean } {
    let remaining = text;
    if (/\b(urgent|high priority|critical|important|asap)\b/i.test(remaining) || (allowBareWords && /\bhigh\b/i.test(remaining))) {
      remaining = remaining.replace(/\b(urgent|high priority|critical|important|asap|high)\b/gi, ' ');
      return { urgency: 'high', remainingText: remaining, matched: true };
    }
    if (/\b(low priority|optional|whenever)\b/i.test(remaining) || (allowBareWords && /\blow\b/i.test(remaining))) {
      remaining = remaining.replace(/\b(low priority|optional|whenever|low)\b/gi, ' ');
      return { urgency: 'low', remainingText: remaining, matched: true };
    }
    if (/\b(medium priority|normal priority)\b/i.test(remaining) || (allowBareWords && /\bmedium\b/i.test(remaining))) {
      remaining = remaining.replace(/\b(medium priority|normal priority|medium)\b/gi, ' ');
      return { urgency: 'medium', remainingText: remaining, matched: true };
    }
    return { urgency: 'medium', remainingText: remaining, matched: false };
  }

  private extractExplicitCategory(
    text: string,
    allowBareCategory = false
  ): { category: TaskCategory; remainingText: string; matched: boolean } {
    let remaining = text;
    const explicitRegex = allowBareCategory
      ? /\b(?:(?:under|in|for|category)\s+)?(study|work|personal|event|rest)\b(?:\s+category)?/i
      : /\b(?:(?:under|in|category)\s+(study|work|personal|event|rest)|(study|work|personal|event|rest)\s+category)\b/i;

    const match = remaining.match(explicitRegex);
    if (match) {
      const cat = (match[1] || match[2]).toLowerCase() as TaskCategory;
      remaining = remaining.replace(explicitRegex, ' ');
      return { category: cat, remainingText: remaining, matched: true };
    }
    return { category: 'personal', remainingText: remaining, matched: false };
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
