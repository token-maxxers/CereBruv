import mascotImg from '../assets/mascot.png';
import type { AnimationItem } from 'lottie-web';

export interface LottiePlayerOptions {
  src: string | object;
  size?: number;
  label?: string;
  fallbackText?: string;
}

// Track active animation instances per container element
const activePlayers = new WeakMap<HTMLElement, {
  destroy: () => void;
  wrapper: HTMLElement;
}>();

/**
 * Generic helper to mount a centered Lottie animation into a container with accessibility,
 * prefers-reduced-motion fallback, and error handling.
 */
export async function show(
  container: HTMLElement,
  options: LottiePlayerOptions
): Promise<void> {
  // Clear any existing active animation in this container
  hide(container);

  const size = options.size ?? 96;
  const label = options.label || 'Loading...';
  const fallbackText = options.fallbackText || label;

  // Wrapper element
  const wrapper = document.createElement('div');
  wrapper.className = 'lottie-player-wrapper';
  wrapper.setAttribute('role', 'status');
  wrapper.setAttribute('aria-label', label);
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.alignItems = 'center';
  wrapper.style.justifyContent = 'center';
  wrapper.style.width = '100%';
  wrapper.style.height = '100%';
  wrapper.style.minHeight = `${size}px`;
  wrapper.style.pointerEvents = 'none';

  // Check prefers-reduced-motion
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (prefersReducedMotion) {
    // Show static logo fallback
    const logoImg = document.createElement('img');
    logoImg.src = mascotImg;
    logoImg.alt = label;
    logoImg.style.width = `${Math.min(size, 64)}px`;
    logoImg.style.height = `${Math.min(size, 64)}px`;
    logoImg.style.objectFit = 'contain';
    wrapper.appendChild(logoImg);

    const textEl = document.createElement('span');
    textEl.textContent = label;
    textEl.style.fontSize = 'var(--font-size-xs, 0.75rem)';
    textEl.style.color = 'var(--color-black-muted, #5E5D67)';
    textEl.style.fontWeight = '600';
    textEl.style.marginTop = '6px';
    wrapper.appendChild(textEl);

    container.appendChild(wrapper);
    activePlayers.set(container, {
      destroy: () => {},
      wrapper,
    });
    return;
  }

  // Animation element target
  const animContainer = document.createElement('div');
  animContainer.className = 'lottie-anim-host';
  animContainer.style.width = `${size}px`;
  animContainer.style.height = `${size}px`;
  animContainer.style.display = 'flex';
  animContainer.style.alignItems = 'center';
  animContainer.style.justifyContent = 'center';

  wrapper.appendChild(animContainer);
  container.appendChild(wrapper);

  let animInstance: AnimationItem | null = null;
  let isCancelled = false;

  const cleanup = () => {
    isCancelled = true;
    if (animInstance) {
      animInstance.destroy();
      animInstance = null;
    }
  };

  activePlayers.set(container, {
    destroy: cleanup,
    wrapper,
  });

  try {
    // Lazy load the lightest player build
    const lottieModule = await import('lottie-web/build/player/lottie_light.js');
    const lottie = (lottieModule.default || lottieModule) as unknown as typeof import('lottie-web').default;

    if (isCancelled || !container.contains(wrapper)) {
      return;
    }

    // Determine animation source
    const baseConfig = {
      container: animContainer,
      renderer: 'svg' as const,
      loop: true,
      autoplay: true,
    };

    if (typeof options.src === 'string') {
      animInstance = lottie.loadAnimation({
        ...baseConfig,
        path: options.src,
      });
    } else {
      animInstance = lottie.loadAnimation({
        ...baseConfig,
        animationData: options.src,
      });
    }

    animInstance.addEventListener('data_failed', () => {
      renderFallback(wrapper, fallbackText, size);
    });

    animInstance.addEventListener('error', () => {
      renderFallback(wrapper, fallbackText, size);
    });
  } catch (err) {
    console.warn('Lottie player failed to load, falling back to static logo/spinner:', err);
    if (!isCancelled && container.contains(wrapper)) {
      renderFallback(wrapper, fallbackText, size);
    }
  }
}

function renderFallback(wrapper: HTMLElement, text: string, size: number) {
  wrapper.innerHTML = '';

  const fallbackLogo = document.createElement('img');
  fallbackLogo.src = mascotImg;
  fallbackLogo.alt = text;
  fallbackLogo.style.width = `${Math.min(size, 48)}px`;
  fallbackLogo.style.height = `${Math.min(size, 48)}px`;
  fallbackLogo.style.objectFit = 'contain';

  const labelSpan = document.createElement('span');
  labelSpan.textContent = text;
  labelSpan.style.fontSize = 'var(--font-size-xs, 0.75rem)';
  labelSpan.style.color = 'var(--color-black-muted, #5E5D67)';
  labelSpan.style.fontWeight = '600';
  labelSpan.style.marginTop = '6px';

  wrapper.appendChild(fallbackLogo);
  wrapper.appendChild(labelSpan);
}

/**
 * Hides and destroys any active Lottie animation inside the specified container.
 */
export function hide(container: HTMLElement): void {
  const active = activePlayers.get(container);
  if (active) {
    active.destroy();
    if (active.wrapper.parentNode === container) {
      container.removeChild(active.wrapper);
    }
    activePlayers.delete(container);
  }
}
