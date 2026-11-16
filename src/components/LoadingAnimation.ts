import loaderJson from '../assets/lottie/loader.json';
import { show, hide, type LottiePlayerOptions } from './LottiePlayer';

export interface LoadingAnimationOptions {
  size?: number;
  label?: string;
  fallbackText?: string;
}

/**
 * Standard Unified Loading & Upload Animation component using the offline loader.json Lottie asset.
 */
export const LoadingAnimation = {
  /**
   * Mounts the standard Lottie loading or upload animation inside the container.
   */
  show(container: HTMLElement, options: LoadingAnimationOptions = {}): Promise<void> {
    const playerOpts: LottiePlayerOptions = {
      src: loaderJson,
      size: options.size ?? 96,
      label: options.label ?? 'Loading...',
      fallbackText: options.fallbackText ?? 'Loading...',
    };
    return show(container, playerOpts);
  },

  /**
   * Hides the standard Lottie loading or upload animation and cleans up instances.
   */
  hide(container: HTMLElement): void {
    hide(container);
  },
};

export { show, hide };
