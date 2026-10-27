import { noteRepository, taskRepository } from '../../services/storage';
import { geminiService } from '../../services/ai/GeminiService';
import { eventBus, AppEvents } from '../../services/events';
import type { TaskCategory, UrgencyLevel } from '../../types/task';

export function renderQuickCapture(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'quick-capture-wrapper';
  container.style.position = 'relative';

  container.innerHTML = `
    <div class="quick-capture-container">
      <input 
        type="text" 
        class="quick-capture-input" 
        id="quick-capture-input" 
        placeholder="Brain-dump a thought, task, or note..."
      />
      <button class="icon-btn" id="voice-memo-btn" title="Voice Dictation (Web Speech API / Gemini ready)">
        <svg viewBox="0 0 24 24">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      </button>
      <button class="icon-btn" id="photo-upload-btn" title="Scan to-do list / notes with Gemini Vision">
        <svg viewBox="0 0 24 24">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      </button>
      <input type="file" id="photo-file-input" accept="image/*" style="display: none;" />
    </div>

    <!-- Extracted Tasks Confirmation Drawer/Panel -->
    <div id="ai-task-proposals" style="display: none; margin-top: var(--spacing-2); background: var(--bg-surface); border: 1px solid var(--border-medium); border-radius: var(--radius-md); padding: var(--spacing-3); box-shadow: var(--shadow-card);">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--spacing-2);">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--color-red-primary);"></span>
          <strong style="font-size: var(--font-size-xs); color: var(--color-black-dominant); text-transform: uppercase; letter-spacing: 0.05em;" id="ai-proposal-title">
            Gemini Extracted Tasks
          </strong>
        </div>
        <button id="ai-proposal-close" class="icon-btn" style="width: 22px; height: 22px; font-size: 1rem; border: none; background: transparent; cursor: pointer;">&times;</button>
      </div>
      <p style="font-size: var(--font-size-xs); color: var(--color-black-muted); margin-bottom: var(--spacing-2);" id="ai-proposal-sub">
        Tap any task below to schedule it directly to your Focus Orbit.
      </p>
      <div id="ai-proposal-list" style="display: flex; flex-direction: column; gap: 6px;"></div>
    </div>
  `;

  const inputEl = container.querySelector<HTMLInputElement>('#quick-capture-input')!;
  const voiceBtn = container.querySelector<HTMLButtonElement>('#voice-memo-btn')!;
  const photoBtn = container.querySelector<HTMLButtonElement>('#photo-upload-btn')!;
  const fileInput = container.querySelector<HTMLInputElement>('#photo-file-input')!;

  const proposalsBox = container.querySelector<HTMLDivElement>('#ai-task-proposals')!;
  const proposalTitle = container.querySelector<HTMLElement>('#ai-proposal-title')!;
  const proposalSub = container.querySelector<HTMLElement>('#ai-proposal-sub')!;
  const proposalList = container.querySelector<HTMLDivElement>('#ai-proposal-list')!;
  const proposalClose = container.querySelector<HTMLButtonElement>('#ai-proposal-close')!;

  proposalClose.addEventListener('click', () => {
    proposalsBox.style.display = 'none';
    proposalList.innerHTML = '';
  });

  // Handle Quick Note Submission
  inputEl.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && inputEl.value.trim()) {
      const text = inputEl.value.trim();
      inputEl.value = '';
      inputEl.disabled = true;

      await noteRepository.createNote({ content: text });
      eventBus.emit(AppEvents.NOTE_CREATED);
      inputEl.disabled = false;
      inputEl.placeholder = 'Saved to second brain! Type another...';
      setTimeout(() => {
        inputEl.placeholder = 'Brain-dump a thought, task, or note...';
      }, 2500);
    }
  });

  // Handle Speech Recognition
  let isRecording = false;
  let recognition: any = null;

  const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (SpeechRec) {
    recognition = new SpeechRec();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      isRecording = true;
      voiceBtn.classList.add('recording');
      inputEl.placeholder = 'Listening... Speak your thought';
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      inputEl.value = (inputEl.value ? inputEl.value + ' ' : '') + transcript;
    };

    recognition.onerror = () => {
      isRecording = false;
      voiceBtn.classList.remove('recording');
      inputEl.placeholder = 'Brain-dump a thought, task, or note...';
    };

    recognition.onend = () => {
      isRecording = false;
      voiceBtn.classList.remove('recording');
      inputEl.placeholder = 'Brain-dump a thought, task, or note...';
    };
  }

  voiceBtn.addEventListener('click', () => {
    if (!recognition) {
      alert('Speech recognition not supported in this browser. Type manually or use Chrome/Edge.');
      return;
    }
    if (isRecording) {
      recognition.stop();
    } else {
      recognition.start();
    }
  });

  // Handle Photo Picker & Gemini Task Extraction
  photoBtn.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', async () => {
    if (!fileInput.files || !fileInput.files[0]) return;
    const file = fileInput.files[0];
    fileInput.value = ''; // Reset input to allow re-uploading same file

    // 1. Save extracted note text only (do NOT store base64/data URLs in Firestore)
    await noteRepository.createNote({
      content: `Photo Note: "${file.name}" scanned with Gemini Vision`
    });
    eventBus.emit(AppEvents.NOTE_CREATED);

    // Show loading state in proposals drawer
    proposalsBox.style.display = 'block';
    proposalTitle.textContent = 'Scanning image with Gemini...';
    proposalSub.textContent = `Analyzing "${file.name}" for tasks and to-do items...`;
    proposalList.innerHTML = `
      <div style="font-size: var(--font-size-xs); color: var(--color-black-muted); padding: 8px 0; text-align: center;">
        Reading handwritten / printed text...
      </div>
    `;

    try {
      const extractedTasks = await geminiService.extractTasksFromImage(file);

      if (extractedTasks.length === 0) {
        proposalTitle.textContent = 'No Actionable Tasks Detected';
        proposalSub.textContent = 'Gemini could not find clear to-do items in this image.';
        proposalList.innerHTML = `
          <button class="pill-badge" id="dismiss-empty-proposals" style="cursor: pointer; align-self: center; margin-top: 4px;">
            Dismiss
          </button>
        `;
        container.querySelector('#dismiss-empty-proposals')?.addEventListener('click', () => {
          proposalsBox.style.display = 'none';
        });
        return;
      }

      proposalTitle.textContent = `Gemini Found ${extractedTasks.length} Task${extractedTasks.length > 1 ? 's' : ''}`;
      proposalSub.textContent = 'Tap any item to add it directly to today\'s schedule:';
      proposalList.innerHTML = '';

      const todayStr = new Date().toISOString().split('T')[0];

      extractedTasks.forEach((item, index) => {
        const itemRow = document.createElement('div');
        itemRow.style.cssText = `
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--bg-surface-elevated);
          padding: 8px 10px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border-subtle);
          cursor: pointer;
          transition: transform 0.15s ease, background 0.15s ease;
        `;

        const categoryTag = (item.category || 'personal').toUpperCase();
        const durationTag = item.durationMinutes ? `${item.durationMinutes}m` : '30m';

        itemRow.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 2px; flex: 1; margin-right: 8px;">
            <strong style="font-size: var(--font-size-xs); color: var(--color-black-dominant); word-break: break-word;">
              ${item.title || 'Untitled'}
            </strong>
            <span style="font-size: 0.65rem; color: var(--color-black-muted); font-weight: 600;">
              ${categoryTag} &bull; ${durationTag} &bull; Urgency: ${item.urgency || 'medium'}
            </span>
          </div>
          <button class="pill-badge" style="background: var(--color-red-primary); color: #FAF7F2; border: none; font-size: 0.65rem; font-weight: 700; cursor: pointer; padding: 3px 8px; flex-shrink: 0;">
            + ADD
          </button>
        `;

        const handleAddTask = async (e: Event) => {
          e.stopPropagation();
          itemRow.style.opacity = '0.5';
          itemRow.style.pointerEvents = 'none';

          // Assign default start time (next whole hour)
          const now = new Date();
          const nextHour = (now.getHours() + 1 + index) % 24;
          const startTime = `${String(nextHour).padStart(2, '0')}:00`;

          await taskRepository.createTask({
            title: item.title || 'Extracted Task',
            category: (item.category || 'personal') as TaskCategory,
            date: todayStr,
            startTime,
            durationMinutes: item.durationMinutes || 30,
            urgency: (item.urgency || 'medium') as UrgencyLevel,
            notes: `Extracted via Gemini Vision from "${file.name}"`
          });

          eventBus.emit(AppEvents.TASK_CREATED);

          itemRow.innerHTML = `
            <div style="font-size: var(--font-size-xs); color: var(--color-black-muted); font-weight: 600;">
              Added to today's Focus Orbit at ${startTime}
            </div>
            <span style="font-size: 0.75rem; color: var(--color-red-primary); font-weight: 800;">ADDED</span>
          `;

          // Auto-hide panel if all proposed tasks have been added
          setTimeout(() => {
            const remaining = proposalList.querySelectorAll('[style*="pointer-events: none"]').length;
            if (remaining === extractedTasks.length) {
              proposalsBox.style.display = 'none';
            }
          }, 1200);
        };

        itemRow.addEventListener('click', handleAddTask);
        proposalList.appendChild(itemRow);
      });
    } catch (err) {
      console.warn('Gemini vision extraction failed:', err);
      proposalTitle.textContent = 'Extraction Unavailable';
      proposalSub.textContent = 'Could not process the photo with Gemini Vision (check network or try again).';
      proposalList.innerHTML = `
        <button class="pill-badge" id="dismiss-err-proposals" style="cursor: pointer; align-self: center; margin-top: 4px;">
          Dismiss
        </button>
      `;
      container.querySelector('#dismiss-err-proposals')?.addEventListener('click', () => {
        proposalsBox.style.display = 'none';
      });
    }
  });

  return container;
}
