import mascotImg from '../../assets/mascot.png';
import { authService, type AuthUser } from '../../services/auth/AuthService';

export interface AuthScreenOptions {
  onSuccess: (user: AuthUser) => void;
  isLinkMode?: boolean; // When a guest is explicitly upgrading their account
  isOffline?: boolean;
}

export function renderAuthScreen(options: AuthScreenOptions): HTMLElement {
  const container = document.createElement('div');
  container.className = 'auth-viewport';

  let currentMode: 'signin' | 'signup' = options.isLinkMode ? 'signup' : 'signin';
  let showPassword = false;
  let showConfirmPassword = false;

  const mailSvg = `<svg class="auth-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>`;
  const lockSvg = `<svg class="auth-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
  const eyeSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
  const eyeOffSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
  const googleSvg = `<svg width="18" height="18" viewBox="0 0 24 24"><path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z"/><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"/><path fill="#FBBC05" d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.8s.2-2.1.4-2.8L1.9 6.3C.7 8.7 0 10.3 0 12s.7 3.3 1.9 5.7l3.7-2.9z"/><path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2-6.4-4.8L1.9 16.4C3.7 20.1 7.5 23 12 23z"/></svg>`;

  container.innerHTML = `
    <div class="auth-card-container">
      <!-- Top Brand Header -->
      <div class="auth-header">
        <img src="${mascotImg}" alt="CereBruv Mascot" class="auth-mascot" />
        <h1 class="auth-title">Cere<span>Bruv</span></h1>
        <p class="auth-tagline">Think it through, CereBruv's got you.</p>
      </div>

      <!-- Offline Notice -->
      <div class="auth-offline-banner" id="auth-offline-banner">
        You're offline. You can continue as guest to use offline local storage.
      </div>

      <!-- Global Messages -->
      <div class="auth-global-error" id="auth-global-error"></div>
      <div class="auth-global-success" id="auth-global-success"></div>

      <!-- Segmented Mode Control -->
      <div class="auth-segmented-control" id="auth-segmented-control">
        <button type="button" class="auth-segment-btn ${currentMode === 'signin' ? 'active' : ''}" id="tab-signin">
          Sign In
        </button>
        <button type="button" class="auth-segment-btn ${currentMode === 'signup' ? 'active' : ''}" id="tab-signup">
          ${options.isLinkMode ? 'Create Account' : 'Sign Up'}
        </button>
      </div>

      <!-- Auth Form -->
      <form class="auth-form" id="auth-main-form" novalidate>
        <!-- Email Field -->
        <div class="auth-field-group">
          <label class="auth-label" for="auth-email">Email Address</label>
          <div class="auth-input-wrapper">
            ${mailSvg}
            <input 
              type="email" 
              id="auth-email" 
              class="auth-input" 
              placeholder="name@example.com" 
              autocomplete="email" 
              required 
            />
          </div>
          <span class="auth-field-error" id="email-error"></span>
        </div>

        <!-- Password Field -->
        <div class="auth-field-group">
          <label class="auth-label" for="auth-password">Password</label>
          <div class="auth-input-wrapper">
            ${lockSvg}
            <input 
              type="password" 
              id="auth-password" 
              class="auth-input" 
              placeholder="Minimum 6 characters" 
              autocomplete="${currentMode === 'signin' ? 'current-password' : 'new-password'}" 
              required 
            />
            <button type="button" class="auth-toggle-pwd" id="toggle-password" title="Show password">
              ${eyeSvg}
            </button>
          </div>
          <span class="auth-field-error" id="password-error"></span>
        </div>

        <!-- Confirm Password Field (Sign up only) -->
        <div class="auth-field-group" id="confirm-password-group" style="display: ${currentMode === 'signup' ? 'flex' : 'none'};">
          <label class="auth-label" for="auth-confirm-password">Confirm Password</label>
          <div class="auth-input-wrapper">
            ${lockSvg}
            <input 
              type="password" 
              id="auth-confirm-password" 
              class="auth-input" 
              placeholder="Re-enter your password" 
              autocomplete="new-password" 
            />
            <button type="button" class="auth-toggle-pwd" id="toggle-confirm-password" title="Show password">
              ${eyeSvg}
            </button>
          </div>
          <span class="auth-field-error" id="confirm-password-error"></span>
        </div>

        <!-- Forgot Password Link (Sign in only) -->
        <button type="button" class="auth-forgot-link" id="auth-forgot-btn" style="display: ${currentMode === 'signin' ? 'block' : 'none'};">
          Forgot password?
        </button>

        <!-- Submit Button -->
        <button type="submit" class="auth-btn-primary" id="auth-submit-btn">
          ${currentMode === 'signin' ? 'Sign In' : (options.isLinkMode ? 'Create Account' : 'Create Account')}
        </button>
      </form>

      <!-- Divider -->
      <div class="auth-divider">or</div>

      <!-- Google Button -->
      <button type="button" class="auth-btn-google" id="auth-google-btn">
        ${googleSvg}
        <span>${options.isLinkMode ? 'Link with Google' : 'Continue with Google'}</span>
      </button>

      <!-- Guest Option -->
      <div class="auth-guest-section" id="auth-guest-section" style="display: ${options.isLinkMode ? 'none' : 'flex'};">
        <button type="button" class="auth-btn-guest" id="auth-guest-btn">
          Continue as guest
        </button>
        <span class="auth-guest-subtext">
          Your data stays on this device until you create an account.
        </span>
      </div>
    </div>
  `;

  // Select DOM Elements
  const offlineBanner = container.querySelector<HTMLDivElement>('#auth-offline-banner')!;
  const globalError = container.querySelector<HTMLDivElement>('#auth-global-error')!;
  const globalSuccess = container.querySelector<HTMLDivElement>('#auth-global-success')!;
  const tabSignin = container.querySelector<HTMLButtonElement>('#tab-signin')!;
  const tabSignup = container.querySelector<HTMLButtonElement>('#tab-signup')!;
  const form = container.querySelector<HTMLFormElement>('#auth-main-form')!;
  const emailInput = container.querySelector<HTMLInputElement>('#auth-email')!;
  const passwordInput = container.querySelector<HTMLInputElement>('#auth-password')!;
  const confirmPasswordInput = container.querySelector<HTMLInputElement>('#auth-confirm-password')!;
  const confirmGroup = container.querySelector<HTMLDivElement>('#confirm-password-group')!;
  const emailError = container.querySelector<HTMLSpanElement>('#email-error')!;
  const passwordError = container.querySelector<HTMLSpanElement>('#password-error')!;
  const confirmPasswordError = container.querySelector<HTMLSpanElement>('#confirm-password-error')!;
  const togglePasswordBtn = container.querySelector<HTMLButtonElement>('#toggle-password')!;
  const toggleConfirmPasswordBtn = container.querySelector<HTMLButtonElement>('#toggle-confirm-password')!;
  const forgotBtn = container.querySelector<HTMLButtonElement>('#auth-forgot-btn')!;
  const submitBtn = container.querySelector<HTMLButtonElement>('#auth-submit-btn')!;
  const googleBtn = container.querySelector<HTMLButtonElement>('#auth-google-btn')!;
  const guestBtn = container.querySelector<HTMLButtonElement>('#auth-guest-btn');

  if (options.isOffline || !navigator.onLine) {
    offlineBanner.style.display = 'block';
  }

  function clearErrors() {
    globalError.style.display = 'none';
    globalError.textContent = '';
    globalSuccess.style.display = 'none';
    globalSuccess.textContent = '';
    emailError.textContent = '';
    passwordError.textContent = '';
    confirmPasswordError.textContent = '';
  }

  function setMode(mode: 'signin' | 'signup') {
    currentMode = mode;
    clearErrors();
    tabSignin.classList.toggle('active', mode === 'signin');
    tabSignup.classList.toggle('active', mode === 'signup');

    if (mode === 'signin') {
      confirmGroup.style.display = 'none';
      forgotBtn.style.display = 'block';
      submitBtn.textContent = 'Sign In';
    } else {
      confirmGroup.style.display = 'flex';
      forgotBtn.style.display = 'none';
      submitBtn.textContent = 'Create Account';
    }
  }

  tabSignin.addEventListener('click', () => setMode('signin'));
  tabSignup.addEventListener('click', () => setMode('signup'));

  // Toggle Password Show/Hide
  togglePasswordBtn.addEventListener('click', () => {
    showPassword = !showPassword;
    passwordInput.type = showPassword ? 'text' : 'password';
    togglePasswordBtn.innerHTML = showPassword ? eyeOffSvg : eyeSvg;
  });

  toggleConfirmPasswordBtn.addEventListener('click', () => {
    showConfirmPassword = !showConfirmPassword;
    confirmPasswordInput.type = showConfirmPassword ? 'text' : 'password';
    toggleConfirmPasswordBtn.innerHTML = showConfirmPassword ? eyeOffSvg : eyeSvg;
  });

  // Forgot Password Action
  forgotBtn.addEventListener('click', async () => {
    clearErrors();
    const email = emailInput.value.trim();
    if (!email) {
      emailError.textContent = 'Enter your email above first.';
      return;
    }

    try {
      submitBtn.disabled = true;
      await authService.sendPasswordReset(email);
      globalSuccess.textContent = 'Password reset email sent. Check your inbox.';
      globalSuccess.style.display = 'block';
    } catch (err) {
      globalError.textContent = authService.getFriendlyErrorMessage(err);
      globalError.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
    }
  });

  // Main Form Submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    let hasError = false;

    if (!email) {
      emailError.textContent = 'Email is required.';
      hasError = true;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      emailError.textContent = 'Enter a valid email address.';
      hasError = true;
    }

    if (!password) {
      passwordError.textContent = 'Password is required.';
      hasError = true;
    } else if (password.length < 6) {
      passwordError.textContent = 'Password must be at least 6 characters.';
      hasError = true;
    }

    if (currentMode === 'signup') {
      if (!confirmPassword) {
        confirmPasswordError.textContent = 'Please confirm your password.';
        hasError = true;
      } else if (password !== confirmPassword) {
        confirmPasswordError.textContent = 'Passwords do not match.';
        hasError = true;
      }
    }

    if (hasError) return;

    submitBtn.disabled = true;
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Please wait...';

    try {
      let user: AuthUser;
      if (currentMode === 'signin') {
        user = await authService.signInWithEmail(email, password);
      } else {
        user = await authService.signUpWithEmail(email, password);
      }
      options.onSuccess(user);
    } catch (err) {
      globalError.textContent = authService.getFriendlyErrorMessage(err);
      globalError.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  });

  // Google Sign-In
  googleBtn.addEventListener('click', async () => {
    clearErrors();
    googleBtn.disabled = true;
    const originalText = googleBtn.querySelector('span')!.textContent;
    googleBtn.querySelector('span')!.textContent = 'Connecting...';

    try {
      const user = await authService.signInWithGoogle();
      options.onSuccess(user);
    } catch (err: unknown) {
      const msg = authService.getFriendlyErrorMessage(err);
      if (msg !== 'Sign in was cancelled.') {
        globalError.textContent = msg;
        globalError.style.display = 'block';
      }
    } finally {
      googleBtn.disabled = false;
      googleBtn.querySelector('span')!.textContent = originalText;
    }
  });

  // Continue As Guest
  guestBtn?.addEventListener('click', async () => {
    clearErrors();
    guestBtn.disabled = true;

    try {
      const user = await authService.continueAsGuest();
      options.onSuccess(user);
    } catch (err) {
      globalError.textContent = authService.getFriendlyErrorMessage(err);
      globalError.style.display = 'block';
      guestBtn.disabled = false;
    }
  });

  return container;
}
