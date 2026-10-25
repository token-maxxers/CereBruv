import { noteRepository } from '../../services/storage';
import { eventBus, AppEvents } from '../../services/events';

export function renderQuickCapture(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'quick-capture-container';

  container.innerHTML = `
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
    <button class="icon-btn" id="photo-upload-btn" title="Attach Photo / Screenshot (Vision ready)">
      <svg viewBox="0 0 24 24">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
    </button>
    <input type="file" id="photo-file-input" accept="image/*" style="display: none;" />
  `;

  const inputEl = container.querySelector<HTMLInputElement>('#quick-capture-input')!;
  const voiceBtn = container.querySelector<HTMLButtonElement>('#voice-memo-btn')!;
  const photoBtn = container.querySelector<HTMLButtonElement>('#photo-upload-btn')!;
  const fileInput = container.querySelector<HTMLInputElement>('#photo-file-input')!;

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

  // Handle Photo Picker
  photoBtn.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', async () => {
    if (fileInput.files && fileInput.files[0]) {
      const file = fileInput.files[0];
      const reader = new FileReader();
      reader.onload = async (e) => {
        const photoDataUrl = e.target?.result as string;
        await noteRepository.createNote({
          content: `Photo Capture: ${file.name}`,
          photoUrl: photoDataUrl,
        });
        eventBus.emit(AppEvents.NOTE_CREATED);
        alert(`Photo "${file.name}" saved to CereBruv memory.`);
      };
      reader.readAsDataURL(file);
    }
  });

  return container;
}
