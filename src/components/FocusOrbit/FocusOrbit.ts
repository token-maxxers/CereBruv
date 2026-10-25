import { taskRepository } from '../../services/storage';
import { eventBus, AppEvents } from '../../services/events';
import {
  calculateOrbitSegments,
  analyzeDayWorkload,
} from './orbitCalculator';
import type { OrbitArcSegment, Task } from '../../types/task';

export function renderFocusOrbit(onOpenTaskForm: (date?: string) => void): HTMLElement {
  const container = document.createElement('div');
  container.className = 'card-section';
  container.style.padding = 'var(--spacing-3)';

  // Default to today in YYYY-MM-DD
  const todayObj = new Date();
  let selectedDate = todayObj.toISOString().split('T')[0];

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

        <!-- Center Hub Information -->
        <div style="position: absolute; width: 140px; height: 140px; border-radius: var(--radius-full); background: var(--bg-surface); box-shadow: var(--shadow-card); border: 1px solid var(--border-medium); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; pointer-events: none; padding: var(--spacing-2);">
          <div style="font-size: var(--font-size-xs); font-weight: 700; color: var(--color-black-muted); letter-spacing: 0.05em;" id="center-month-day"></div>
          <div style="font-size: var(--font-size-xl); font-weight: 800; color: var(--color-black-dominant); line-height: 1.1;" id="center-busy-hours">0h</div>
          <div style="font-size: 0.7rem; color: var(--color-black-muted); font-weight: 600;" id="center-free-time">Free: 16h</div>
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
    </div>
  `;

  const canvas = container.querySelector<HTMLCanvasElement>('#focus-orbit-canvas')!;
  const ctx = canvas.getContext('2d')!;
  const fullDateEl = container.querySelector<HTMLElement>('#orbit-full-date')!;
  const workloadBadge = container.querySelector<HTMLElement>('#orbit-workload-badge')!;
  const jumpTodayBtn = container.querySelector<HTMLButtonElement>('#jump-today-btn')!;
  const prevDayBtn = container.querySelector<HTMLButtonElement>('#prev-day-btn')!;
  const nextDayBtn = container.querySelector<HTMLButtonElement>('#next-day-btn')!;
  const centerMonthDay = container.querySelector<HTMLElement>('#center-month-day')!;
  const centerBusyHours = container.querySelector<HTMLElement>('#center-busy-hours')!;
  const centerFreeTime = container.querySelector<HTMLElement>('#center-free-time')!;
  const nextTaskBody = container.querySelector<HTMLElement>('#next-task-body')!;
  const nextTaskTimePill = container.querySelector<HTMLElement>('#next-task-time-pill')!;
  const nextTaskRationale = container.querySelector<HTMLElement>('#next-task-rationale')!;
  const weeklyStrip = container.querySelector<HTMLElement>('#weekly-strip')!;

  function getTodayString(): string {
    return new Date().toISOString().split('T')[0];
  }

  function changeDay(deltaDays: number) {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + deltaDays);
    selectedDate = current.toISOString().split('T')[0];
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

    // Filter tasks for the selected date
    const dayTasks = allTasks.filter(t => (t.date || todayStr) === selectedDate);

    const targetDate = new Date(selectedDate);
    const now = new Date();
    const currentFraction = isToday ? now.getHours() + now.getMinutes() / 60 : 0;

    // Set date labels
    fullDateEl.textContent = targetDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    centerMonthDay.textContent = `${targetDate.getMonth() + 1}/${targetDate.getDate()}`;

    // Render Weekly Strip with dots for tasks
    renderWeeklyStrip(weeklyStrip, allTasks, selectedDate);

    // Calculate workload and segments for this day
    const analysis = analyzeDayWorkload(dayTasks, currentFraction);
    const segments = calculateOrbitSegments(dayTasks);

    // Update workload badges
    const busyHours = (analysis.totalBusyMinutes / 60).toFixed(1);
    centerBusyHours.textContent = `${busyHours}h`;
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

    // Update Realistic Next Task Section
    if (analysis.realisticNextTask) {
      const next = analysis.realisticNextTask;
      nextTaskBody.textContent = next.title;
      nextTaskTimePill.textContent = `${next.startTime} (${next.durationMinutes}m)`;
      nextTaskRationale.textContent = `Suggested for ${targetDate.toLocaleDateString(undefined, { weekday: 'short' })} based on urgency (${next.urgency}) and duration.`;
    } else {
      nextTaskBody.textContent = dayTasks.length === 0 ? 'No tasks scheduled for this day.' : 'All tasks completed!';
      nextTaskTimePill.textContent = '';
      nextTaskRationale.textContent = dayTasks.length === 0 ? 'Tap + Add Task to schedule ahead.' : 'Great job! Day is clear.';
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
    const dialRadius = 105;
    const arcLineWidth = 18;

    // 1. Base Circular Track
    ctx.beginPath();
    ctx.arc(centerX, centerY, dialRadius, 0, Math.PI * 2);
    ctx.lineWidth = arcLineWidth;
    ctx.strokeStyle = '#EAE2D5';
    ctx.stroke();

    // 2. Hour Ticks (0, 6, 12, 18)
    for (let h = 0; h < 24; h++) {
      const angle = (h / 24) * Math.PI * 2 - Math.PI / 2;
      const isMajor = h % 6 === 0;
      const innerR = isMajor ? dialRadius - 16 : dialRadius - 12;
      const outerR = dialRadius - 9;

      const x1 = centerX + Math.cos(angle) * innerR;
      const y1 = centerY + Math.sin(angle) * innerR;
      const x2 = centerX + Math.cos(angle) * outerR;
      const y2 = centerY + Math.sin(angle) * outerR;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineWidth = isMajor ? 2 : 1;
      ctx.strokeStyle = isMajor ? '#121216' : '#A89F91';
      ctx.stroke();

      if (isMajor) {
        const textR = dialRadius - 26;
        const tx = centerX + Math.cos(angle) * textR;
        const ty = centerY + Math.sin(angle) * textR;
        ctx.fillStyle = '#5E5D67';
        ctx.font = 'bold 9px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(h), tx, ty);
      }
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
    const activeDate = new Date(activeDateStr);
    const dayOfWeek = activeDate.getDay(); // 0 = Sun
    const sunday = new Date(activeDate);
    sunday.setDate(activeDate.getDate() - dayOfWeek);

    const dayLetters = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    el.innerHTML = '';

    for (let i = 0; i < 7; i++) {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const isSelected = dateStr === activeDateStr;
      const isRealToday = dateStr === getTodayString();

      // Check if tasks exist on this day
      const hasTasks = allTasks.some(t => (t.date || getTodayString()) === dateStr);

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

  canvas.addEventListener('click', () => {
    onOpenTaskForm(selectedDate);
  });

  eventBus.on(AppEvents.TASK_CREATED, () => drawOrbit());
  eventBus.on(AppEvents.TASK_COMPLETED, () => drawOrbit());
  eventBus.on(AppEvents.TASK_DELETED, () => drawOrbit());

  drawOrbit();
  return container;
}
