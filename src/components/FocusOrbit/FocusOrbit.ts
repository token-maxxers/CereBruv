import { taskRepository } from '../../services/storage';
import { eventBus, AppEvents } from '../../services/events';
import {
  calculateOrbitSegments,
  analyzeDayWorkload,
} from './orbitCalculator';
import type { OrbitArcSegment } from '../../types/task';

export function renderFocusOrbit(onOpenTaskForm: () => void): HTMLElement {
  const container = document.createElement('div');
  container.className = 'card-section';
  container.style.padding = 'var(--spacing-3)';

  container.innerHTML = `
    <!-- Top Date & Weekly Strip (Matching Image 1) -->
    <div style="display: flex; flex-direction: column; gap: var(--spacing-2); margin-bottom: var(--spacing-3);">
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <h2 style="font-size: var(--font-size-lg); font-weight: 800; color: var(--color-black-dominant);" id="orbit-full-date"></h2>
        </div>
        <span class="pill-badge" id="orbit-workload-badge" style="font-size: 0.7rem;">CALCULATING...</span>
      </div>

      <!-- Weekly Day Strip -->
      <div id="weekly-strip" style="display: flex; justify-content: space-between; gap: 4px; padding: 4px 0;"></div>
    </div>

    <!-- 24-Hour Circular Dial Canvas Container -->
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative;">
      <div style="position: relative; width: 280px; height: 280px; display: flex; align-items: center; justify-content: center;">
        <canvas id="focus-orbit-canvas" width="280" height="280" style="width: 280px; height: 280px; cursor: pointer;"></canvas>

        <!-- Center Hub Information -->
        <div style="position: absolute; width: 140px; height: 140px; border-radius: var(--radius-full); background: var(--bg-surface); box-shadow: var(--shadow-card); border: 1px solid var(--border-medium); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; pointer-events: none; padding: var(--spacing-2);">
          <div style="font-size: var(--font-size-xs); font-weight: 700; color: var(--color-black-muted); letter-spacing: 0.05em;" id="center-month-day">10/25</div>
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
  const centerMonthDay = container.querySelector<HTMLElement>('#center-month-day')!;
  const centerBusyHours = container.querySelector<HTMLElement>('#center-busy-hours')!;
  const centerFreeTime = container.querySelector<HTMLElement>('#center-free-time')!;
  const nextTaskBody = container.querySelector<HTMLElement>('#next-task-body')!;
  const nextTaskTimePill = container.querySelector<HTMLElement>('#next-task-time-pill')!;
  const nextTaskRationale = container.querySelector<HTMLElement>('#next-task-rationale')!;
  const weeklyStrip = container.querySelector<HTMLElement>('#weekly-strip')!;

  // Render weekly days strip
  renderWeeklyStrip(weeklyStrip);

  async function drawOrbit() {
    const tasks = await taskRepository.getAllTasks();
    const now = new Date();
    const currentFraction = now.getHours() + now.getMinutes() / 60;

    // Set date labels
    fullDateEl.textContent = now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    centerMonthDay.textContent = `${now.getMonth() + 1}/${now.getDate()}`;

    // Calculate workload and segments
    const analysis = analyzeDayWorkload(tasks, currentFraction);
    const segments = calculateOrbitSegments(tasks);

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
    } else if (tasks.length === 0) {
      workloadBadge.textContent = 'SCHEDULE OPEN';
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
      nextTaskRationale.textContent = `Suggested based on urgency (${next.urgency}) and estimated effort. Fits your schedule gap.`;
    } else {
      nextTaskBody.textContent = tasks.length === 0 ? 'No tasks scheduled today.' : 'All tasks completed!';
      nextTaskTimePill.textContent = '';
      nextTaskRationale.textContent = tasks.length === 0 ? 'Tap the red + button to schedule your focus blocks.' : 'Great job! Day is cleared.';
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

    // 1. Draw 24-Hour Base Circular Track (Neutral Sand)
    ctx.beginPath();
    ctx.arc(centerX, centerY, dialRadius, 0, Math.PI * 2);
    ctx.lineWidth = arcLineWidth;
    ctx.strokeStyle = '#EAE2D5'; // Soft beige track
    ctx.stroke();

    // 2. Draw 24 Hour Hour Ticks and Numbers
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

      // Major Hour Numbers: 0, 6, 12, 18
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

    // 3. Draw Task & Activity Colored Arcs
    segments.forEach(seg => {
      // Normalize start and end
      let s = seg.startHour;
      let e = seg.endHour;

      if (e > 24) {
        // Draw split arcs if wrapping past midnight (e.g. sleep block)
        drawSingleArc(ctx, centerX, centerY, dialRadius, arcLineWidth, s, 24, seg);
        drawSingleArc(ctx, centerX, centerY, dialRadius, arcLineWidth, 0, e - 24, seg);
      } else {
        drawSingleArc(ctx, centerX, centerY, dialRadius, arcLineWidth, s, e, seg);
      }
    });

    // 4. Draw Current Time Needle (CereBruv Red)
    const currentAngle = (currentFraction / 24) * Math.PI * 2 - Math.PI / 2;
    const needleR = dialRadius + (arcLineWidth / 2) + 3;
    const needleInnerR = dialRadius - (arcLineWidth / 2) - 3;

    // Glowing needle line
    ctx.beginPath();
    ctx.moveTo(centerX + Math.cos(currentAngle) * needleInnerR, centerY + Math.sin(currentAngle) * needleInnerR);
    ctx.lineTo(centerX + Math.cos(currentAngle) * needleR, centerY + Math.sin(currentAngle) * needleR);
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#E52E2E';
    ctx.lineCap = 'round';
    ctx.stroke();

    // Red Indicator Dot at needle tip
    ctx.beginPath();
    ctx.arc(centerX + Math.cos(currentAngle) * needleR, centerY + Math.sin(currentAngle) * needleR, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#E52E2E';
    ctx.fill();
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
      c.strokeStyle = '#A89F91'; // Completed tasks turn muted
      c.globalAlpha = 0.45;
      c.stroke();
      c.globalAlpha = 1.0;
    } else {
      c.strokeStyle = seg.color;
      c.stroke();
    }
  }

  function renderWeeklyStrip(el: HTMLElement) {
    const today = new Date();
    const currentDay = today.getDay(); // 0 = Sun
    const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

    el.innerHTML = '';
    days.forEach((dayLabel, idx) => {
      const isToday = idx === currentDay;
      const dayBox = document.createElement('div');
      dayBox.style.cssText = `
        flex: 1;
        padding: 6px 2px;
        text-align: center;
        border-radius: var(--radius-sm);
        background: ${isToday ? 'var(--color-red-primary)' : 'var(--bg-surface-elevated)'};
        color: ${isToday ? '#FFFFFF' : 'var(--color-black-soft)'};
        font-weight: 700;
        font-size: var(--font-size-xs);
        border: 1px solid ${isToday ? 'var(--color-red-primary)' : 'var(--border-subtle)'};
      `;
      dayBox.textContent = dayLabel;
      el.appendChild(dayBox);
    });
  }

  // Handle click on canvas to trigger quick task creation or open details
  canvas.addEventListener('click', () => {
    onOpenTaskForm();
  });

  // React to storage events
  eventBus.on(AppEvents.TASK_CREATED, () => drawOrbit());
  eventBus.on(AppEvents.TASK_COMPLETED, () => drawOrbit());
  eventBus.on(AppEvents.TASK_DELETED, () => drawOrbit());

  // Auto-refresh clock needle every 60 seconds
  setInterval(() => {
    drawOrbit();
  }, 60000);

  // Initial draw
  drawOrbit();

  return container;
}
