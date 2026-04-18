import type { ThemeMode } from '@/shared/styles/theme';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function safeJsonParse(text: unknown, fallback: Record<string, unknown> = {}): Record<string, unknown> {
  if (typeof text !== 'string' || text.trim() === '') {
    return fallback;
  }
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch (_error) {
    return fallback;
  }
}

export function normalizeActionArgs(actionName: string, rawArgs: Record<string, unknown> = {}): Record<string, unknown> {
  if (actionName === 'switch_theme') {
    const rawTheme = String(rawArgs.theme || '').toLowerCase();
    const theme = rawTheme === 'dark' ? 'dark' : 'light';
    return { theme };
  }

  if (actionName === 'launch_fireworks') {
    const numeric = Number(rawArgs.durationMs);
    const durationMs = Number.isFinite(numeric) ? clamp(Math.round(numeric), 1000, 30000) : 8000;
    return { durationMs };
  }

  if (actionName === 'show_modal') {
    const title =
      typeof rawArgs.title === 'string' && (rawArgs.title as string).trim()
        ? (rawArgs.title as string).trim()
        : '通知';
    const content =
      typeof rawArgs.content === 'string' && (rawArgs.content as string).trim()
        ? (rawArgs.content as string).trim()
        : '';
    const closeText =
      typeof rawArgs.closeText === 'string' && (rawArgs.closeText as string).trim()
        ? (rawArgs.closeText as string).trim()
        : '关闭';
    return { title, content, closeText };
  }

  return rawArgs;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  hue: number;
}

function createFireworksRuntime(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  const particles: Particle[] = [];

  let animationId: number | null = null;
  let burstTimer: number | null = null;
  let running = false;
  let stopAt = 0;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;

    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function spawnBurst() {
    const originX = 60 + Math.random() * (window.innerWidth - 120);
    const originY = 80 + Math.random() * Math.max(120, window.innerHeight * 0.5);
    const colorHue = Math.floor(Math.random() * 360);

    for (let i = 0; i < 42; i += 1) {
      const speed = 1 + Math.random() * 5;
      const angle = (Math.PI * 2 * i) / 42;
      particles.push({
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 35 + Math.random() * 30,
        maxLife: 65,
        hue: colorHue + Math.random() * 32,
      });
    }
  }

  function tick() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.04;
      p.life -= 1;

      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }

      const alpha = p.life / p.maxLife;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.3, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue}, 95%, 62%, ${alpha.toFixed(3)})`;
      ctx.fill();
    }

    if (running || particles.length > 0) {
      animationId = window.requestAnimationFrame(tick);
    } else {
      animationId = null;
    }
  }

  function stop() {
    running = false;
    if (burstTimer) {
      window.clearInterval(burstTimer);
      burstTimer = null;
    }
  }

  function launch(durationMs: number) {
    resize();
    window.removeEventListener('resize', resize);
    window.addEventListener('resize', resize);

    stop();
    running = true;
    stopAt = performance.now() + durationMs;

    spawnBurst();
    burstTimer = window.setInterval(() => {
      if (performance.now() >= stopAt) {
        stop();
        return;
      }
      spawnBurst();
    }, 360);

    if (!animationId) {
      tick();
    }
  }

  return { launch, stop };
}

function createModalRuntime(
  modalRoot: HTMLElement,
  titleEl: HTMLElement,
  contentEl: HTMLElement,
  closeBtn: HTMLElement
) {
  const hide = () => {
    modalRoot.classList.add('hidden');
  };

  closeBtn.addEventListener('click', hide);
  modalRoot.addEventListener('click', (event) => {
    if (event.target === modalRoot) {
      hide();
    }
  });

  return {
    show({ title, content, closeText }: { title: string; content: string; closeText: string }) {
      titleEl.textContent = title;
      contentEl.textContent = content;
      closeBtn.textContent = closeText;
      modalRoot.classList.remove('hidden');
    },
    hide,
  };
}

export interface ActionRuntimeOptions {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  modalRoot: HTMLElement;
  modalTitle: HTMLElement;
  modalContent: HTMLElement;
  modalClose: HTMLElement;
  onThemeChange?: (theme: ThemeMode) => void;
  onStatus?: (text: string) => void;
}

export interface ActionRuntime {
  execute: (actionName: string, rawArgs?: Record<string, unknown>) => Record<string, unknown>;
  setTheme: (theme: string) => void;
}

export function createActionRuntime(options: ActionRuntimeOptions): ActionRuntime {
  const { root, canvas, modalRoot, modalTitle, modalContent, modalClose, onThemeChange, onStatus } = options;

  const fireworks = createFireworksRuntime(canvas);
  const modal = createModalRuntime(modalRoot, modalTitle, modalContent, modalClose);

  return {
    execute(actionName: string, rawArgs: Record<string, unknown> = {}) {
      const args = normalizeActionArgs(actionName, rawArgs);

      if (actionName === 'switch_theme') {
        const theme = args.theme as ThemeMode;
        if (onThemeChange) {
          onThemeChange(theme);
        } else {
          root.setAttribute('data-theme', theme);
        }
        onStatus?.(`Action switch_theme -> ${theme}`);
        return args;
      }

      if (actionName === 'launch_fireworks') {
        fireworks.launch(args.durationMs as number);
        onStatus?.(`Action launch_fireworks -> ${args.durationMs}ms`);
        return args;
      }

      if (actionName === 'show_modal') {
        modal.show(args as { title: string; content: string; closeText: string });
        onStatus?.(`Action show_modal -> ${args.title}`);
        return args;
      }

      onStatus?.(`Unknown action ignored: ${actionName}`);
      return args;
    },
    setTheme(theme: string) {
      root.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
    },
  };
}
