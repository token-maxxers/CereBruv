import loadingJson from '../assets/lottie/loading.json';
import { show, hide, type LottiePlayerOptions } from './LottiePlayer';

export interface LoadingAnimationOptions {
  size?: number;
  label?: string;
  fallbackText?: string;
}

/**
 * Standard Loading Animation component using the offline loading.json Lottie asset.
 */
export const LoadingAnimation = {
  /**
   * Mounts the standard Lottie loading animation inside the container.
   */
  show(container: HTMLElement, options: LoadingAnimationOptions = {}): Promise<void> {
    const playerOpts: LottiePlayerOptions = {
      src: loadingJson,
      size: options.size ?? 96,
      label: options.label ?? 'Loading...',
      fallbackText: options.fallbackText ?? 'Loading...',
    };
    return show(container, playerOpts);
  },

  /**
   * Hides the standard Lottie loading animation and cleans up instances.
   */
  hide(container: HTMLElement): void {
    hide(container);
  },
};

export { show, hide };
