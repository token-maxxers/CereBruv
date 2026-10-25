import mascotImg from './assets/mascot.png';

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <div class="mobile-container">
    <!-- Header -->
    <header class="app-header">
      <div class="brand-section">
        <img src="${mascotImg}" alt="CereBruv Official Mascot" class="brand-logo" />
        <div class="brand-titles">
          <h1 class="brand-name">Cere<span>Bruv</span></h1>
          <span class="brand-tagline">Think it through, CereBruv's got you</span>
        </div>
      </div>
      <div class="status-badge-group">
        <div class="pill-badge active-streak" id="streak-badge">
          <span>STREAK</span>
          <strong id="streak-count">0d</strong>
        </div>
        <div class="pill-badge" id="xp-badge">
          <span id="xp-count">0 XP</span>
        </div>
      </div>
    </header>

    <!-- Companion Dynamic Banner -->
    <div class="mascot-banner" id="mascot-banner">
      <img src="${mascotImg}" alt="CereBruv Mascot" class="mascot-avatar-small" />
      <div class="mascot-speech" id="mascot-speech">
        Ready for input, Bruv.
        <span>No scheduled tasks yet. Add one below to ignite your Focus Orbit.</span>
      </div>
    </div>

    <!-- Main Content Area -->
    <main class="main-content" id="main-content">
      <!-- Active View will be injected here by Navigation router -->
      <section class="card-section" id="active-view-container">
        <div class="section-header">
          <h2 class="section-title">Focus Orbit (Phase 1 Skeleton)</h2>
          <span class="section-action" id="current-date-label"></span>
        </div>
        <p style="font-size: var(--font-size-sm); color: var(--color-black-muted); line-height: 1.6;">
          Design system initialized with dominant warm beige canvas, official red mascot, and dark contrast typography.
        </p>
      </section>
    </main>

    <!-- Bottom Navigation Bar -->
    <nav class="bottom-nav">
      <button class="nav-item active" data-tab="orbit">
        <svg class="nav-icon" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3 A9 9 0 0 1 21 12" stroke-width="3" />
        </svg>
        <span>Orbit</span>
      </button>

      <button class="nav-item" data-tab="tasks">
        <svg class="nav-icon" viewBox="0 0 24 24">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M7 12l3 3 7-7" />
        </svg>
        <span>Tasks</span>
      </button>

      <button class="nav-item" data-tab="graph">
        <svg class="nav-icon" viewBox="0 0 24 24">
          <circle cx="6" cy="6" r="3" />
          <circle cx="18" cy="6" r="3" />
          <circle cx="12" cy="18" r="3" />
          <line x1="8" y1="8" x2="16" y2="8" />
          <line x1="8" y1="8" x2="12" y2="16" />
          <line x1="16" y1="8" x2="12" y2="16" />
        </svg>
        <span>Graph</span>
      </button>

      <button class="nav-item" data-tab="settings">
        <svg class="nav-icon" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        <span>Cloud</span>
      </button>
    </nav>
  </div>
`;

// Display current date
const dateEl = document.querySelector('#current-date-label');
if (dateEl) {
  const now = new Date();
  dateEl.textContent = now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
