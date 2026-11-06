import { taskRepository, userStatsRepository } from '../../services/storage';
import { eventBus, AppEvents } from '../../services/events';
import { voiceService } from '../../services/voice/VoiceService';
import { notificationService } from '../../services/notifications/NotificationService';
import {
  extractLinksFromText,
  mergeSavedLinks,
  openImageLightbox,
  renderSavedLinksHtml,
} from '../../utils/imageUtils';
import {
  calculateOrbitSegments,
  analyzeDayWorkload,
  fractionalHourToString,
  CATEGORY_COLORS,
} from './orbitCalculator';
import type { OrbitArcSegment, Task } from '../../types/task';

export function renderFocusOrbit(onOpenTaskForm: (date?: string, editTask?: Task) => void): HTMLElement {
  const container = document.createElement('div');
  container.className = 'card-section';
  container.style.padding = 'var(--spacing-3)';

  function formatLocalDate(d: Date = new Date()): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // Default to today in local YYYY-MM-DD
  let selectedDate = formatLocalDate();

  container.innerHTML = `
    <!-- Top Date & Navigation Strip (Matching Image 1) -->
    <div style="display: flex; flex-direction: column; gap: var(--spacing-2); margin-bottom: var(--spacing-3);">
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <button id="prev-day-btn" class="icon-btn" style="width: 26px; height: 26px;" title="Previous Day">
            <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>
          <h2 style="font-size: var(--font-size-base); font-weight: 800; color: var(--color-black-dominant); cursor: pointer;" id="orbit-full-date"></h2>
          <button id="next-day-btn" class="icon-btn" style="width: 26px; height: 26px;" title="Next Day">
            <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
        </div>
        <div style="display: flex; align-items: center; gap: 4px;">
          <button id="jump-today-btn" class="pill-badge" style="cursor: pointer; display: none; font-size: 0.65rem;">TODAY</button>
          <span class="pill-badge" id="orbit-workload-badge" style="font-size: 0.7rem;">CALCULATING...</span>
        </div>
      </div>

      <!-- Weekly Day & Date Strip (Image 1: S M T W T F S + dates 25, 26, 27...) -->
      <div id="weekly-strip" style="display: flex; justify-content: space-between; gap: 4px; padding: 4px 0;"></div>
    </div>

    <!-- 24-Hour Circular Dial Canvas Container -->
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative;">
      <div style="position: relative; width: 280px; height: 280px; display: flex; align-items: center; justify-content: center;">
        <canvas id="focus-orbit-canvas" width="280" height="280" style="width: 280px; height: 280px; cursor: pointer;"></canvas>

        <!-- Center Hub Information (With Real-Time Live Clock) -->
        <div style="position: absolute; width: 132px; height: 132px; border-radius: var(--radius-full); background: var(--bg-surface); box-shadow: var(--shadow-card); border: 1.5px solid var(--border-medium); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; pointer-events: none; padding: 6px; gap: 1px;">
          <div style="display: inline-flex; align-items: center; gap: 4px; background: rgba(229, 46, 46, 0.1); border: 1px solid rgba(229, 46, 46, 0.25); padding: 2px 7px; border-radius: 999px; margin-bottom: 1px;">
            <span style="width: 5px; height: 5px; border-radius: 50%; background: var(--color-red-primary);"></span>
            <span style="font-size: 0.68rem; font-weight: 800; color: var(--color-red-primary); font-variant-numeric: tabular-nums;" id="center-live-clock">--:--:--</span>
          </div>
          <div style="font-size: 0.62rem; font-weight: 700; color: var(--color-black-muted); letter-spacing: 0.03em;" id="center-month-day"></div>
          <div style="font-size: 1.2rem; font-weight: 800; color: var(--color-black-dominant); line-height: 1.05;" id="center-busy-hours">0h</div>
          <div style="font-size: 0.65rem; color: var(--color-black-muted); font-weight: 600;" id="center-free-time">Free: 16h</div>
        </div>

        <!-- Interactive Arc Popover Card -->
        <div id="orbit-arc-popover" style="display: none; position: absolute; inset: 18px; background: rgba(250, 247, 242, 0.98); backdrop-filter: blur(8px); border: 1.5px solid var(--border-medium); border-radius: var(--radius-lg); box-shadow: var(--shadow-float); padding: var(--spacing-3); z-index: 15; flex-direction: column; justify-content: space-between; text-align: left;">
          <div>
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 6px;">
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                <span id="popover-category-badge" style="font-size: 0.65rem; font-weight: 800; padding: 2px 8px; border-radius: 999px; color: #FFFFFF; text-transform: uppercase; letter-spacing: 0.04em;"></span>
                <span id="popover-urgency-badge" style="font-size: 0.62rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;"></span>
              </div>
              <button id="popover-close-btn" class="icon-btn" style="width: 24px; height: 24px; font-size: 1rem; border: none; background: var(--bg-surface-elevated);">&times;</button>
            </div>
            <h4 id="popover-task-title" style="font-size: var(--font-size-base); font-weight: 800; color: var(--color-black-dominant); margin: 4px 0 2px; line-height: 1.25;"></h4>
            <div id="popover-task-time" style="font-size: var(--font-size-xs); font-weight: 700; color: var(--color-black-soft);"></div>
            <div id="popover-task-photo-wrap" title="Tap to view attached screenshot" style="display: none; margin-top: 6px; border-radius: 6px; overflow: hidden; border: 1px solid var(--border-medium); max-height: 76px; background: #121216; cursor: pointer; position: relative;">
              <img id="popover-task-photo-img" src="" alt="Attached Screenshot" style="width: 100%; max-height: 76px; object-fit: cover; display: block;" />
              <span style="position: absolute; bottom: 3px; right: 5px; background: rgba(18,18,22,0.78); color: #FFFFFF; font-size: 0.55rem; font-weight: 800; padding: 1px 6px; border-radius: 999px;">Zoom Screenshot</span>
            </div>
            <p id="popover-task-notes" style="font-size: 0.72rem; color: var(--color-black-muted); margin-top: 6px; line-height: 1.35; max-height: 56px; overflow-y: auto;"></p>
            <div id="popover-task-links"></div>
          </div>
          <div id="popover-actions-row" style="display: flex; align-items: center; gap: 6px; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-subtle);">
            <button id="popover-complete-btn" class="pill-badge" style="flex: 1; cursor: pointer; justify-content: center; background: var(--color-black-dominant); color: #FAF7F2; border-color: var(--color-black-dominant); font-size: 0.68rem; padding: 6px 8px;">
              Complete
            </button>
            <button id="popover-edit-btn" class="pill-badge" style="cursor: pointer; font-size: 0.68rem; padding: 6px 10px;">
              Edit
            </button>
            <button id="popover-delete-btn" class="pill-badge" style="cursor: pointer; font-size: 0.68rem; padding: 6px 10px; color: var(--color-red-primary); border-color: rgba(229,46,46,0.35); background: var(--color-red-subtle);">
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Realistic Next Task Card (Matching Image 1 spec) -->
    <div id="realistic-next-task-container" style="margin-top: var(--spacing-3); background: var(--bg-surface-elevated); border: 1px solid var(--border-medium); border-left: 4px solid var(--color-red-primary); border-radius: var(--radius-md); padding: var(--spacing-3);">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
        <span style="font-size: 0.7rem; font-weight: 800; color: var(--color-red-primary); letter-spacing: 0.05em; text-transform: uppercase;">
          Realistic Next Task
        </span>
        <span id="next-task-time-pill" style="font-size: 0.7rem; font-weight: 600; color: var(--color-black-muted);"></span>
      </div>
      <div id="next-task-body" style="font-size: var(--font-size-sm); font-weight: 700; color: var(--color-black-dominant);">
        No tasks queued.
      </div>
      <div id="next-task-rationale" style="font-size: var(--font-size-xs); color: var(--color-black-muted); margin-top: 2px;">
        Tap + Add Task to plan realistic workload.
      </div>
      <div id="next-task-links"></div>
    </div>
  `;

  const canvas = container.querySelector<HTMLCanvasElement>('#focus-orbit-canvas')!;
  const ctx = canvas.getContext('2d')!;
  const fullDateEl = container.querySelector<HTMLElement>('#orbit-full-date')!;
  const workloadBadge = container.querySelector<HTMLElement>('#orbit-workload-badge')!;
  const jumpTodayBtn = container.querySelector<HTMLButtonElement>('#jump-today-btn')!;
  const prevDayBtn = container.querySelector<HTMLButtonElement>('#prev-day-btn')!;
  const nextDayBtn = container.querySelector<HTMLButtonElement>('#next-day-btn')!;
  const centerLiveClock = container.querySelector<HTMLElement>('#center-live-clock')!;
  const centerMonthDay = container.querySelector<HTMLElement>('#center-month-day')!;
  const centerBusyHours = container.querySelector<HTMLElement>('#center-busy-hours')!;
  const centerFreeTime = container.querySelector<HTMLElement>('#center-free-time')!;

  function formatFriendlyTime12(time24: string): string {
    const [hStr, mStr] = time24.split(':');
    const h = parseInt(hStr || '0', 10);
    const m = parseInt(mStr || '0', 10);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, '0')} ${period}`;
  }

  function updateLiveDigitalClock() {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const s = now.getSeconds();
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    const time12 = `${h12}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} ${period}`;
    const time24 = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    centerLiveClock.textContent = time12;
    const targetDate = new Date(selectedDate + 'T00:00:00');
    centerMonthDay.textContent = `${targetDate.getMonth() + 1}/${targetDate.getDate()} • ${time24}`;
  }
  const nextTaskBody = container.querySelector<HTMLElement>('#next-task-body')!;
  const nextTaskTimePill = container.querySelector<HTMLElement>('#next-task-time-pill')!;
  const nextTaskRationale = container.querySelector<HTMLElement>('#next-task-rationale')!;
  const nextTaskLinks = container.querySelector<HTMLDivElement>('#next-task-links')!;
  const weeklyStrip = container.querySelector<HTMLElement>('#weekly-strip')!;

  const arcPopover = container.querySelector<HTMLDivElement>('#orbit-arc-popover')!;
  const popoverCategoryBadge = container.querySelector<HTMLElement>('#popover-category-badge')!;
  const popoverUrgencyBadge = container.querySelector<HTMLElement>('#popover-urgency-badge')!;
  const popoverCloseBtn = container.querySelector<HTMLButtonElement>('#popover-close-btn')!;
  const popoverTaskTitle = container.querySelector<HTMLElement>('#popover-task-title')!;
  const popoverTaskTime = container.querySelector<HTMLElement>('#popover-task-time')!;
  const popoverPhotoWrap = container.querySelector<HTMLDivElement>('#popover-task-photo-wrap')!;
  const popoverPhotoImg = container.querySelector<HTMLImageElement>('#popover-task-photo-img')!;
  const popoverTaskNotes = container.querySelector<HTMLElement>('#popover-task-notes')!;
  const popoverTaskLinks = container.querySelector<HTMLDivElement>('#popover-task-links')!;
  const popoverActionsRow = container.querySelector<HTMLDivElement>('#popover-actions-row')!;
  const popoverCompleteBtn = container.querySelector<HTMLButtonElement>('#popover-complete-btn')!;
  const popoverEditBtn = container.querySelector<HTMLButtonElement>('#popover-edit-btn')!;
  const popoverDeleteBtn = container.querySelector<HTMLButtonElement>('#popover-delete-btn')!;

  let currentSegments: OrbitArcSegment[] = [];
  let currentDayTasks: Task[] = [];
  let activePopoverTask: Task | null = null;

  popoverCloseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    arcPopover.style.display = 'none';
    activePopoverTask = null;
  });

  popoverPhotoWrap.addEventListener('click', (e) => {
    e.stopPropagation();
    if (activePopoverTask?.photoUrl) {
      openImageLightbox(activePopoverTask.photoUrl, activePopoverTask.title);
    }
  });

  popoverCompleteBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!activePopoverTask) return;
    const updated = await taskRepository.toggleTaskCompletion(activePopoverTask.id);
    if (updated.completed) {
      const stats = await userStatsRepository.incrementTaskCount();
      eventBus.emit(AppEvents.STATS_UPDATED, stats);
      const congrats = `Awesome job, Bruv! You crushed "${updated.title}" and earned 25 XP!`;
      eventBus.emit(AppEvents.MASCOT_SPEAK, {
        headline: `Crushed "${updated.title}" (+25 XP)!`,
        subspeech: congrats,
      });
      voiceService.speak(congrats);
      notificationService.playAlarmChime('success');
      notificationService.triggerVibration([120, 60, 180]);
    }
    eventBus.emit(AppEvents.TASK_COMPLETED, updated);
    arcPopover.style.display = 'none';
    activePopoverTask = null;
    drawOrbit();
  });

  popoverEditBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!activePopoverTask) return;
    const taskToEdit = activePopoverTask;
    arcPopover.style.display = 'none';
    activePopoverTask = null;
    onOpenTaskForm(selectedDate, taskToEdit);
  });

  popoverDeleteBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!activePopoverTask) return;
    await taskRepository.deleteTask(activePopoverTask.id);
    eventBus.emit(AppEvents.TASK_DELETED, activePopoverTask.id);
    arcPopover.style.display = 'none';
    activePopoverTask = null;
    drawOrbit();
  });

  function getTodayString(): string {
    return formatLocalDate();
  }

  function changeDay(deltaDays: number) {
    const current = new Date(selectedDate + 'T00:00:00');
    current.setDate(current.getDate() + deltaDays);
    selectedDate = formatLocalDate(current);
    eventBus.emit(AppEvents.DATE_SELECTED, selectedDate);
    drawOrbit();
  }

  prevDayBtn.addEventListener('click', () => changeDay(-1));
  nextDayBtn.addEventListener('click', () => changeDay(1));
  jumpTodayBtn.addEventListener('click', () => {
    selectedDate = getTodayString();
    eventBus.emit(AppEvents.DATE_SELECTED, selectedDate);
    drawOrbit();
  });

  async function drawOrbit() {
    const allTasks = await taskRepository.getAllTasks();
    const todayStr = getTodayString();
    const isToday = selectedDate === todayStr;

    jumpTodayBtn.style.display = isToday ? 'none' : 'inline-block';

    // Filter tasks for the selected date (include undated uncompleted tasks when viewing Today)
    const dayTasks = allTasks.filter(t => t.date === selectedDate || (isToday && !t.date && !t.completed));

    const targetDate = new Date(selectedDate + 'T00:00:00');
    const now = new Date();
    const currentFraction = isToday ? now.getHours() + now.getMinutes() / 60 : 0;

    // Set date & live clock labels
    fullDateEl.textContent = targetDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    updateLiveDigitalClock();

    // Render Weekly Strip with dots for tasks
    renderWeeklyStrip(weeklyStrip, allTasks, selectedDate);

    // Calculate workload and segments for this day
    const analysis = analyzeDayWorkload(dayTasks, currentFraction);
    const segments = calculateOrbitSegments(dayTasks);
    currentSegments = segments;
    currentDayTasks = dayTasks;

    // Update workload badges
    const busyHours = (analysis.totalBusyMinutes / 60).toFixed(1);
    centerBusyHours.textContent = `${busyHours}h Planned`;
    const freeHours = (analysis.totalFreeMinutes / 60).toFixed(1);
    centerFreeTime.textContent = `Free: ${freeHours}h`;

    if (analysis.isOverloaded) {
      workloadBadge.textContent = 'OVERLOADED';
      workloadBadge.style.color = 'var(--color-red-primary)';
      workloadBadge.style.borderColor = 'var(--color-red-primary)';
      workloadBadge.style.background = 'var(--color-red-subtle)';
    } else if (dayTasks.length === 0) {
      workloadBadge.textContent = 'OPEN';
      workloadBadge.style.color = 'var(--color-black-muted)';
      workloadBadge.style.borderColor = 'var(--border-medium)';
      workloadBadge.style.background = 'transparent';
    } else {
      workloadBadge.textContent = 'BALANCED';
      workloadBadge.style.color = '#004D40';
      workloadBadge.style.borderColor = '#004D40';
      workloadBadge.style.background = '#E0F2F1';
    }

    // Update Realistic Next Task Section with clean, natural wording (no fake times/durations)
    if (analysis.realisticNextTask) {
      const next = analysis.realisticNextTask;
      const prioLabel = next.urgency === 'high' ? 'High Priority' : next.urgency === 'medium' ? 'Medium Priority' : 'Low Priority';
      const catLabel = next.category.charAt(0).toUpperCase() + next.category.slice(1);
      nextTaskBody.textContent = next.title;
      const timeLabel = next.startTime ? `${formatFriendlyTime12(next.startTime)} (${next.startTime})` : 'No set time';
      const durLabel = next.durationMinutes > 0 ? `${next.durationMinutes}m` : '';
      nextTaskTimePill.textContent = [timeLabel, durLabel].filter(Boolean).join(' • ');
      nextTaskRationale.textContent = `${catLabel} • ${prioLabel}`;
      const combinedLinks = mergeSavedLinks(next.links, extractLinksFromText(next.notes || ''));
      nextTaskLinks.innerHTML = renderSavedLinksHtml(combinedLinks);
    } else {
      nextTaskBody.textContent = dayTasks.length === 0 ? 'No tasks scheduled yet.' : 'All tasks completed for today!';
      nextTaskTimePill.textContent = '';
      nextTaskRationale.textContent = dayTasks.length === 0 ? 'Tap + or speak to CereBruv to plan your day.' : 'Great job staying on track, Bruv.';
      nextTaskLinks.innerHTML = '';
    }

    // Canvas Retina Scaling
    const dpr = window.devicePixelRatio || 1;
    const size = 280;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.resetTransform();
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, size, size);

    const centerX = size / 2;
    const centerY = size / 2;
    const dialRadius = 108;
    const arcLineWidth = 17;

    // 1. Base Circular Track
    ctx.beginPath();
    ctx.arc(centerX, centerY, dialRadius, 0, Math.PI * 2);
    ctx.lineWidth = arcLineWidth;
    ctx.strokeStyle = '#EAE2D5';
    ctx.stroke();

    // 2. Full 24-Hour Clock Ticks & Hour Numbers (0 through 23)
    for (let h = 0; h < 24; h++) {
      const angle = (h / 24) * Math.PI * 2 - Math.PI / 2;
      const isCardinal = h % 6 === 0;
      const isThreeHour = h % 3 === 0;
      const innerR = isCardinal ? dialRadius - 15 : isThreeHour ? dialRadius - 13.5 : dialRadius - 12;
      const outerR = dialRadius - 9;

      const x1 = centerX + Math.cos(angle) * innerR;
      const y1 = centerY + Math.sin(angle) * innerR;
      const x2 = centerX + Math.cos(angle) * outerR;
      const y2 = centerY + Math.sin(angle) * outerR;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineWidth = isCardinal ? 2 : isThreeHour ? 1.4 : 1;
      ctx.strokeStyle = isCardinal ? '#121216' : isThreeHour ? '#5E5D67' : '#B6ADA0';
      ctx.stroke();

      // Render every hour number (0 - 23) around the clock ring
      const textR = dialRadius - 24;
      const tx = centerX + Math.cos(angle) * textR;
      const ty = centerY + Math.sin(angle) * textR;
      ctx.fillStyle = isCardinal ? '#121216' : isThreeHour ? '#45444C' : '#857E73';
      ctx.font = isCardinal
        ? '800 9.5px -apple-system, sans-serif'
        : isThreeHour
          ? '700 8px -apple-system, sans-serif'
          : '600 7.2px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(h), tx, ty);
    }

    // 3. Task & Activity Arcs for the Selected Day
    segments.forEach(seg => {
      let s = seg.startHour;
      let e = seg.endHour;

      if (e > 24) {
        drawSingleArc(ctx, centerX, centerY, dialRadius, arcLineWidth, s, 24, seg);
        drawSingleArc(ctx, centerX, centerY, dialRadius, arcLineWidth, 0, e - 24, seg);
      } else {
        drawSingleArc(ctx, centerX, centerY, dialRadius, arcLineWidth, s, e, seg);
      }
    });

    // 4. Live Needle (Only shown if viewing Today)
    if (isToday) {
      const currentAngle = (currentFraction / 24) * Math.PI * 2 - Math.PI / 2;
      const needleR = dialRadius + (arcLineWidth / 2) + 3;
      const needleInnerR = dialRadius - (arcLineWidth / 2) - 3;

      ctx.beginPath();
      ctx.moveTo(centerX + Math.cos(currentAngle) * needleInnerR, centerY + Math.sin(currentAngle) * needleInnerR);
      ctx.lineTo(centerX + Math.cos(currentAngle) * needleR, centerY + Math.sin(currentAngle) * needleR);
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#E52E2E';
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(centerX + Math.cos(currentAngle) * needleR, centerY + Math.sin(currentAngle) * needleR, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#E52E2E';
      ctx.fill();

      // Draw live time label next to needle tip so user can see exact time on the ring
      const tipX = centerX + Math.cos(currentAngle) * (needleR + 13);
      const tipY = centerY + Math.sin(currentAngle) * (needleR + 13);
      const nowTime24 = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      ctx.font = '800 8.5px -apple-system, sans-serif';
      ctx.fillStyle = '#E52E2E';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(nowTime24, Math.max(18, Math.min(size - 18, tipX)), Math.max(10, Math.min(size - 10, tipY)));
    }
  }

  function drawSingleArc(
    c: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    r: number,
    lineWidth: number,
    startHour: number,
    endHour: number,
    seg: OrbitArcSegment
  ) {
    if (endHour <= startHour) return;

    const startAngle = (startHour / 24) * Math.PI * 2 - Math.PI / 2;
    const endAngle = (endHour / 24) * Math.PI * 2 - Math.PI / 2;

    c.beginPath();
    c.arc(cx, cy, r, startAngle, endAngle);
    c.lineWidth = lineWidth - 2;
    c.lineCap = 'round';

    if (seg.completed) {
      c.strokeStyle = '#A89F91';
      c.globalAlpha = 0.4;
      c.stroke();
      c.globalAlpha = 1.0;
    } else {
      c.strokeStyle = seg.color;
      c.stroke();
    }
  }

  function renderWeeklyStrip(el: HTMLElement, allTasks: Task[], activeDateStr: string) {
    const activeDate = new Date(activeDateStr + 'T00:00:00');
    const dayOfWeek = activeDate.getDay(); // 0 = Sun
    const sunday = new Date(activeDate);
    sunday.setDate(activeDate.getDate() - dayOfWeek);

    const dayLetters = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    el.innerHTML = '';

    for (let i = 0; i < 7; i++) {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + i);
      const dateStr = formatLocalDate(d);
      const isSelected = dateStr === activeDateStr;
      const isRealToday = dateStr === getTodayString();

      // Check if tasks exist on this day
      const hasTasks = allTasks.some(t => t.date === dateStr);

      const dayBox = document.createElement('div');
      dayBox.style.cssText = `
        flex: 1;
        padding: 5px 2px;
        text-align: center;
        border-radius: var(--radius-sm);
        background: ${isSelected ? 'var(--color-red-primary)' : 'var(--bg-surface-elevated)'};
        color: ${isSelected ? '#FFFFFF' : 'var(--color-black-dominant)'};
        font-weight: 700;
        cursor: pointer;
        border: 1px solid ${isSelected ? 'var(--color-red-primary)' : isRealToday ? 'var(--border-focus)' : 'var(--border-subtle)'};
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        transition: all var(--transition-fast);
      `;

      dayBox.innerHTML = `
        <span style="font-size: 0.65rem; color: ${isSelected ? '#FFFFFF' : 'var(--color-black-muted)'};">${dayLetters[i]}</span>
        <span style="font-size: var(--font-size-xs); font-weight: 800;">${d.getDate()}</span>
        ${hasTasks ? `<span style="width: 4px; height: 4px; border-radius: 50%; background: ${isSelected ? '#FFFFFF' : 'var(--color-red-primary)'}; margin-top: 1px;"></span>` : `<span style="height: 5px;"></span>`}
      `;

      dayBox.addEventListener('click', () => {
        selectedDate = dateStr;
        eventBus.emit(AppEvents.DATE_SELECTED, selectedDate);
        drawOrbit();
      });

      el.appendChild(dayBox);
    }
  }

  function isHourWithinSegment(hour: number, seg: OrbitArcSegment): boolean {
    if (seg.endHour > 24) {
      return (hour >= seg.startHour && hour <= 24) || (hour >= 0 && hour <= seg.endHour - 24);
    }
    return hour >= seg.startHour && hour <= seg.endHour;
  }

  function showSegmentPopover(seg: OrbitArcSegment) {
    const startStr = fractionalHourToString(seg.startHour);
    const endStr = fractionalHourToString(seg.endHour);

    if (seg.taskId === 'sleep_block') {
      activePopoverTask = null;
      popoverCategoryBadge.textContent = 'Rest & Sleep';
      popoverCategoryBadge.style.background = '#7C3AED';
      popoverUrgencyBadge.textContent = '8h Recovery';
      popoverUrgencyBadge.style.background = '#EDE9FE';
      popoverUrgencyBadge.style.color = '#5B21B6';
      popoverTaskTitle.textContent = 'Rest & Sleep Window';
      popoverTaskTime.textContent = `${startStr} – ${endStr} (23:00 to 07:00)`;
      popoverPhotoWrap.style.display = 'none';
      popoverTaskNotes.textContent = 'Protected 8-hour downtime block so your Focus Orbit calculates realistic 16h waking capacity.';
      popoverTaskLinks.innerHTML = '';
      popoverActionsRow.style.display = 'none';
      arcPopover.style.display = 'flex';
      return;
    }

    const matchedTask = currentDayTasks.find(t => t.id === seg.taskId) || null;
    activePopoverTask = matchedTask;

    const catColor = CATEGORY_COLORS[seg.category] || '#E52E2E';
    popoverCategoryBadge.textContent = seg.category;
    popoverCategoryBadge.style.background = catColor;

    popoverUrgencyBadge.textContent = `${seg.urgency} priority`;
    if (seg.urgency === 'high') {
      popoverUrgencyBadge.style.background = 'var(--color-red-subtle)';
      popoverUrgencyBadge.style.color = 'var(--color-red-primary)';
    } else if (seg.urgency === 'medium') {
      popoverUrgencyBadge.style.background = '#FEF3C7';
      popoverUrgencyBadge.style.color = '#B45309';
    } else {
      popoverUrgencyBadge.style.background = 'var(--bg-surface-elevated)';
      popoverUrgencyBadge.style.color = 'var(--color-black-muted)';
    }

    popoverTaskTitle.textContent = seg.title;
    const durationMins = matchedTask ? matchedTask.durationMinutes : Math.round((seg.endHour - seg.startHour) * 60);
    popoverTaskTime.textContent =
      durationMins > 0
        ? `${startStr} – ${endStr} (${durationMins} mins)${seg.completed ? ' • Completed' : ''}`
        : `${startStr}${seg.completed ? ' • Completed' : ''}`;
    if (matchedTask?.photoUrl) {
      popoverPhotoImg.src = matchedTask.photoUrl;
      popoverPhotoWrap.style.display = 'block';
    } else {
      popoverPhotoImg.src = '';
      popoverPhotoWrap.style.display = 'none';
    }
    popoverTaskNotes.textContent = matchedTask?.notes || 'Scheduled on your Focus Orbit. Tap Edit to adjust category, time, or duration.';
    const popLinks = mergeSavedLinks(matchedTask?.links, extractLinksFromText(matchedTask?.notes || ''));
    popoverTaskLinks.innerHTML = renderSavedLinksHtml(popLinks);
    popoverTaskLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', ev => ev.stopPropagation()));

    popoverCompleteBtn.textContent = seg.completed ? 'Reopen Task' : 'Complete (+25 XP)';
    popoverActionsRow.style.display = matchedTask ? 'flex' : 'none';
    arcPopover.style.display = 'flex';
  }

  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Check if user clicked on the circular dial track (radius 108 ± 22px)
    if (dist >= 84 && dist <= 130) {
      let angle = Math.atan2(dy, dx) + Math.PI / 2;
      if (angle < 0) angle += Math.PI * 2;
      const clickedHour = (angle / (Math.PI * 2)) * 24;

      // Prioritize user task arcs first, then sleep_block
      const taskSegs = currentSegments.filter(s => s.taskId !== 'sleep_block');
      const hitTaskSeg = taskSegs.find(s => isHourWithinSegment(clickedHour, s));
      if (hitTaskSeg) {
        showSegmentPopover(hitTaskSeg);
        return;
      }

      const sleepSeg = currentSegments.find(s => s.taskId === 'sleep_block');
      if (sleepSeg && isHourWithinSegment(clickedHour, sleepSeg)) {
        showSegmentPopover(sleepSeg);
        return;
      }
    }

    onOpenTaskForm(selectedDate);
  });

  eventBus.on(AppEvents.TASK_CREATED, () => drawOrbit());
  eventBus.on(AppEvents.TASK_UPDATED, () => drawOrbit());
  eventBus.on(AppEvents.TASK_COMPLETED, () => drawOrbit());
  eventBus.on(AppEvents.TASK_DELETED, () => drawOrbit());
  eventBus.on(AppEvents.DATE_SELECTED, (newDate: string) => {
    if (newDate && newDate !== selectedDate) {
      selectedDate = newDate;
      drawOrbit();
    }
  });

  // Real-time 1-second live clock ticker + 15-second orbit needle redraw & midnight rollover
  let lastKnownToday = getTodayString();
  let lastRedrawMinute = new Date().getMinutes();
  const liveClockTimer = setInterval(() => {
    if (!container.isConnected) {
      clearInterval(liveClockTimer);
      return;
    }
    updateLiveDigitalClock();
    const now = new Date();
    const currentToday = getTodayString();
    if (currentToday !== lastKnownToday) {
      if (selectedDate === lastKnownToday) {
        selectedDate = currentToday;
        eventBus.emit(AppEvents.DATE_SELECTED, selectedDate);
      }
      lastKnownToday = currentToday;
      drawOrbit();
    } else if (now.getMinutes() !== lastRedrawMinute) {
      lastRedrawMinute = now.getMinutes();
      drawOrbit();
    }
  }, 1000);

  drawOrbit();
  return container;
}
