import { taskRepository, noteRepository, userStatsRepository } from '../../services/storage';
import { eventBus, AppEvents } from '../../services/events';
import {
  extractLinksFromText,
  mergeSavedLinks,
  openImageLightbox,
  renderSavedLinksHtml,
} from '../../utils/imageUtils';
import type { GraphNode, GraphLink } from '../../types/note';
import type { Task } from '../../types/task';

export interface DotGraphOptions {
  onConvertNoteToTask?: (draftTask: Partial<Task>) => void;
  onJumpToOrbit?: (date?: string) => void;
}

export function renderDotGraph(options: DotGraphOptions = {}): HTMLElement {
  const container = document.createElement('div');
  container.className = 'card-section';
  container.style.padding = 'var(--spacing-3)';

  container.innerHTML = `
    <div class="section-header" style="margin-bottom: var(--spacing-2); flex-wrap: wrap; gap: 8px;">
      <h2 class="section-title">Mind Graph</h2>
      <div style="display: flex; gap: 4px; flex-wrap: wrap;" id="graph-filter-group">
        <button class="pill-badge active" data-filter="all" style="cursor: pointer; font-size: 0.65rem;">ALL</button>
        <button class="pill-badge" data-filter="task" style="cursor: pointer; font-size: 0.65rem;">REMINDERS</button>
        <button class="pill-badge" data-filter="note" style="cursor: pointer; font-size: 0.65rem;">NOTES</button>
        <button class="pill-badge" data-filter="tag" style="cursor: pointer; font-size: 0.65rem;">TOPICS</button>
      </div>
    </div>

    <!-- Inline Quick Search -->
    <div style="margin-bottom: var(--spacing-2);">
      <input id="graph-search-input" type="search" class="form-input" placeholder="Search nodes, topics, or keywords to spotlight..." style="padding: 7px 12px; font-size: 0.78rem; border-radius: var(--radius-full);" />
    </div>

    <!-- Graph Canvas Container -->
    <div id="graph-canvas-wrap" style="position: relative; width: 100%; height: 340px; background: var(--bg-surface-elevated); border-radius: var(--radius-md); overflow: hidden; border: 1px solid var(--border-subtle);">
      <canvas id="dot-graph-canvas" style="width: 100%; height: 100%; display: block;"></canvas>

      <!-- Empty State Overlay if 0 items -->
      <div id="graph-empty-overlay" style="display: none; position: absolute; inset: 0; align-items: center; justify-content: center; flex-direction: column; text-align: center; color: var(--color-black-dominant); padding: var(--spacing-4);">
        <div style="font-size: var(--font-size-base); font-weight: 800;">No Graph Nodes Yet</div>
        <div style="font-size: var(--font-size-xs); color: var(--color-black-muted); margin-top: 4px;">Add tasks or quick notes to see your personal knowledge network grow.</div>
      </div>

      <!-- Zoom / Center & Clear Controls Overlay -->
      <div style="position: absolute; bottom: 8px; right: 8px; display: flex; gap: 6px;">
        <button id="graph-clear-all-btn" class="pill-badge" style="background: var(--color-red-subtle); color: var(--color-red-primary); border-color: rgba(229,46,46,0.28); cursor: pointer; font-size: 0.65rem;">
          Clear All
        </button>
        <button id="graph-reset-btn" class="pill-badge" style="background: var(--bg-surface); color: var(--color-black-dominant); border-color: var(--border-subtle); cursor: pointer; font-size: 0.65rem;">
          Center
        </button>
      </div>

      <!-- Actionable Selected Node Inspector Overlay -->
      <div id="node-inspector" style="display: none; position: absolute; top: 8px; left: 8px; right: 8px; background: var(--bg-surface); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 10px 12px; color: var(--color-black-dominant); box-shadow: var(--shadow-card); z-index: 10;">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span id="inspector-badge" style="font-size: 0.62rem; font-weight: 800; padding: 2px 8px; border-radius: 999px; text-transform: uppercase;"></span>
            <span id="inspector-meta" style="font-size: 0.65rem; font-weight: 700; color: var(--color-black-muted);"></span>
          </div>
          <div style="display: flex; align-items: center; gap: 5px; flex-wrap: wrap;">
            <button id="inspector-complete-btn" style="display: none; background: var(--color-black-dominant); border: none; color: var(--bg-surface); cursor: pointer; font-size: 0.62rem; font-weight: 800; padding: 3px 8px; border-radius: 999px;">Complete</button>
            <button id="inspector-orbit-btn" style="display: none; background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); color: var(--color-black-dominant); cursor: pointer; font-size: 0.62rem; font-weight: 800; padding: 3px 8px; border-radius: 999px;">Orbit</button>
            <button id="inspector-convert-btn" style="display: none; background: var(--color-red-primary); border: none; color: #FFFFFF; cursor: pointer; font-size: 0.62rem; font-weight: 800; padding: 3px 8px; border-radius: 999px;">+ Task</button>
            <button id="inspector-photo-btn" style="display: none; background: #0284C7; border: none; color: #FFFFFF; cursor: pointer; font-size: 0.62rem; font-weight: 800; padding: 3px 8px; border-radius: 999px;">Photo</button>
            <button id="inspector-delete" style="display: none; background: var(--color-red-subtle); border: none; color: var(--color-red-primary); cursor: pointer; font-size: 0.62rem; font-weight: 800; padding: 3px 8px; border-radius: 999px;">Delete</button>
            <button id="inspector-close" style="background: none; border: none; color: var(--color-black-muted); cursor: pointer; font-size: 1rem; line-height: 1; padding: 0 2px;">&times;</button>
          </div>
        </div>
        <div id="inspector-title" style="font-family: var(--font-family-display); font-size: var(--font-size-sm); font-weight: 800; margin-top: 4px; line-height: 1.3;"></div>
        <div id="inspector-links"></div>
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
  const inspectorMeta = container.querySelector<HTMLElement>('#inspector-meta')!;
  const inspectorLinks = container.querySelector<HTMLDivElement>('#inspector-links')!;
  const inspectorCompleteBtn = container.querySelector<HTMLButtonElement>('#inspector-complete-btn')!;
  const inspectorOrbitBtn = container.querySelector<HTMLButtonElement>('#inspector-orbit-btn')!;
  const inspectorConvertBtn = container.querySelector<HTMLButtonElement>('#inspector-convert-btn')!;
  const inspectorPhotoBtn = container.querySelector<HTMLButtonElement>('#inspector-photo-btn')!;
  const inspectorDelete = container.querySelector<HTMLButtonElement>('#inspector-delete')!;
  const inspectorClose = container.querySelector<HTMLButtonElement>('#inspector-close')!;
  const resetBtn = container.querySelector<HTMLButtonElement>('#graph-reset-btn')!;
  const clearAllBtn = container.querySelector<HTMLButtonElement>('#graph-clear-all-btn')!;
  const searchInput = container.querySelector<HTMLInputElement>('#graph-search-input')!;

  let selectedNode: GraphNode | null = null;
  let searchQuery = '';
  const taskMap = new Map<string, Task>();
  const noteMap = new Map<string, { content: string; category: string }>();
  const degreeMap = new Map<string, number>();

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim().toLowerCase();
  });

  inspectorCompleteBtn.addEventListener('click', async () => {
    if (!selectedNode || selectedNode.type !== 'task') return;
    const taskId = selectedNode.id.replace('node_task_', '');
    const updated = await taskRepository.toggleTaskCompletion(taskId);
    if (updated.completed) {
      const stats = await userStatsRepository.incrementTaskCount();
      eventBus.emit(AppEvents.STATS_UPDATED, stats);
    } else if (userStatsRepository.decrementTaskCount) {
      const stats = await userStatsRepository.decrementTaskCount();
      eventBus.emit(AppEvents.STATS_UPDATED, stats);
    }
    eventBus.emit(AppEvents.TASK_COMPLETED, updated);
    await buildGraphData();
    inspectorCompleteBtn.textContent = updated.completed ? 'Reopen' : 'Done';
  });

  inspectorOrbitBtn.addEventListener('click', () => {
    if (!selectedNode || selectedNode.type !== 'task') return;
    const taskId = selectedNode.id.replace('node_task_', '');
    const task = taskMap.get(taskId);
    options.onJumpToOrbit?.(task?.date);
  });

  inspectorConvertBtn.addEventListener('click', () => {
    if (!selectedNode || selectedNode.type !== 'note') return;
    const noteId = selectedNode.id.replace('node_note_', '');
    const note = noteMap.get(noteId);
    if (!note) return;
    options.onConvertNoteToTask?.({
      title: note.content.length > 60 ? note.content.slice(0, 57) + '...' : note.content,
      notes: note.content,
      category: (note.category as Task['category']) || 'personal',
    });
  });

  inspectorClose.addEventListener('click', () => {
    inspector.style.display = 'none';
    selectedNode = null;
  });

  inspectorPhotoBtn.addEventListener('click', () => {
    if (selectedNode?.photoUrl) {
      openImageLightbox(selectedNode.photoUrl, selectedNode.label);
    }
  });

  inspectorDelete.addEventListener('click', async () => {
    if (!selectedNode) return;
    if (selectedNode.id.startsWith('node_task_')) {
      const taskId = selectedNode.id.replace('node_task_', '');
      await taskRepository.deleteTask(taskId);
      eventBus.emit(AppEvents.TASK_DELETED);
    } else if (selectedNode.id.startsWith('node_note_')) {
      const noteId = selectedNode.id.replace('node_note_', '');
      await noteRepository.deleteNote(noteId);
      eventBus.emit(AppEvents.NOTE_CREATED);
    }
    inspector.style.display = 'none';
    selectedNode = null;
    await buildGraphData();
  });

  clearAllBtn.addEventListener('click', async () => {
    const tasks = await taskRepository.getAllTasks();
    const notes = await noteRepository.getAllNotes();
    if (tasks.length === 0 && notes.length === 0) return;

    await Promise.all([
      ...tasks.map(t => taskRepository.deleteTask(t.id)),
      ...notes.map(n => noteRepository.deleteNote(n.id)),
    ]);
    inspector.style.display = 'none';
    selectedNode = null;
    eventBus.emit(AppEvents.TASK_DELETED);
    await buildGraphData();
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
    const [tasks, notes] = await Promise.all([
      taskRepository.getAllTasks(),
      noteRepository.getAllNotes(),
    ]);

    const newNodes: GraphNode[] = [];
    const newLinks: GraphLink[] = [];
    taskMap.clear();
    noteMap.clear();
    degreeMap.clear();
    tasks.forEach(t => taskMap.set(t.id, t));
    notes.forEach(n => noteMap.set(n.id, { content: n.content, category: (n.tags && n.tags[0]) || n.category || 'personal' }));

    // ONLY create category topic nodes that actually exist in the user's tasks or tagged thoughts
    const usedCategories = new Set<string>();
    tasks.forEach(t => usedCategories.add(t.category));
    notes.forEach(n => {
      const cat = (n.tags && n.tags[0]) || n.category || 'personal';
      usedCategories.add(cat);
    });

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

    // Helper: extracts key significant words for title/topic matching
    const extractSignificantWords = (str: string): string[] => {
      const stopWords = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'have', 'meeting', 'task', 'note', 'idea', 'at', 'on', 'in']);
      return str
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 4 && !stopWords.has(w));
    };

    // Map user's real Tasks
    tasks.forEach(task => {
      const taskNodeId = `node_task_${task.id}`;
      const taskKeywords = extractSignificantWords(task.title + ' ' + (task.notes || ''));
      const taskNode: GraphNode = {
        id: taskNodeId,
        label: task.title,
        type: 'task',
        radius: task.urgency === 'high' ? 8 : 6,
        color: task.timeMode === 'duration' ? '#0D9488' : task.timeMode === 'one-time' ? '#D97706' : '#E52E2E',
        photoUrl: task.photoUrl,
        links: mergeSavedLinks(task.links, extractLinksFromText(task.notes || '')),
        eventGroupId: task.eventGroupId,
        keywords: taskKeywords,
      };
      newNodes.push(taskNode);

      // Link task to its category hub
      newLinks.push({
        sourceId: taskNodeId,
        targetId: `topic_${task.category}`,
        weight: 2,
        kind: 'category',
      });
    });

    // Map user's real Quick Notes / Brain-dumps and connect directly to related Tasks
    notes.forEach((note) => {
      const noteNodeId = `node_note_${note.id}`;
      const noteCategory = (note.tags && note.tags[0]) || note.category || 'personal';
      const noteKeywords = extractSignificantWords(note.content);
      newNodes.push({
        id: noteNodeId,
        label: note.content.length > 25 ? note.content.substring(0, 22) + '...' : note.content,
        type: 'note',
        radius: 6,
        color: '#38BDF8', // Cyan for Notes
        photoUrl: note.photoUrl,
        links: mergeSavedLinks(note.links, extractLinksFromText(note.content)),
        eventGroupId: note.eventGroupId,
        keywords: noteKeywords,
      });

      // Connect note directly to its Category Topic Hub
      newLinks.push({
        sourceId: noteNodeId,
        targetId: `topic_${noteCategory}`,
        weight: 2,
        kind: 'category',
      });

      // Direct Event Connection: connect Note directly to Task if sharing eventGroupId, screenshot, or overlapping words
      tasks.forEach(task => {
        let isDirectlyConnected = false;

        // 1. Same eventGroupId (from screenshot scanner or grouping)
        if (note.eventGroupId && task.eventGroupId && note.eventGroupId === task.eventGroupId) {
          isDirectlyConnected = true;
        }

        // 2. Shared screenshot image
        if (!isDirectlyConnected && note.photoUrl && task.photoUrl && note.photoUrl === task.photoUrl) {
          isDirectlyConnected = true;
        }

        // 3. Shared significant keywords in title/content (e.g. "Startup", "Challenge", "Scholarship")
        if (!isDirectlyConnected) {
          const taskKeywords = extractSignificantWords(task.title + ' ' + (task.notes || ''));
          const common = noteKeywords.filter(k => taskKeywords.includes(k));
          if (common.length >= 1) {
            isDirectlyConnected = true;
          }
        }

        if (isDirectlyConnected) {
          newLinks.push({
            sourceId: noteNodeId,
            targetId: `node_task_${task.id}`,
            weight: 3, // Thicker link between related task & note
            kind: 'event',
          });
        }
      });
    });

    // Cross-link Tasks <-> Tasks and Notes <-> Notes sharing significant keywords (Brain Synapses)
    const contentNodes = newNodes.filter(n => n.type === 'task' || n.type === 'note');
    for (let i = 0; i < contentNodes.length; i++) {
      for (let j = i + 1; j < contentNodes.length; j++) {
        const a = contentNodes[i];
        const b = contentNodes[j];
        if (a.type === 'note' && b.type === 'task') continue; // already linked above
        if (a.type === 'task' && b.type === 'note') continue;
        const kwA = a.keywords || [];
        const kwB = b.keywords || [];
        if (kwA.some(k => kwB.includes(k))) {
          newLinks.push({ sourceId: a.id, targetId: b.id, weight: 2, kind: 'event' });
        }
      }
    }

    // Compute connection degree for importance sizing
    newLinks.forEach(l => {
      degreeMap.set(l.sourceId, (degreeMap.get(l.sourceId) || 0) + 1);
      degreeMap.set(l.targetId, (degreeMap.get(l.targetId) || 0) + 1);
    });
    newNodes.forEach(n => {
      const deg = degreeMap.get(n.id) || 0;
      n.radius = n.radius + Math.min(4, deg * 0.7);
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

    const isDark = document.documentElement.getAttribute('data-theme') === 'obsidian';
    ctx.clearRect(0, 0, width, height);

    // Theme-matched background & subtle constellation dot-grid
    ctx.fillStyle = isDark ? '#0D0E14' : '#F6F6F9';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.055)';
    for (let gx = 16; gx < width; gx += 22) {
      for (let gy = 16; gy < height; gy += 22) {
        ctx.fillRect(gx, gy, 1.4, 1.4);
      }
    }

    const visibleNodes = nodes.filter(n => {
      if (activeFilter === 'all') return true;
      return n.type === activeFilter;
    });
    const visibleNodeIds = new Set(visibleNodes.map(n => n.id));

    // Spotlight neighbors for selected node or search query
    const spotlightIds = new Set<string>();
    const hasSearch = searchQuery.length > 0;
    if (hasSearch) {
      visibleNodes.forEach(n => {
        if (n.label.toLowerCase().includes(searchQuery) || (n.keywords || []).some(k => k.includes(searchQuery))) {
          spotlightIds.add(n.id);
        }
      });
    } else if (selectedNode) {
      spotlightIds.add(selectedNode.id);
      links.forEach(l => {
        if (l.sourceId === selectedNode!.id) spotlightIds.add(l.targetId);
        if (l.targetId === selectedNode!.id) spotlightIds.add(l.sourceId);
      });
    }
    const spotlightActive = hasSearch || selectedNode !== null;
    const nowSec = performance.now() * 0.0008;

    // Draw Links (+ animated pulse particles along spotlight/synapse edges)
    links.forEach((link, idx) => {
      if (visibleNodeIds.has(link.sourceId) && visibleNodeIds.has(link.targetId)) {
        const source = nodes.find(n => n.id === link.sourceId);
        const target = nodes.find(n => n.id === link.targetId);
        if (source && target && source.x && source.y && target.x && target.y) {
          const isEventLink = link.kind === 'event';
          const isLit = !spotlightActive || (spotlightIds.has(link.sourceId) && spotlightIds.has(link.targetId));
          ctx.save();
          ctx.globalAlpha = isLit ? 1 : 0.14;
          ctx.beginPath();
          ctx.moveTo(source.x, source.y);
          ctx.lineTo(target.x, target.y);
          ctx.lineWidth = isEventLink ? 2 : (isLit && spotlightActive ? 1.8 : 1.1);
          ctx.strokeStyle = isEventLink
            ? (isDark ? 'rgba(56, 189, 248, 0.72)' : 'rgba(2, 132, 199, 0.65)')
            : (isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(23, 23, 23, 0.15)');
          ctx.setLineDash(isEventLink ? [4, 4] : []);
          ctx.stroke();
          ctx.setLineDash([]);

          // Traveling synapse pulse dot on active/synapse edges
          if (isLit && (isEventLink || (spotlightActive && selectedNode))) {
            const t = (nowSec + idx * 0.31) % 1;
            const px = source.x + (target.x - source.x) * t;
            const py = source.y + (target.y - source.y) * t;
            ctx.beginPath();
            ctx.arc(px, py, 2.3, 0, Math.PI * 2);
            ctx.fillStyle = isEventLink ? '#38BDF8' : '#E52E2E';
            ctx.fill();
          }
          ctx.restore();
        }
      }
    });

    // Draw Nodes
    visibleNodes.forEach(node => {
      const x = node.x || 0;
      const y = node.y || 0;
      const isLit = !spotlightActive || spotlightIds.has(node.id);
      const isSelected = selectedNode?.id === node.id;

      ctx.save();
      ctx.globalAlpha = isLit ? 1 : 0.2;

      // Glow halo
      ctx.beginPath();
      ctx.arc(x, y, node.radius + (isSelected ? 7 : 4), 0, Math.PI * 2);
      ctx.fillStyle = node.color + (isSelected ? '44' : '26');
      ctx.fill();

      // Selected ring
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(x, y, node.radius + 3, 0, Math.PI * 2);
        ctx.strokeStyle = isDark ? '#FFFFFF' : '#171717';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Node Body
      ctx.beginPath();
      ctx.arc(x, y, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = node.color;
      ctx.fill();

      // Node Label
      ctx.fillStyle = isDark ? '#E5E7EB' : '#171717';
      ctx.font = isSelected ? '700 10px -apple-system, sans-serif' : '600 9px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(node.label, x, y + node.radius + 4);
      ctx.restore();
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
      selectedNode = node;
      isDragging = true;

      const deg = degreeMap.get(node.id) || 0;
      inspector.style.display = 'block';
      inspectorBadge.textContent = node.type;
      inspectorBadge.style.background = node.color;
      inspectorBadge.style.color = '#FFFFFF';
      inspectorMeta.textContent = `${deg} link${deg === 1 ? '' : 's'}`;

      if (node.type === 'task') {
        const task = taskMap.get(node.id.replace('node_task_', ''));
        inspectorTitle.textContent = node.label;
        inspectorCompleteBtn.style.display = 'inline-block';
        inspectorCompleteBtn.textContent = task?.completed ? 'Reopen' : 'Done';
        inspectorOrbitBtn.style.display = 'inline-block';
        inspectorConvertBtn.style.display = 'none';
      } else if (node.type === 'note') {
        const note = noteMap.get(node.id.replace('node_note_', ''));
        inspectorTitle.textContent = note?.content || node.label;
        inspectorCompleteBtn.style.display = 'none';
        inspectorOrbitBtn.style.display = 'none';
        inspectorConvertBtn.style.display = 'inline-block';
      } else {
        inspectorTitle.textContent = `${node.label} Cluster`;
        inspectorCompleteBtn.style.display = 'none';
        inspectorOrbitBtn.style.display = 'none';
        inspectorConvertBtn.style.display = 'none';
      }

      inspectorPhotoBtn.style.display = node.photoUrl ? 'inline-block' : 'none';
      inspectorDelete.style.display = node.type === 'task' || node.type === 'note' ? 'inline-block' : 'none';
      inspectorLinks.innerHTML = renderSavedLinksHtml(node.links, true);
    } else if (!isDragging) {
      selectedNode = null;
      inspector.style.display = 'none';
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
  eventBus.on(AppEvents.TASK_UPDATED, () => buildGraphData());
  eventBus.on(AppEvents.NOTE_CREATED, () => buildGraphData());
  eventBus.on(AppEvents.NOTE_UPDATED, () => buildGraphData());
  eventBus.on(AppEvents.NOTE_DELETED, () => buildGraphData());
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
