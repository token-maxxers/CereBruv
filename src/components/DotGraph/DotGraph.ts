import { taskRepository, noteRepository } from '../../services/storage';
import { eventBus, AppEvents } from '../../services/events';
import type { GraphNode, GraphLink } from '../../types/note';

export function renderDotGraph(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'card-section';
  container.style.padding = 'var(--spacing-3)';

  container.innerHTML = `
    <div class="section-header" style="margin-bottom: var(--spacing-2);">
      <div>
        <h2 class="section-title">Mind Graph</h2>
        <span style="font-size: var(--font-size-xs); color: var(--color-black-muted);">
          Obsidian-style knowledge & task network
        </span>
      </div>
      <div style="display: flex; gap: 4px;" id="graph-filter-group">
        <button class="pill-badge active" data-filter="all" style="cursor: pointer; font-size: 0.65rem;">ALL</button>
        <button class="pill-badge" data-filter="task" style="cursor: pointer; font-size: 0.65rem;">TASKS</button>
        <button class="pill-badge" data-filter="note" style="cursor: pointer; font-size: 0.65rem;">NOTES</button>
        <button class="pill-badge" data-filter="tag" style="cursor: pointer; font-size: 0.65rem;">TOPICS</button>
      </div>
    </div>

    <!-- Graph Canvas Container -->
    <div style="position: relative; width: 100%; height: 320px; background: #16161C; border-radius: var(--radius-md); overflow: hidden; border: 1px solid var(--border-medium); box-shadow: inset 0 2px 10px rgba(0,0,0,0.3);">
      <canvas id="dot-graph-canvas" style="width: 100%; height: 100%; display: block;"></canvas>

      <!-- Empty State Overlay if 0 items -->
      <div id="graph-empty-overlay" style="display: none; position: absolute; inset: 0; align-items: center; justify-content: center; flex-direction: column; text-align: center; color: #FAF7F2; padding: var(--spacing-4);">
        <div style="font-size: var(--font-size-base); font-weight: 700;">No Graph Nodes Yet</div>
        <div style="font-size: var(--font-size-xs); color: #BDB2A1; margin-top: 4px;">Add tasks or quick notes to see your personal knowledge network grow.</div>
      </div>

      <!-- Zoom / Center Controls Overlay -->
      <div style="position: absolute; bottom: 8px; right: 8px; display: flex; gap: 4px;">
        <button id="graph-reset-btn" class="pill-badge" style="background: rgba(32,32,40,0.8); color: #F5EFEB; border-color: rgba(255,255,255,0.15); cursor: pointer; font-size: 0.65rem;">
          Center
        </button>
      </div>

      <!-- Selected Node Inspector Modal / Overlay -->
      <div id="node-inspector" style="display: none; position: absolute; top: 8px; left: 8px; right: 8px; background: rgba(26,26,34,0.92); backdrop-filter: blur(6px); border: 1px solid rgba(255,255,255,0.15); border-radius: var(--radius-sm); padding: var(--spacing-2) var(--spacing-3); color: #F5EFEB; z-index: 10;">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <span id="inspector-badge" style="font-size: 0.65rem; font-weight: 800; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;"></span>
          <button id="inspector-close" style="background: none; border: none; color: #BDB2A1; cursor: pointer; font-size: 1rem; line-height: 1;">&times;</button>
        </div>
        <div id="inspector-title" style="font-size: var(--font-size-sm); font-weight: 700; margin-top: 2px;"></div>
      </div>
    </div>

    <!-- Graph Legend -->
    <div style="display: flex; align-items: center; justify-content: space-around; margin-top: var(--spacing-3); padding-top: var(--spacing-2); border-top: 1px solid var(--border-subtle); font-size: var(--font-size-xs); font-weight: 600;">
      <div style="display: flex; align-items: center; gap: 4px;">
        <span style="width: 8px; height: 8px; border-radius: 50%; background: #E52E2E; display: inline-block;"></span>
        <span>Tasks</span>
      </div>
      <div style="display: flex; align-items: center; gap: 4px;">
        <span style="width: 8px; height: 8px; border-radius: 50%; background: #38BDF8; display: inline-block;"></span>
        <span>Notes</span>
      </div>
      <div style="display: flex; align-items: center; gap: 4px;">
        <span style="width: 8px; height: 8px; border-radius: 50%; background: #0D9488; display: inline-block;"></span>
        <span>Categories</span>
      </div>
    </div>
  `;

  const canvas = container.querySelector<HTMLCanvasElement>('#dot-graph-canvas')!;
  const ctx = canvas.getContext('2d')!;
  const emptyOverlay = container.querySelector<HTMLElement>('#graph-empty-overlay')!;
  const inspector = container.querySelector<HTMLElement>('#node-inspector')!;
  const inspectorBadge = container.querySelector<HTMLElement>('#inspector-badge')!;
  const inspectorTitle = container.querySelector<HTMLElement>('#inspector-title')!;
  const inspectorClose = container.querySelector<HTMLButtonElement>('#inspector-close')!;
  const resetBtn = container.querySelector<HTMLButtonElement>('#graph-reset-btn')!;

  inspectorClose.addEventListener('click', () => {
    inspector.style.display = 'none';
  });

  let nodes: GraphNode[] = [];
  let links: GraphLink[] = [];
  let activeFilter: 'all' | 'task' | 'note' | 'tag' = 'all';

  // Interaction State
  let draggedNode: GraphNode | null = null;
  let isDragging = false;

  const categoryConfig: Record<string, { label: string; color: string }> = {
    study: { label: 'Study', color: '#4F46E5' },
    work: { label: 'Work', color: '#0D9488' },
    personal: { label: 'Personal', color: '#E52E2E' },
    event: { label: 'Event', color: '#D97706' },
    rest: { label: 'Rest', color: '#7C3AED' },
  };

  async function buildGraphData() {
    const tasks = await taskRepository.getAllTasks();
    const notes = await noteRepository.getAllNotes();

    const newNodes: GraphNode[] = [];
    const newLinks: GraphLink[] = [];

    // ONLY create category topic nodes that actually exist in the user's tasks
    const usedCategories = new Set<string>();
    tasks.forEach(t => usedCategories.add(t.category));

    usedCategories.forEach(cat => {
      const cfg = categoryConfig[cat] || { label: cat.toUpperCase(), color: '#0D9488' };
      newNodes.push({
        id: `topic_${cat}`,
        label: cfg.label,
        type: 'tag',
        radius: 10,
        color: cfg.color,
      });
    });

    // Map user's real Tasks
    tasks.forEach(task => {
      const taskNodeId = `node_task_${task.id}`;
      const taskNode: GraphNode = {
        id: taskNodeId,
        label: task.title,
        type: 'task',
        radius: task.urgency === 'high' ? 8 : 6,
        color: '#E52E2E',
      };
      newNodes.push(taskNode);

      // Link task to its category hub
      newLinks.push({
        sourceId: taskNodeId,
        targetId: `topic_${task.category}`,
        weight: 2,
      });
    });

    // Map user's real Quick Notes / Brain-dumps
    notes.forEach((note, idx) => {
      const noteNodeId = `node_note_${note.id}`;
      newNodes.push({
        id: noteNodeId,
        label: note.content.length > 25 ? note.content.substring(0, 22) + '...' : note.content,
        type: 'note',
        radius: 6,
        color: '#38BDF8', // Cyan
      });

      // If user has tasks, connect note to the most recent task
      if (tasks.length > 0) {
        const targetTaskId = `node_task_${tasks[idx % tasks.length].id}`;
        newLinks.push({
          sourceId: noteNodeId,
          targetId: targetTaskId,
          weight: 1,
        });
      }
    });

    // Toggle empty overlay
    if (newNodes.length === 0) {
      emptyOverlay.style.display = 'flex';
    } else {
      emptyOverlay.style.display = 'none';
    }

    // Initialize node coordinates
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width > 0 ? rect.width / 2 : 140;
    const cy = rect.height > 0 ? rect.height / 2 : 160;

    newNodes.forEach((node, i) => {
      const angle = (i / Math.max(1, newNodes.length)) * Math.PI * 2;
      const dist = 50 + (i % 3) * 20;
      node.x = cx + Math.cos(angle) * dist;
      node.y = cy + Math.sin(angle) * dist;
      node.vx = (Math.random() - 0.5) * 0.4;
      node.vy = (Math.random() - 0.5) * 0.4;
    });

    nodes = newNodes;
    links = newLinks;
  }

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.resetTransform();
    ctx.scale(dpr, dpr);
  }

  // Physics Simulation Step
  function stepPhysics(width: number, height: number) {
    const cx = width / 2;
    const cy = height / 2;

    // Center Gravity
    nodes.forEach(n => {
      if (n === draggedNode) return;
      n.vx = (n.vx || 0) + (cx - (n.x || cx)) * 0.0012;
      n.vy = (n.vy || 0) + (cy - (n.y || cy)) * 0.0012;
    });

    // Node Repulsion
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = (b.x || 0) - (a.x || 0);
        const dy = (b.y || 0) - (a.y || 0);
        const distSq = dx * dx + dy * dy || 1;
        if (distSq < 18000) {
          const force = 350 / distSq;
          const fx = (dx / Math.sqrt(distSq)) * force;
          const fy = (dy / Math.sqrt(distSq)) * force;

          if (a !== draggedNode) {
            a.vx = (a.vx || 0) - fx;
            a.vy = (a.vy || 0) - fy;
          }
          if (b !== draggedNode) {
            b.vx = (b.vx || 0) + fx;
            b.vy = (b.vy || 0) + fy;
          }
        }
      }
    }

    // Link Spring Attraction
    links.forEach(link => {
      const source = nodes.find(n => n.id === link.sourceId);
      const target = nodes.find(n => n.id === link.targetId);
      if (!source || !target) return;

      const dx = (target.x || 0) - (source.x || 0);
      const dy = (target.y || 0) - (source.y || 0);
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const desiredDist = 65;
      const springForce = (dist - desiredDist) * 0.02;

      const fx = (dx / dist) * springForce;
      const fy = (dy / dist) * springForce;

      if (source !== draggedNode) {
        source.vx = (source.vx || 0) + fx;
        source.vy = (source.vy || 0) + fy;
      }
      if (target !== draggedNode) {
        target.vx = (target.vx || 0) - fx;
        target.vy = (target.vy || 0) - fy;
      }
    });

    // Position Update & Damping
    nodes.forEach(n => {
      if (n === draggedNode) return;
      n.vx = (n.vx || 0) * 0.88;
      n.vy = (n.vy || 0) * 0.88;

      n.x = (n.x || cx) + (n.vx || 0);
      n.y = (n.y || cy) + (n.vy || 0);

      n.x = Math.max(n.radius, Math.min(width - n.radius, n.x));
      n.y = Math.max(n.radius, Math.min(height - n.radius, n.y));
    });
  }

  function draw() {
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    if (width === 0 || height === 0) {
      requestAnimationFrame(draw);
      return;
    }

    stepPhysics(width, height);

    ctx.clearRect(0, 0, width, height);

    const visibleNodes = nodes.filter(n => {
      if (activeFilter === 'all') return true;
      return n.type === activeFilter;
    });
    const visibleNodeIds = new Set(visibleNodes.map(n => n.id));

    // Draw Links
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    links.forEach(link => {
      if (visibleNodeIds.has(link.sourceId) && visibleNodeIds.has(link.targetId)) {
        const source = nodes.find(n => n.id === link.sourceId);
        const target = nodes.find(n => n.id === link.targetId);
        if (source && target && source.x && source.y && target.x && target.y) {
          ctx.beginPath();
          ctx.moveTo(source.x, source.y);
          ctx.lineTo(target.x, target.y);
          ctx.stroke();
        }
      }
    });

    // Draw Nodes
    visibleNodes.forEach(node => {
      const x = node.x || 0;
      const y = node.y || 0;

      // Glow halo
      ctx.beginPath();
      ctx.arc(x, y, node.radius + 4, 0, Math.PI * 2);
      ctx.fillStyle = node.color + '26';
      ctx.fill();

      // Node Body
      ctx.beginPath();
      ctx.arc(x, y, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = node.color;
      ctx.fill();

      // Node Label
      ctx.fillStyle = '#E5E7EB';
      ctx.font = '600 9px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(node.label, x, y + node.radius + 3);
    });

    requestAnimationFrame(draw);
  }

  function getCanvasCoords(e: MouseEvent | TouchEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  function findNodeUnderPointer(coords: { x: number; y: number }): GraphNode | null {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const dx = (n.x || 0) - coords.x;
      const dy = (n.y || 0) - coords.y;
      if (dx * dx + dy * dy <= (n.radius + 8) * (n.radius + 8)) {
        return n;
      }
    }
    return null;
  }

  function handleStart(e: MouseEvent | TouchEvent) {
    const coords = getCanvasCoords(e);
    const node = findNodeUnderPointer(coords);
    if (node) {
      draggedNode = node;
      isDragging = true;

      inspector.style.display = 'block';
      inspectorTitle.textContent = node.label;
      inspectorBadge.textContent = node.type;
      inspectorBadge.style.background = node.color;
      inspectorBadge.style.color = '#FFFFFF';
    }
  }

  function handleMove(e: MouseEvent | TouchEvent) {
    if (isDragging && draggedNode) {
      const coords = getCanvasCoords(e);
      draggedNode.x = coords.x;
      draggedNode.y = coords.y;
      draggedNode.vx = 0;
      draggedNode.vy = 0;
    }
  }

  function handleEnd() {
    isDragging = false;
    draggedNode = null;
  }

  canvas.addEventListener('mousedown', handleStart);
  window.addEventListener('mousemove', handleMove);
  window.addEventListener('mouseup', handleEnd);

  canvas.addEventListener('touchstart', handleStart, { passive: true });
  window.addEventListener('touchmove', handleMove, { passive: true });
  window.addEventListener('touchend', handleEnd);

  container.querySelectorAll('#graph-filter-group button').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('#graph-filter-group button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = (btn.getAttribute('data-filter') as any) || 'all';
    });
  });

  resetBtn.addEventListener('click', () => {
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    nodes.forEach((n, i) => {
      const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2;
      n.x = cx + Math.cos(angle) * 50;
      n.y = cy + Math.sin(angle) * 50;
      n.vx = 0;
      n.vy = 0;
    });
  });

  eventBus.on(AppEvents.TASK_CREATED, () => buildGraphData());
  eventBus.on(AppEvents.NOTE_CREATED, () => buildGraphData());
  eventBus.on(AppEvents.TASK_DELETED, () => buildGraphData());

  setTimeout(() => {
    resizeCanvas();
    buildGraphData().then(() => {
      draw();
    });
  }, 50);

  window.addEventListener('resize', resizeCanvas);

  return container;
}
