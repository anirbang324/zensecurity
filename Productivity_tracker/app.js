// app.js — Productivity Tracker (Supabase-backed, plain HTML/CSS/JS)

// -- Configuration from config.js --
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// -- Local Storage Keys for Anonymous Users --
const ANON_TRACKERS_KEY = 'pt_anon_trackers';
const ANON_CUSTOM_KEY   = 'pt_anon_custom_activities';
const ANON_SUMMARIES_KEY = 'pt_anon_custom_summaries';
const ANON_USER_SAMPLES_KEY = 'pt_anon_user_samples';

// -- State --
let currentUser  = null;
let sessionToken = null;
let selectedDate = new Date().toISOString().split('T')[0];

// ─── Toast Notification System ─────────────────────────────────────────────
function showToast(msg, type = 'success', duration = 3000) {
  const wrap = document.getElementById('toast-wrap');
  if (!wrap) return;
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = msg;
  wrap.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast--visible'));
  setTimeout(() => {
    toast.classList.remove('toast--visible');
    setTimeout(() => toast.remove(), 350);
  }, duration);
}

// ─── Local Storage Helpers for Guest Mode ──────────────────────────────────
function getAnonTrackers() {
  try { return JSON.parse(localStorage.getItem(ANON_TRACKERS_KEY) || '[]'); }
  catch { return []; }
}
function saveAnonTrackers(t) { localStorage.setItem(ANON_TRACKERS_KEY, JSON.stringify(t)); }

function getAnonCustom() {
  try { return JSON.parse(localStorage.getItem(ANON_CUSTOM_KEY) || '[]'); }
  catch { return []; }
}
function saveAnonCustom(c) { localStorage.setItem(ANON_CUSTOM_KEY, JSON.stringify(c)); }

function getAnonSummaries() {
  try { return JSON.parse(localStorage.getItem(ANON_SUMMARIES_KEY) || '[]'); }
  catch { return []; }
}
function saveAnonSummaries(s) { localStorage.setItem(ANON_SUMMARIES_KEY, JSON.stringify(s)); }

function getUserSamples() {
  try { return JSON.parse(localStorage.getItem(ANON_USER_SAMPLES_KEY) || '[]'); }
  catch { return []; }
}
function saveUserSamples(s) { localStorage.setItem(ANON_USER_SAMPLES_KEY, JSON.stringify(s)); }

// ─── Unified DB / Local-Storage API ────────────────────────────────────────
async function dbGetCustomTrackers() {
  if (!currentUser) return { data: [], error: null };
  if (currentUser.isAnonymous) return { data: getAnonCustom(), error: null };
  return supabaseClient.from('custom_trackers').select('*').eq('user_id', currentUser.id);
}

async function dbGetTrackersForDate(date) {
  if (!currentUser) return { data: [], error: null };
  if (currentUser.isAnonymous) {
    return { data: getAnonTrackers().filter(d => d.date === date), error: null };
  }
  return supabaseClient.from('trackers').select('*').eq('user_id', currentUser.id).eq('date', date);
}

async function dbUpdateTrackerActivity(phase, date, activities, completionRate) {
  if (!currentUser) return { error: new Error('Not authenticated') };
  if (currentUser.isAnonymous) {
    let trackers = getAnonTrackers();
    let idx = trackers.findIndex(t => t.date === date && t.phase === phase);
    const doc = {
      id: idx >= 0 ? trackers[idx].id : 'anon-tr-' + Date.now() + Math.random(),
      user_id: currentUser.id, date, phase, activities,
      completion_rate: completionRate
    };
    if (idx >= 0) trackers[idx] = doc; else trackers.push(doc);
    saveAnonTrackers(trackers);
    return { error: null };
  }

  // Upsert: check if row exists first
  const { data: existing, error: fetchErr } = await supabaseClient
    .from('trackers').select('id').eq('user_id', currentUser.id)
    .eq('date', date).eq('phase', phase).maybeSingle();

  if (fetchErr) return { error: fetchErr };

  if (!existing) {
    return supabaseClient.from('trackers').insert([{
      user_id: currentUser.id, date, phase, activities, completion_rate: completionRate
    }]);
  }
  return supabaseClient.from('trackers').update({ activities, completion_rate: completionRate })
    .eq('id', existing.id);
}

async function dbGetAllTrackers() {
  if (!currentUser) return { data: [], error: null };
  if (currentUser.isAnonymous) return { data: getAnonTrackers(), error: null };
  return supabaseClient.from('trackers').select('*').eq('user_id', currentUser.id)
    .order('date', { ascending: false });
}

async function dbDeleteCustomTracker(id) {
  if (!currentUser) return { error: null };
  if (currentUser.isAnonymous) {
    saveAnonCustom(getAnonCustom().filter(c => c.id !== id));
    return { error: null };
  }
  return supabaseClient.from('custom_trackers').delete().eq('id', id).eq('user_id', currentUser.id);
}

async function dbInsertCustomTracker(phase, name) {
  if (!currentUser) return { error: new Error('Not authenticated') };
  if (currentUser.isAnonymous) {
    const custom = getAnonCustom();
    custom.push({ id: 'anon-c-' + Date.now() + Math.random(), user_id: currentUser.id, phase, name });
    saveAnonCustom(custom);
    return { error: null };
  }
  return supabaseClient.from('custom_trackers').insert([{ user_id: currentUser.id, phase, name }]);
}

async function dbInsertContactMessage(name, email, message) {
  if (currentUser && currentUser.isAnonymous) {
    console.log('Mock contact submit:', { name, email, message });
    return { error: null };
  }
  return supabaseClient.from('contact_messages').insert([{ name, email, message }]);
}

// ─── Auth Management ────────────────────────────────────────────────────────
async function checkAuth() {
  // Check for persisted anonymous guest
  const anonUser  = sessionStorage.getItem('pt_anonymous_user');
  const anonToken = sessionStorage.getItem('pt_anonymous_token');
  if (anonUser && anonToken) {
    currentUser  = JSON.parse(anonUser);
    sessionToken = anonToken;
    updateNav();
    return;
  }

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
      currentUser  = session.user;
      sessionToken = session.access_token;
    } else {
      currentUser  = null;
      sessionToken = null;
    }
  } catch (e) {
    console.error('Supabase getSession failed:', e);
    currentUser  = null;
    sessionToken = null;
  }
  updateNav();
}

function updateNav() {
  const userDiv       = document.getElementById('nav-user');
  const mobileUserDiv = document.getElementById('nav-mobile-user');
  const html = currentUser
    ? `<span style="font-size:0.82rem;font-weight:500;color:var(--muted-color);">${currentUser.isAnonymous ? 'Guest' : currentUser.email}</span>
       <button onclick="logout()" class="nav-logout-btn">Log Out</button>`
    : `<a href="#login" class="btn-primary" style="padding:0.4rem 1rem;font-size:0.82rem;border-radius:999px;">Sign In</a>`;
  if (userDiv)       userDiv.innerHTML       = html;
  if (mobileUserDiv) mobileUserDiv.innerHTML = html;
}

async function login(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) throw error;
  await checkAuth();
  window.location.hash = '#app';
}

async function signInAnonymously() {
  currentUser = { id: 'anonymous-guest-id', email: 'guest@local', isAnonymous: true };
  sessionToken = 'anonymous-guest-token';
  sessionStorage.setItem('pt_anonymous_user', JSON.stringify(currentUser));
  sessionStorage.setItem('pt_anonymous_token', sessionToken);
  updateNav();
  window.location.hash = '#app';
}

async function register(email, password) {
  const { data, error } = await supabaseClient.auth.signUp({ email, password });
  if (error) throw error;
  if (data.session) { await checkAuth(); return { autoLogin: true }; }
  return { autoLogin: false };
}

async function logout() {
  sessionStorage.removeItem('pt_anonymous_user');
  sessionStorage.removeItem('pt_anonymous_token');
  try { await supabaseClient.auth.signOut(); } catch (e) { console.warn('signOut:', e); }
  currentUser  = null;
  sessionToken = null;
  updateNav();
  window.location.hash = '#login';
}
window.logout = logout;

// ─── Routing ────────────────────────────────────────────────────────────────
async function route() {
  const hash   = window.location.hash || '#app';
  const root   = document.getElementById('root');
  const nav    = document.getElementById('app-nav');
  const footer = document.getElementById('app-footer');

  root.innerHTML = '';
  document.body.className = '';
  nav.classList.remove('hidden');
  footer.classList.remove('hidden');

  if (hash === '#test') { renderTestRunner(root); }
  else if (hash === '#login') { renderLogin(root); }
  else if (!currentUser) { window.location.hash = '#login'; }
  else {
    const page = hash.replace('#', '') || 'app';
    switch (page) {
      case 'app':
      case 'tracker': renderTracker(root); break;
      case 'summary': await renderSummary(root); break;
      case 'custom':  renderCustom(root); break;
      case 'samples': await renderSamples(root); break;
      case 'about':   renderAbout(root); break;
      case 'privacy': renderPrivacy(root); break;
      case 'contact': renderContact(root); break;
      default:
        root.innerHTML = '<div class="container text-center mt-4"><h2>Page not found</h2></div>';
    }
  }
  updateActiveNavLink();
}

function updateActiveNavLink() {
  const hash = window.location.hash || '#app';
  document.querySelectorAll('#nav-links .nav-lnk, #nav-mobile .nav-lnk').forEach(link => {
    const href = link.getAttribute('href');
    const active = href === hash || (hash === '' && href === '#app') || (hash === '#tracker' && href === '#app');
    link.classList.toggle('active', active);
  });
}

// ─── Privacy Page ────────────────────────────────────────────────────────────
function renderPrivacy(root) {
  root.innerHTML = `
    <div class="container">
      <h1 class="text-3xl mb-4">Privacy Policy</h1>
      <div class="tracker-tile">
        <p class="mb-4 text-lg">We value your privacy. This application is designed to prioritize data protection and user privacy.</p>
        <h3 class="font-bold mb-2">Guest (Anonymous) Users:</h3>
        <ul style="padding-left:1.5rem;margin-bottom:1.5rem;line-height:1.8;">
          <li>Your tracking data is stored entirely in your local browser storage.</li>
          <li>No personal information, email, or tracking logs are ever uploaded to our servers.</li>
          <li>Logging out or clearing browser cookies will erase your local session permanently.</li>
        </ul>
        <h3 class="font-bold mb-2">Registered Users:</h3>
        <ul style="padding-left:1.5rem;margin-bottom:1.5rem;line-height:1.8;">
          <li>We store your email and password hash securely via Supabase Auth.</li>
          <li>Daily habits and customised trackers are synced to a secure Supabase database.</li>
          <li>You can request deletion of your account and data at any time.</li>
        </ul>
      </div>
    </div>
  `;
}

// ─── Hamburger & Pomodoro Widgets ───────────────────────────────────────────
function initHamburger() {
  const hamburger  = document.getElementById('nav-hamburger');
  const mobileMenu = document.getElementById('nav-mobile');
  if (!hamburger || !mobileMenu) return;
  hamburger.addEventListener('click', () => {
    const open = hamburger.getAttribute('aria-expanded') === 'true';
    hamburger.setAttribute('aria-expanded', String(!open));
    mobileMenu.classList.toggle('hidden');
    mobileMenu.setAttribute('aria-hidden', String(open));
  });
  mobileMenu.querySelectorAll('.nav-lnk').forEach(link => {
    link.addEventListener('click', () => {
      mobileMenu.classList.add('hidden');
      hamburger.setAttribute('aria-expanded', 'false');
      mobileMenu.setAttribute('aria-hidden', 'true');
    });
  });
}

function initPomodoroWidget() {
  const widget     = document.getElementById('pomodoro-widget');
  const handle     = document.getElementById('pomodoro-handle');
  const closeBtn   = document.getElementById('pomodoro-close');
  const toggleBtn  = document.getElementById('pomo-toggle-btn');
  const toggleMob  = document.getElementById('pomo-toggle-mobile');
  if (!widget) return;

  // Restore saved position
  try {
    const saved = JSON.parse(localStorage.getItem('pt_pomodoro_pos') || 'null');
    if (saved) {
      const safeLeft = Math.max(0, Math.min(saved.left, window.innerWidth  - 290));
      const safeTop  = Math.max(0, Math.min(saved.top,  window.innerHeight - 220));
      Object.assign(widget.style, { position: 'fixed', bottom: 'auto', right: 'auto', left: safeLeft + 'px', top: safeTop + 'px' });
    }
  } catch {}

  const toggleVis = () => {
    widget.classList.toggle('hidden');
    if (!widget.classList.contains('hidden')) {
      const r = widget.getBoundingClientRect();
      if (r.left > window.innerWidth - r.width || r.top > window.innerHeight - r.height || r.left < 0 || r.top < 0) {
        Object.assign(widget.style, { position: 'fixed', bottom: 'auto', right: 'auto',
          left: Math.max(20, window.innerWidth - r.width - 32) + 'px',
          top:  Math.max(20, window.innerHeight - r.height - 32) + 'px' });
      }
    }
  };
  if (toggleBtn) toggleBtn.addEventListener('click', toggleVis);
  if (toggleMob) toggleMob.addEventListener('click', toggleVis);
  if (closeBtn)  closeBtn.addEventListener('click', () => widget.classList.add('hidden'));

  // Drag
  let isDragging = false, offsetX = 0, offsetY = 0;
  const dragStart = e => {
    if (e.type === 'mousedown' && e.button !== 0) return;
    isDragging = true;
    const cx = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
    const cy = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
    const r  = widget.getBoundingClientRect();
    offsetX  = cx - r.left; offsetY = cy - r.top;
    widget.style.transition = 'none';
    document.addEventListener('mousemove', dragMove);
    document.addEventListener('mouseup', dragEnd);
    document.addEventListener('touchmove', dragMove, { passive: false });
    document.addEventListener('touchend', dragEnd);
  };
  const dragMove = e => {
    if (!isDragging) return;
    if (e.cancelable) e.preventDefault();
    const cx = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
    const cy = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
    const l  = Math.max(0, Math.min(cx - offsetX, window.innerWidth  - widget.offsetWidth));
    const t  = Math.max(0, Math.min(cy - offsetY, window.innerHeight - widget.offsetHeight));
    Object.assign(widget.style, { position: 'fixed', bottom: 'auto', right: 'auto', left: l + 'px', top: t + 'px' });
  };
  const dragEnd = () => {
    if (!isDragging) return;
    isDragging = false;
    widget.style.transition = '';
    document.removeEventListener('mousemove', dragMove);
    document.removeEventListener('mouseup', dragEnd);
    document.removeEventListener('touchmove', dragMove);
    document.removeEventListener('touchend', dragEnd);
    const r = widget.getBoundingClientRect();
    localStorage.setItem('pt_pomodoro_pos', JSON.stringify({ left: r.left, top: r.top }));
  };
  if (handle) { handle.addEventListener('mousedown', dragStart); handle.addEventListener('touchstart', dragStart, { passive: true }); }

  // Timer
  let timerInterval = null, timeLeft = 1500, currentModeTime = 1500;
  const timeDisplay = document.getElementById('pomodoro-time');
  const startBtn    = document.getElementById('pomodoro-start');
  const pauseBtn    = document.getElementById('pomodoro-pause');
  const resetBtn    = document.getElementById('pomodoro-reset');

  const updateDisplay = () => {
    if (!timeDisplay) return;
    const m = Math.floor(timeLeft / 60), s = timeLeft % 60;
    timeDisplay.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  };
  const stopTimer = () => {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    startBtn?.classList.remove('hidden');
    pauseBtn?.classList.add('hidden');
  };
  const resetTimer = () => { stopTimer(); timeLeft = currentModeTime; updateDisplay(); };
  const startTimer = () => {
    if (timerInterval) return;
    startBtn?.classList.add('hidden');
    pauseBtn?.classList.remove('hidden');
    timerInterval = setInterval(() => {
      if (timeLeft > 0) { timeLeft--; updateDisplay(); }
      else { stopTimer(); showToast('⏱️ Timer finished! Time for a break.', 'success', 5000); resetTimer(); }
    }, 1000);
  };

  startBtn?.addEventListener('click', startTimer);
  pauseBtn?.addEventListener('click', stopTimer);
  resetBtn?.addEventListener('click', resetTimer);

  document.querySelectorAll('.pomo-mode').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pomo-mode').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentModeTime = parseInt(btn.getAttribute('data-time'), 10);
      stopTimer(); timeLeft = currentModeTime; updateDisplay();
    });
  });
  updateDisplay();
}

// ─── Theme Toggle ────────────────────────────────────────────────────────────
const THEME_KEY = 'pt_theme';

function applyTheme(theme) {
  const html = document.documentElement;
  const isLight = theme === 'light';

  if (isLight) {
    html.setAttribute('data-theme', 'light');
  } else {
    html.removeAttribute('data-theme');
  }

  const icon  = isLight ? '🌙' : '☀️';
  const label = isLight ? 'Dark' : 'Light';
  const mobileLabel = isLight ? 'Switch to Dark Mode' : 'Switch to Light Mode';

  const iconEl        = document.getElementById('theme-icon');
  const labelEl       = document.getElementById('theme-label');
  const iconMobEl     = document.getElementById('theme-icon-mobile');
  const labelMobEl    = document.getElementById('theme-label-mobile');

  if (iconEl)     iconEl.textContent     = icon;
  if (labelEl)    labelEl.textContent    = label;
  if (iconMobEl)  iconMobEl.textContent  = icon;
  if (labelMobEl) labelMobEl.textContent = mobileLabel;

  localStorage.setItem(THEME_KEY, theme);
}

function initThemeToggle() {
  // Apply saved preference on load (default: dark)
  const saved = localStorage.getItem(THEME_KEY) || 'dark';
  applyTheme(saved);

  const toggle    = document.getElementById('theme-toggle');
  const toggleMob = document.getElementById('theme-toggle-mobile');

  const handleToggle = () => {
    const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    applyTheme(current === 'light' ? 'dark' : 'light');
  };

  if (toggle)    toggle.addEventListener('click', handleToggle);
  if (toggleMob) toggleMob.addEventListener('click', handleToggle);
}

// ─── App Initialisation ──────────────────────────────────────────────────────
window.addEventListener('hashchange', () => route());
window.addEventListener('load', async () => {
  initThemeToggle();   // apply theme before anything renders
  await checkAuth();
  await route();
  initHamburger();
  initPomodoroWidget();

  // Listen for Supabase auth state changes (e.g. email confirm callback)
  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      currentUser  = session.user;
      sessionToken = session.access_token;
      updateNav();
      const hash = window.location.hash;
      if (!hash || hash === '#login') window.location.hash = '#app';
    } else if (event === 'SIGNED_OUT') {
      currentUser  = null;
      sessionToken = null;
      updateNav();
    }
  });
});

// ─── Login / Register Page ──────────────────────────────────────────────────
function renderLogin(root) {
  let authMode = 'signin';

  function getHTML() {
    const isReg = authMode === 'register';
    return `
      <div class="container">
        <div class="auth-box" id="auth-card">
          <div class="auth-logo">🧠</div>
          <h2 class="auth-title" id="auth-title">${isReg ? 'Create Account' : 'Welcome Back'}</h2>
          <p class="auth-subtitle" id="auth-subtitle">${isReg ? 'Start tracking your daily protocols' : 'Sign in to your Productivity Tracker'}</p>

          <div id="auth-status" class="auth-status" aria-live="polite" style="display:none"></div>

          <form id="auth-form" onsubmit="return false;" novalidate>
            <div class="form-group">
              <label for="auth-email">Email Address</label>
              <input type="email" id="auth-email" autocomplete="email" placeholder="you@example.com" required/>
              <span class="field-error" id="email-err"></span>
            </div>
            <div class="form-group" style="position:relative">
              <label for="auth-password">Password</label>
              <input type="password" id="auth-password" autocomplete="${isReg ? 'new-password' : 'current-password'}"
                placeholder="${isReg ? 'Min. 12 characters' : 'Your password'}" required/>
              <button type="button" id="pw-toggle" class="pw-toggle" aria-label="Toggle password visibility">👁</button>
              <span class="field-error" id="pw-err"></span>
            </div>
            ${isReg ? `
            <div class="form-group">
              <label for="auth-password-confirm">Confirm Password</label>
              <input type="password" id="auth-password-confirm" autocomplete="new-password" placeholder="Repeat your password" required/>
              <span class="field-error" id="pw-confirm-err"></span>
            </div>` : ''}
            <button type="submit" id="auth-submit" class="btn-primary auth-submit-btn">
              ${isReg ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <div class="auth-divider"><span>or</span></div>
          <button id="auth-toggle" class="btn-secondary auth-toggle-btn">
            ${isReg ? 'Already have an account? Sign In' : "Don't have an account? Register"}
          </button>

          <div class="auth-divider" style="margin:1.25rem 0 0.75rem"><span>Guest Mode</span></div>
          <button type="button" id="auth-anon" class="btn-secondary auth-anon-btn"
            style="width:100%;border:1.5px dashed var(--accent-color);background:#faf5ff;color:var(--accent-color);font-weight:600;padding:0.625rem;border-radius:0.625rem;font-size:0.875rem;cursor:pointer;transition:all 0.2s;">
            ⚡ Sign In as Guest (Anonymous)
          </button>
          <p style="font-size:0.75rem;color:#6b7280;text-align:center;margin-top:0.5rem;line-height:1.4;">
            No user account required. Your progress will be saved locally. No user data will be saved to the database.
          </p>
        </div>
      </div>
    `;
  }

  function render() { root.innerHTML = getHTML(); attachListeners(); }

  function setStatus(msg, type = 'error') {
    const el = document.getElementById('auth-status');
    if (!el) return;
    el.textContent = msg;
    el.className = `auth-status auth-status--${type}`;
    el.style.display = msg ? 'block' : 'none';
  }
  function setFieldError(id, msg) { const el = document.getElementById(id); if (el) el.textContent = msg; }
  function clearErrors() {
    setStatus('');
    ['email-err', 'pw-err', 'pw-confirm-err'].forEach(id => setFieldError(id, ''));
    ['auth-email', 'auth-password', 'auth-password-confirm'].forEach(id => {
      document.getElementById(id)?.classList.remove('input-error');
    });
  }
  function setLoading(loading) {
    const btn = document.getElementById('auth-submit');
    if (!btn) return;
    btn.disabled = loading;
    const toggleBtn = document.getElementById('auth-toggle');
    const anonBtn   = document.getElementById('auth-anon');
    if (loading) {
      toggleBtn?.setAttribute('disabled', '');
      anonBtn?.setAttribute('disabled', '');
    } else {
      toggleBtn?.removeAttribute('disabled');
      anonBtn?.removeAttribute('disabled');
    }
    btn.textContent = loading
      ? (authMode === 'register' ? 'Creating Account…' : 'Signing In…')
      : (authMode === 'register' ? 'Create Account' : 'Sign In');
  }
  function validate(email, password, confirm) {
    let ok = true;
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setFieldError('email-err', 'Please enter a valid email address.');
      document.getElementById('auth-email')?.classList.add('input-error');
      ok = false;
    }
    if (!password) {
      setFieldError('pw-err', 'Password is required.');
      document.getElementById('auth-password')?.classList.add('input-error');
      ok = false;
    } else if (authMode === 'register' && password.length < 12) {
      setFieldError('pw-err', 'Password must be at least 12 characters.');
      document.getElementById('auth-password')?.classList.add('input-error');
      ok = false;
    }
    if (authMode === 'register' && confirm !== undefined && confirm !== password) {
      setFieldError('pw-confirm-err', 'Passwords do not match.');
      document.getElementById('auth-password-confirm')?.classList.add('input-error');
      ok = false;
    }
    return ok;
  }

  async function doLogin() {
    clearErrors();
    const email    = (document.getElementById('auth-email')?.value || '').trim();
    const password = document.getElementById('auth-password')?.value || '';
    if (!validate(email, password)) return;
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setLoading(false);
      const msg = err.message || '';
      if (/invalid login|invalid credentials|email not confirmed/i.test(msg)) {
        setStatus('Invalid email or password. Please check your credentials.', 'error');
      } else {
        setStatus(msg || 'Sign in failed. Please try again.', 'error');
      }
    }
  }

  async function doRegister() {
    clearErrors();
    const email    = (document.getElementById('auth-email')?.value || '').trim();
    const password = document.getElementById('auth-password')?.value || '';
    const confirm  = document.getElementById('auth-password-confirm')?.value || '';
    if (!validate(email, password, confirm)) return;
    setLoading(true);
    try {
      const result = await register(email, password);
      if (result && result.autoLogin) {
        // Ensure redirect actually triggers even if hash is already #app
        await route();
        return;
      }
      setLoading(false);
      // Switch to sign-in mode immediately so user can login after confirming email
      authMode = 'signin';
      render();
      setStatus('✅ Account created! Check your email to confirm your address, then sign in.', 'success');
    } catch (err) {
      setLoading(false);
      const msg = err.message || '';
      if (/already registered|user already registered/i.test(msg)) {
        setStatus('An account with this email already exists. Please sign in instead.', 'error');
      } else {
        setStatus(msg || 'Registration failed. Please try again.', 'error');
      }
    }
  }

  function attachListeners() {
    // Password toggle
    document.getElementById('pw-toggle')?.addEventListener('click', () => {
      const inp = document.getElementById('auth-password');
      if (!inp) return;
      inp.type = inp.type === 'text' ? 'password' : 'text';
      document.getElementById('pw-toggle').textContent = inp.type === 'text' ? '🙈' : '👁';
    });
    // Mode toggle
    document.getElementById('auth-toggle')?.addEventListener('click', () => {
      authMode = authMode === 'signin' ? 'register' : 'signin';
      render();
    });
    // Anonymous
    document.getElementById('auth-anon')?.addEventListener('click', () => signInAnonymously());
    // Form submit
    document.getElementById('auth-form')?.addEventListener('submit', e => {
      e.preventDefault();
      authMode === 'register' ? doRegister() : doLogin();
    });
    // Clear field errors on typing
    document.getElementById('auth-email')?.addEventListener('input', () => { setFieldError('email-err',''); document.getElementById('auth-email')?.classList.remove('input-error'); });
    document.getElementById('auth-password')?.addEventListener('input', () => { setFieldError('pw-err',''); document.getElementById('auth-password')?.classList.remove('input-error'); });
  }

  render();
}

// ─── Tracker Page ────────────────────────────────────────────────────────────
function renderTracker(root) {
  root.innerHTML = `
    <div class="container">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:1rem;">
        <h1 class="text-3xl">Daily Tracker</h1>
        <input type="date" id="tracker-date" value="${selectedDate}" />
      </div>
      <p class="text-gray mb-8">
        Mark your protocols for <span id="display-date" style="font-weight:bold">${selectedDate === new Date().toISOString().split('T')[0] ? 'today' : selectedDate}</span>.
        <span style="color:var(--accent-color);font-size:0.85rem;margin-left:0.5rem;font-weight:bold;">✓ Auto-saves instantly</span>
      </p>
      <div class="grid-3" id="tracker-grid">Loading…</div>
    </div>
  `;

  document.getElementById('tracker-date').addEventListener('change', e => {
    if (!e.target.value) return;
    selectedDate = e.target.value;
    const isToday = selectedDate === new Date().toISOString().split('T')[0];
    document.getElementById('display-date').innerText = isToday ? 'today' : selectedDate;
    loadTrackerData();
  });

  loadTrackerData();
}

// ─── Routine User-Story Activity Definitions ────────────────────────────────
const DEFAULT_ACTIVITIES = {
  morning:   [
    'Hydration checklist',
    'Delay caffeine (90 min)',
    'Morning sunlight log',
    'Deep work session'
  ],
  afternoon: [
    'Lunch tracker',
    'Afternoon walk',
    'Nap / NSDR session',
    'Afternoon exercise log',
    'Dopamine reset'
  ],
  evening:   [
    'Sunset light exposure',
    'Dinner log',
    'Wind-down checklist',
    'Physiological sigh breathing',
    'Sleep schedule tracking'
  ]
};

// Rich metadata per activity (icons, subtitles, interaction type)
const ACTIVITY_META = {
  'Hydration checklist':         { icon:'💧', subtitle:'Hydration · Light · Exercise · Deep Work', type:'checklist',  items:['Drink 500ml water on waking','Get natural light exposure (5–30 min)','Move your body (stretch or walk)','Prepare for deep work block'] },
  'Delay caffeine (90 min)':     { icon:'☕', subtitle:'Avoid caffeine for 90 min after waking',   type:'caffeine' },
  'Morning sunlight log':        { icon:'🌤️', subtitle:'Track circadian rhythm alignment',           type:'sunlight' },
  'Deep work session':           { icon:'🎯', subtitle:'Focus aids for peak cognitive performance',  type:'deepwork' },
  'Lunch tracker':               { icon:'🥗', subtitle:'Log meal type to avoid energy crashes',      type:'lunch' },
  'Afternoon walk':              { icon:'🚶', subtitle:'Reinforce circadian health with movement',   type:'walk',    label:'Afternoon Walk' },
  'Nap / NSDR session':          { icon:'😴', subtitle:'Rest & Recharge — nap or NSDR',             type:'nsdr' },
  'Afternoon exercise log':      { icon:'🏋️', subtitle:'Track type & duration of exercise',         type:'exercise' },
  'Dopamine reset':              { icon:'🔄', subtitle:'Restore focus after long work streaks',      type:'dopamine' },
  'Sunset light exposure':       { icon:'🌅', subtitle:'Optimise melatonin with sunset cues',        type:'sunset' },
  'Dinner log':                  { icon:'🍽️', subtitle:'Log dinner to track sleep-affecting meals',  type:'dinner' },
  'Wind-down checklist':         { icon:'🌙', subtitle:'Prepare environment for quality sleep',      type:'winddown', items:['Dim lights','Activate screen blue-light filter','Cool bedroom to 18–20°C'] },
  'Physiological sigh breathing':{ icon:'🫁', subtitle:'2–3 cyclic sighs to relax before sleep',   type:'breathe' },
  'Sleep schedule tracking':     { icon:'📊', subtitle:'Log bedtime & wake time for consistency',   type:'sleep' }
};

function getOrderedActivities(phase, customData) {
  const list   = [...DEFAULT_ACTIVITIES[phase]];
  (customData || []).forEach(c => { if (c.phase === phase) list.push(c.name); });
  const mapped = list.map((name, i) => ({ name, id: `act_${i}` }));

  const orderKey = `pt_activities_order_${currentUser ? currentUser.id : 'guest'}_${phase}`;
  try {
    const stored = JSON.parse(localStorage.getItem(orderKey) || 'null');
    if (Array.isArray(stored)) {
      mapped.sort((a, b) => {
        const ia = stored.indexOf(a.name), ib = stored.indexOf(b.name);
        if (ia === -1 && ib === -1) return 0;
        if (ia === -1) return 1; if (ib === -1) return -1;
        return ia - ib;
      });
    }
  } catch {}
  return mapped;
}

window.handleCardDragStart = (e, phase, actId) => {
  e.dataTransfer.setData('text/plain', actId);
  e.dataTransfer.setData('source-phase', phase);
  e.target.closest('.activity-card')?.classList.add('dragging-card');
};
window.handleCardDragOver = e => { e.preventDefault(); e.target.closest('.activity-card')?.classList.add('drag-over'); };
window.handleCardDragLeave = e => { e.target.closest('.activity-card')?.classList.remove('drag-over'); };
window.handleCardDrop = async (e, targetPhase, targetActId) => {
  e.preventDefault();
  const sourceActId = e.dataTransfer.getData('text/plain');
  const sourcePhase = e.dataTransfer.getData('source-phase');
  e.target.closest('.activity-card')?.classList.remove('drag-over');
  if (sourcePhase !== targetPhase || sourceActId === targetActId) return;

  const { data: customData } = await dbGetCustomTrackers();
  const acts = getOrderedActivities(targetPhase, customData);
  const si = acts.findIndex(a => a.id === sourceActId);
  const ti = acts.findIndex(a => a.id === targetActId);
  if (si === -1 || ti === -1) return;
  const [moved] = acts.splice(si, 1);
  acts.splice(ti, 0, moved);
  const orderKey = `pt_activities_order_${currentUser ? currentUser.id : 'guest'}_${targetPhase}`;
  localStorage.setItem(orderKey, JSON.stringify(acts.map(a => a.name)));
  loadTrackerData();
};

function triggerConfetti() {
  const colors = ['#8b5cf6','#a78bfa','#f472b6','#3b82f6','#10b981','#fbbf24'];
  for (let i = 0; i < 60; i++) {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed', width: `${Math.random()*8+6}px`, height: `${Math.random()*8+6}px`,
      backgroundColor: colors[Math.floor(Math.random()*colors.length)],
      borderRadius: Math.random() > 0.5 ? '50%' : '0%',
      top: '-20px', left: `${Math.random()*100}vw`, zIndex: '9999', pointerEvents: 'none'
    });
    document.body.appendChild(el);
    const anim = el.animate([
      { transform: 'translateY(0) rotate(0deg)', opacity: 1 },
      { transform: `translateY(110vh) translateX(${(Math.random()-0.5)*200}px) rotate(${Math.random()*720}deg)`, opacity: 0.2 }
    ], { duration: Math.random()*1500+1500, easing: 'cubic-bezier(0.1,0.8,0.3,1)' });
    anim.onfinish = () => el.remove();
  }
}

// ─── Rich Activity Card Builder ──────────────────────────────────────────────
function buildActivityCard(phase, act, doc) {
  const st   = doc.activities[act.id]?.status || 'pending';
  const log  = doc.activities[act.id]?.log    || {};
  const meta = ACTIVITY_META[act.name] || { icon:'✅', subtitle:'', type:'basic' };
  const stClass = st === 'completed' ? 'completed' : st === 'skipped' ? 'skipped' : '';

  // Build inner panel based on type
  let panel = '';

  if (meta.type === 'checklist') {
    const checks = meta.items.map((item, i) => {
      const checked = log[`check_${i}`] === true;
      return `<label class="rt-check-label">
        <input type="checkbox" class="rt-checkbox" ${checked ? 'checked' : ''}
          onchange="window.updateChecklistItem('${phase}','${act.id}',${i},this.checked)">
        <span>${item}</span>
      </label>`;
    }).join('');
    panel = `<div class="rt-panel">${checks}</div>`;
  }

  if (meta.type === 'caffeine') {
    const wakeStr = log.wake_time || '';
    panel = `<div class="rt-panel">
      <label class="rt-label">Wake-up time</label>
      <div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;">
        <input type="time" class="rt-input" value="${wakeStr}" id="caf-wake-${act.id}"
          onchange="window.saveCaffeineWake('${phase}','${act.id}',this.value)">
        <span id="caf-hint-${act.id}" class="rt-hint">${wakeStr ? caffeineHint(wakeStr) : 'Enter wake time to see earliest caffeine window'}</span>
      </div>
    </div>`;
  }

  if (meta.type === 'sunlight') {
    const dur  = log.duration   || '';
    const cond = log.condition  || '';
    panel = `<div class="rt-panel">
      <label class="rt-label">Duration</label>
      <div class="rt-row">
        <select class="rt-select" onchange="window.saveSunlight('${phase}','${act.id}','duration',this.value)">
          <option value="">-- select --</option>
          ${[5,10,15,20,25,30].map(v=>`<option value="${v}" ${dur==v?'selected':''}>≥${v} min</option>`).join('')}
        </select>
        <select class="rt-select" onchange="window.saveSunlight('${phase}','${act.id}','condition',this.value)">
          <option value="">-- sky condition --</option>
          ${['Sunny','Cloudy','Overcast'].map(c=>`<option value="${c}" ${cond===c?'selected':''}>☁️ ${c}</option>`).join('')}
        </select>
      </div>
    </div>`;
  }

  if (meta.type === 'deepwork') {
    panel = `<div class="rt-panel">
      <p class="rt-label" style="margin-bottom:0.5rem">Focus Aid Menu</p>
      <div class="rt-chip-row">
        <button class="rt-chip" onclick="window.showFocusAid('screen')">🖥️ Screen Elevation Tip</button>
        <button class="rt-chip" onclick="window.showFocusAid('binaural')">🎧 Binaural Beats (40Hz)</button>
        <button class="rt-chip" onclick="window.showFocusAid('silence')">🔇 Silence Recommended</button>
      </div>
    </div>`;
  }

  if (meta.type === 'lunch' || meta.type === 'dinner') {
    const saved = log.meal_type || '';
    const opts  = meta.type === 'lunch'
      ? ['Low-carb / High-protein','Balanced','High-carb']
      : ['Balanced carbs + protein','Protein only','High-carb'];
    const label = meta.type === 'lunch' ? 'Meal type' : 'Dinner type';
    panel = `<div class="rt-panel">
      <label class="rt-label">${label}</label>
      <select class="rt-select" style="width:100%" onchange="window.saveMealType('${phase}','${act.id}',this.value)">
        <option value="">-- choose --</option>
        ${opts.map(o=>`<option value="${o}" ${saved===o?'selected':''}>${o}</option>`).join('')}
      </select>
      ${saved ? `<p class="rt-note">✅ Logged: <strong>${saved}</strong></p>` : ''}
    </div>`;
  }

  if (meta.type === 'walk' || meta.type === 'exercise') {
    const dur   = log.duration || '';
    const where = log.where    || '';
    const eType = log.ex_type  || '';
    const isWalk = meta.type === 'walk';
    panel = `<div class="rt-panel">
      <div class="rt-row">
        <div>
          <label class="rt-label">Duration</label>
          <select class="rt-select" onchange="window.saveActivityLog('${phase}','${act.id}','duration',this.value)">
            <option value="">--</option>
            ${[5,10,15,20,25,30].map(v=>`<option value="${v}" ${dur==v?'selected':''}>≥${v} min</option>`).join('')}
          </select>
        </div>
        ${isWalk ? `
        <div>
          <label class="rt-label">Location</label>
          <select class="rt-select" onchange="window.saveActivityLog('${phase}','${act.id}','where',this.value)">
            <option value="">--</option>
            <option value="Outdoors" ${where==='Outdoors'?'selected':''}>🌳 Outdoors</option>
            <option value="Indoors"  ${where==='Indoors'?'selected':''}>🏠 Indoors</option>
          </select>
        </div>` : `
        <div>
          <label class="rt-label">Type</label>
          <select class="rt-select" onchange="window.saveActivityLog('${phase}','${act.id}','ex_type',this.value)">
            <option value="">--</option>
            <option value="Strength"   ${eType==='Strength'?'selected':''}>💪 Strength</option>
            <option value="Endurance"  ${eType==='Endurance'?'selected':''}>🏃 Endurance</option>
            <option value="Mobility"   ${eType==='Mobility'?'selected':''}>🧘 Mobility</option>
          </select>
        </div>`}
      </div>
    </div>`;
  }

  if (meta.type === 'nsdr') {
    const saved = log.rest_type || '';
    panel = `<div class="rt-panel">
      <label class="rt-label">Rest & Recharge Mode</label>
      <div class="rt-chip-row">
        <button class="rt-chip ${saved==='nap'?'rt-chip--active':''}" onclick="window.saveRestType('${phase}','${act.id}','nap')">😴 Nap (&lt;20 min)</button>
        <button class="rt-chip ${saved==='nsdr'?'rt-chip--active':''}" onclick="window.saveRestType('${phase}','${act.id}','nsdr')">🧘 NSDR (10–30 min)</button>
      </div>
      ${saved ? `<p class="rt-note">✅ Selected: <strong>${saved === 'nap' ? 'Nap' : 'NSDR'}</strong></p>` : ''}
    </div>`;
  }

  if (meta.type === 'dopamine') {
    panel = `<div class="rt-panel">
      <p style="font-size:0.85rem;color:var(--muted-color);margin-bottom:0.5rem">Feeling fatigued or unfocused after a long work session?</p>
      <button class="rt-chip" onclick="window.showDopamineReset()">⚡ Start 10–30 min Dopamine Reset</button>
    </div>`;
  }

  if (meta.type === 'sunset') {
    const note = getSunsetNote();
    panel = `<div class="rt-panel">
      <p class="rt-note" style="margin-bottom:0.5rem">🌅 ${note}</p>
      <p style="font-size:0.8rem;color:var(--muted-color)">Step outside for 5–10 minutes near sunset to support melatonin release.</p>
    </div>`;
  }

  if (meta.type === 'winddown') {
    const checks = meta.items.map((item, i) => {
      const checked = log[`check_${i}`] === true;
      return `<label class="rt-check-label">
        <input type="checkbox" class="rt-checkbox" ${checked ? 'checked' : ''}
          onchange="window.updateChecklistItem('${phase}','${act.id}',${i},this.checked)">
        <span>${item}</span>
      </label>`;
    }).join('');
    panel = `<div class="rt-panel">${checks}</div>`;
  }

  if (meta.type === 'breathe') {
    panel = `<div class="rt-panel">
      <p style="font-size:0.85rem;color:var(--muted-color);margin-bottom:0.5rem">Guided 2–3 cyclic sighs to calm your nervous system.</p>
      <button class="rt-chip" onclick="window.showBreathingGuide()">🫁 Start Breathing Exercise</button>
    </div>`;
  }

  if (meta.type === 'sleep') {
    const bed  = log.bedtime   || '';
    const wake = log.wake_time || '';
    panel = `<div class="rt-panel">
      <div class="rt-row">
        <div>
          <label class="rt-label">Bedtime</label>
          <input type="time" class="rt-input" value="${bed}" onchange="window.saveSleepLog('${phase}','${act.id}','bedtime',this.value)">
        </div>
        <div>
          <label class="rt-label">Wake-up time</label>
          <input type="time" class="rt-input" value="${wake}" onchange="window.saveSleepLog('${phase}','${act.id}','wake_time',this.value)">
        </div>
      </div>
      <div id="sleep-chart-${act.id}" style="margin-top:0.75rem"></div>
    </div>`;
  }

  return `
    <div id="card-${phase}-${act.id}"
         class="activity-card ${stClass}"
         draggable="true"
         ondragstart="handleCardDragStart(event,'${phase}','${act.id}')"
         ondragend="this.classList.remove('dragging-card')"
         ondragover="handleCardDragOver(event)"
         ondragleave="handleCardDragLeave(event)"
         ondrop="handleCardDrop(event,'${phase}','${act.id}')">
      <div style="width:100%;">
        <div style="display:flex;align-items:flex-start;gap:0.75rem;">
          <div class="card-drag-handle" title="Drag to reorder">⋮⋮</div>
          <div class="rt-icon">${meta.icon}</div>
          <div style="flex:1">
            <strong style="font-size:0.95rem">${act.name}</strong>
            <p style="font-size:0.78rem;color:var(--muted-color);margin-top:0.15rem">${meta.subtitle}</p>
            <div class="activity-actions">
              <button onclick="updateActivity('${phase}','${act.id}','completed')" class="btn-sm done">✓ Done</button>
              <button onclick="updateActivity('${phase}','${act.id}','skipped')"   class="btn-sm skip">✗ Skip</button>
              <button onclick="updateActivity('${phase}','${act.id}','pending')"   class="btn-sm">↺ Reset</button>
            </div>
          </div>
        </div>
        ${panel}
      </div>
    </div>`;
}

function caffeineHint(wakeTime) {
  try {
    const [h, m] = wakeTime.split(':').map(Number);
    const total  = h * 60 + m + 90;
    const hh     = Math.floor(total / 60) % 24;
    const mm     = total % 60;
    return `☕ Earliest caffeine: <strong>${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}</strong>`;
  } catch { return ''; }
}

function getSunsetNote() {
  const hour = new Date().getHours();
  if (hour >= 17 && hour <= 19) return 'It\'s near sunset — perfect time to step outside now!';
  if (hour > 19)  return 'You may have missed today\'s sunset. Mark for tomorrow!';
  return 'Reminder set — check back near 5–7 PM for sunset light cues.';
}

async function loadTrackerData() {
  const grid = document.getElementById('tracker-grid');
  if (!grid) return;
  grid.innerHTML = '<div style="text-align:center;padding:2rem;color:#6b7280;">Loading…</div>';
  try {
    const targetDate = selectedDate;
    const { data: customData } = await dbGetCustomTrackers();
    const { data: docs, error } = await dbGetTrackersForDate(targetDate);
    if (error) throw error;

    // Dopamine reset: check if any afternoon work streak > 3h logged
    const afDoc = (docs || []).find(d => d.phase === 'afternoon') || { activities: {} };
    const contWorkHours = afDoc.activities['work_streak_hours'] || 0;
    const showDopamineAlert = Number(contWorkHours) > 3;

    let html = '';
    const phaseLabels = { morning: '🌅 Morning', afternoon: '☀️ Afternoon', evening: '🌙 Evening' };

    ['morning', 'afternoon', 'evening'].forEach(phase => {
      let doc = (docs || []).find(d => d.phase === phase) || { phase, activities: {}, completion_rate: 0 };
      const acts = getOrderedActivities(phase, customData);
      const actHtml = acts.map(act => buildActivityCard(phase, act, doc)).join('');

      const dopamineAlert = (phase === 'afternoon' && showDopamineAlert)
        ? `<div class="rt-alert rt-alert--warning">
             ⚠️ You've logged &gt;3 hours of continuous work. Try a <strong>10–30 min dopamine reset</strong> to restore focus.
           </div>`
        : '';

      html += `
        <div class="tracker-tile ${phase}-tile">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem">
            <h2 class="text-2xl" style="text-transform:capitalize">${phaseLabels[phase]}</h2>
            <span class="rt-pct" id="pct-${phase}">${doc.completion_rate}%</span>
          </div>
          <div class="progress-bg"><div class="progress-bar" id="bar-${phase}" style="width:${doc.completion_rate}%"></div></div>
          ${dopamineAlert}
          <div style="margin-top:1rem">${actHtml}</div>
        </div>`;
    });
    grid.innerHTML = html;

    // Render sleep chart if sleep log exists
    renderSleepChart();

  } catch (err) {
    console.error('Tracker load error:', err);
    grid.innerHTML = `<div class="alert alert-error" style="grid-column:1/-1">Error loading data: ${err.message}</div>`;
  }
}

window.updateActivity = async function(phase, actId, status) {
  const targetDate = selectedDate;

  // Optimistic UI
  const card = document.getElementById(`card-${phase}-${actId}`);
  if (card) card.className = `activity-card ${status === 'completed' ? 'completed' : status === 'skipped' ? 'skipped' : ''}`;

  let oldRate = 0, rate = 0;
  const tile = document.querySelector(`.${phase}-tile`);
  if (tile) {
    const bar = tile.querySelector('.progress-bar');
    oldRate = bar ? parseFloat(bar.style.width || '0') : 0;
    const completed = tile.querySelectorAll('.activity-card.completed').length;
    const total     = tile.querySelectorAll('.activity-card').length;
    rate = total > 0 ? Math.round((completed / total) * 100) : 0;
    if (bar) bar.style.width = `${rate}%`;
  }
  if (rate === 100 && oldRate < 100) { triggerConfetti(); showToast('🎉 Phase complete! Great work!', 'success'); }

  // Background sync
  try {
    const { data: docs, error: fetchErr } = await dbGetTrackersForDate(targetDate);
    if (fetchErr) throw fetchErr;
    let existing    = (docs || []).find(d => d.phase === phase);
    let activities  = existing ? { ...existing.activities } : {};
    activities[actId] = { status };
    const tileEl = document.querySelector(`.${phase}-tile`);
    const domTotal = tileEl ? tileEl.querySelectorAll('.activity-card').length : DEFAULT_ACTIVITIES[phase].length;
    const completionRate = calculateRate(activities, domTotal);
    const { error: updateErr } = await dbUpdateTrackerActivity(phase, targetDate, activities, completionRate);
    if (updateErr) throw updateErr;
  } catch (err) {
    console.error('Activity update failed:', err);
    showToast('Failed to save: ' + (err.message || String(err)), 'error');
    loadTrackerData();
  }
};

function calculateRate(activities, total) {
  const done = Object.values(activities).filter(a => a.status === 'completed').length;
  return total > 0 ? Math.round((done / total) * 100) : 0;
}

// ─── Activity Log Save Helpers ───────────────────────────────────────────────
async function saveActivityField(phase, actId, fields) {
  try {
    const { data: docs } = await dbGetTrackersForDate(selectedDate);
    let existing   = (docs || []).find(d => d.phase === phase);
    let activities = existing ? { ...existing.activities } : {};
    const prev     = activities[actId] || { status: 'pending', log: {} };
    activities[actId] = { ...prev, log: { ...(prev.log || {}), ...fields } };
    const tileEl   = document.querySelector(`.${phase}-tile`);
    const domTotal = tileEl ? tileEl.querySelectorAll('.activity-card').length : DEFAULT_ACTIVITIES[phase].length;
    const { error } = await dbUpdateTrackerActivity(phase, selectedDate, activities, calculateRate(activities, domTotal));
    if (error) throw error;
  } catch (err) {
    showToast('Save failed: ' + (err.message || String(err)), 'error');
  }
}

window.updateChecklistItem = async function(phase, actId, idx, checked) {
  await saveActivityField(phase, actId, { [`check_${idx}`]: checked });
};

window.saveCaffeineWake = async function(phase, actId, wakeTime) {
  const hint = document.getElementById(`caf-hint-${actId}`);
  if (hint) hint.innerHTML = caffeineHint(wakeTime);
  await saveActivityField(phase, actId, { wake_time: wakeTime });
};

window.saveSunlight = async function(phase, actId, field, value) {
  await saveActivityField(phase, actId, { [field]: value });
  showToast('☀️ Sunlight log updated!', 'success');
};

window.saveMealType = async function(phase, actId, value) {
  await saveActivityField(phase, actId, { meal_type: value });
  showToast('🍽️ Meal logged!', 'success');
};

window.saveActivityLog = async function(phase, actId, field, value) {
  await saveActivityField(phase, actId, { [field]: value });
};

window.saveRestType = async function(phase, actId, restType) {
  await saveActivityField(phase, actId, { rest_type: restType });
  showToast(restType === 'nap' ? '😴 Nap scheduled!' : '🧘 NSDR session selected!', 'success');
  loadTrackerData(); // re-render to show chip highlight
};

window.saveSleepLog = async function(phase, actId, field, value) {
  await saveActivityField(phase, actId, { [field]: value });
  setTimeout(() => renderSleepChart(), 300);
};

// ─── Sleep Consistency Weekly Chart ──────────────────────────────────────────
async function renderSleepChart() {
  const containers = document.querySelectorAll('[id^="sleep-chart-"]');
  if (!containers.length) return;

  try {
    const { data: docs } = await dbGetAllTrackers();
    const sleepActs = (docs || []).filter(d => d.phase === 'evening');

    // Collect last 7 days of bedtime/wake logs
    const entries = [];
    sleepActs.forEach(d => {
      const acts = Object.values(d.activities || {});
      acts.forEach(a => {
        if (a.log && (a.log.bedtime || a.log.wake_time)) {
          entries.push({ date: d.date, bed: a.log.bedtime || '', wake: a.log.wake_time || '' });
        }
      });
    });

    const last7 = entries.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7).reverse();

    containers.forEach(el => {
      if (!last7.length) {
        el.innerHTML = '<p class="rt-note" style="text-align:center">Log bedtime & wake time to see your weekly chart here.</p>';
        return;
      }
      const barHtml = last7.map(e => {
        const label = e.date.slice(5); // MM-DD
        return `
          <div class="sleep-bar-col">
            <div class="sleep-bar-wrap">
              <div class="sleep-bar" title="Bed: ${e.bed || '?'} | Wake: ${e.wake || '?'}"></div>
            </div>
            <span class="sleep-bar-label">${label}</span>
            <span class="sleep-bar-sub">${e.bed || '—'}</span>
          </div>`;
      }).join('');
      el.innerHTML = `
        <p class="rt-label" style="margin-bottom:0.5rem">📊 Sleep Consistency (last 7 days, ±1h target)</p>
        <div class="sleep-chart">${barHtml}</div>`;
    });
  } catch (e) { console.warn('Sleep chart error:', e); }
}

// ─── Modal System ─────────────────────────────────────────────────────────────
function showModal(title, bodyHTML, footer = '') {
  document.getElementById('rt-modal-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'rt-modal-overlay';
  overlay.className = 'rt-modal-overlay';
  overlay.innerHTML = `
    <div class="rt-modal" role="dialog" aria-modal="true">
      <div class="rt-modal-header">
        <h3 class="rt-modal-title">${title}</h3>
        <button class="rt-modal-close" onclick="document.getElementById('rt-modal-overlay').remove()" aria-label="Close">&times;</button>
      </div>
      <div class="rt-modal-body">${bodyHTML}</div>
      ${footer ? `<div class="rt-modal-footer">${footer}</div>` : ''}
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('rt-modal-overlay--visible'));
}

// ─── Focus Aid Modals ─────────────────────────────────────────────────────────
window.showFocusAid = function(type) {
  const aids = {
    screen: {
      title: '🖥️ Screen Elevation Tip',
      body: `<div class="rt-guide-step">
        <p>Elevate your monitor so the <strong>top third of the screen is at eye level</strong>. This keeps your gaze slightly upward, which promotes alertness and focus.</p>
        <ul class="rt-guide-list">
          <li>Use a monitor stand or stack books underneath</li>
          <li>Avoid slouching — sit back with a straight spine</li>
          <li>Distance: arm-length from screen (~60–70 cm)</li>
        </ul>
      </div>`
    },
    binaural: {
      title: '🎧 Binaural Beats (40Hz)',
      body: `<div class="rt-guide-step">
        <p>40Hz gamma binaural beats are associated with <strong>enhanced focus, concentration, and deep work states</strong>.</p>
        <ul class="rt-guide-list">
          <li>Use stereo headphones (required for binaural effect)</li>
          <li>Play at low-to-moderate volume</li>
          <li>Search: "40Hz binaural beats" on YouTube or Spotify</li>
          <li>Session: 25–90 minutes for deep work blocks</li>
        </ul>
        <div class="rt-alert rt-alert--info" style="margin-top:0.75rem">Not recommended for people with epilepsy or photosensitivity.</div>
      </div>`
    },
    silence: {
      title: '🔇 Silence Recommended',
      body: `<div class="rt-guide-step">
        <p>Silence is one of the most powerful environments for deep cognitive work.</p>
        <ul class="rt-guide-list">
          <li>Turn off notifications on all devices</li>
          <li>Use earplugs or noise-cancelling headphones without music</li>
          <li>Communicate "do not disturb" to those around you</li>
          <li>Combine with a 25–90 min uninterrupted focus block</li>
        </ul>
      </div>`
    }
  };
  const aid = aids[type];
  if (aid) showModal(aid.title, aid.body);
};

// ─── Dopamine Reset Modal ─────────────────────────────────────────────────────
window.showDopamineReset = function() {
  showModal('⚡ Dopamine Reset Protocol', `
    <div class="rt-guide-step">
      <p>After extended focus, your dopamine levels drop. A <strong>10–30 minute reset</strong> restores motivation and sharpens focus for the next block.</p>
      <p class="rt-label" style="margin-top:0.75rem;margin-bottom:0.5rem">Choose a reset activity:</p>
      <div class="rt-chip-row" style="flex-wrap:wrap">
        <span class="rt-chip rt-chip--static">🚶 Walk (no phone)</span>
        <span class="rt-chip rt-chip--static">🌳 Sit outdoors</span>
        <span class="rt-chip rt-chip--static">😮‍💨 Non-sleep deep rest</span>
        <span class="rt-chip rt-chip--static">👁️ View nature / horizon</span>
        <span class="rt-chip rt-chip--static">☕ Mindful rest (no screens)</span>
      </div>
      <div class="rt-alert rt-alert--info" style="margin-top:0.75rem">
        ⏱️ Set a timer for 10–30 minutes. Avoid social media or stimulating content during reset.
      </div>
    </div>
  `);
};

// ─── Breathing Exercise Guide ─────────────────────────────────────────────────
window.showBreathingGuide = function() {
  let step = 0;
  const steps = [
    { title: 'Step 1 — Prepare', icon: '🫁', desc: 'Sit comfortably or lie down. Rest your hands on your belly. Close your eyes and relax your jaw.' },
    { title: 'Step 2 — Double Inhale', icon: '👃', desc: 'Take a <strong>deep inhale through your nose</strong>. Then, without exhaling, take a <strong>second sharp sniff</strong> to fully inflate the lungs.' },
    { title: 'Step 3 — Long Exhale', icon: '😮‍💨', desc: 'Release all air through your mouth in one <strong>long, slow exhale</strong> (4–6 seconds). Feel tension leave with each breath.' },
    { title: 'Step 4 — Repeat', icon: '🔄', desc: 'Repeat steps 2–3 for <strong>2–3 cycles total</strong>. With each cycle, notice your heart rate slowing and body relaxing.' },
    { title: '✅ Complete!', icon: '🌙', desc: 'Excellent. Your nervous system is now in a calmer state. You should feel more relaxed and ready for sleep.' }
  ];

  function renderStep() {
    const s = steps[step];
    const bodyEl = document.querySelector('#rt-modal-overlay .rt-modal-body');
    const fEl    = document.querySelector('#rt-modal-overlay .rt-modal-footer');
    if (!bodyEl) return;
    bodyEl.innerHTML = `
      <div class="rt-breathe-step">
        <div class="rt-breathe-icon">${s.icon}</div>
        <h4 class="rt-breathe-title">${s.title}</h4>
        <p class="rt-breathe-desc">${s.desc}</p>
        <div class="rt-breathe-progress">
          ${steps.map((_, i) => `<span class="rt-bp-dot ${i === step ? 'rt-bp-dot--active' : i < step ? 'rt-bp-dot--done' : ''}"></span>`).join('')}
        </div>
      </div>`;
    if (fEl) fEl.innerHTML = `
      ${step > 0 ? `<button class="btn-secondary" onclick="window._breatheStep(${step-1})">← Back</button>` : '<span></span>'}
      ${step < steps.length - 1
        ? `<button class="btn-primary" onclick="window._breatheStep(${step+1})">Next →</button>`
        : `<button class="btn-primary" onclick="document.getElementById('rt-modal-overlay').remove()">Done 🌙</button>`}`;
  }

  window._breatheStep = function(n) { step = n; renderStep(); };

  showModal('🫁 Physiological Sigh Breathing', '', `<span></span><button class="btn-primary" onclick="window._breatheStep(1)">Next →</button>`);
  step = 0;
  const bodyEl = document.querySelector('#rt-modal-overlay .rt-modal-body');
  const s = steps[0];
  if (bodyEl) bodyEl.innerHTML = `
    <div class="rt-breathe-step">
      <div class="rt-breathe-icon">${s.icon}</div>
      <h4 class="rt-breathe-title">${s.title}</h4>
      <p class="rt-breathe-desc">${s.desc}</p>
      <div class="rt-breathe-progress">
        ${steps.map((_, i) => `<span class="rt-bp-dot ${i === 0 ? 'rt-bp-dot--active' : ''}"></span>`).join('')}
      </div>
    </div>`;
};

// ─── Summary / Analytics Page ────────────────────────────────────────────────
async function renderSummary(root) {
  root.innerHTML = `
    <div class="container">
      <h1 class="text-3xl mb-4">Progress Analysis</h1>
      <p class="text-gray mb-8">Analyse your consistency and routines over time.</p>
      <div id="summary-content">Loading your analytics…</div>
    </div>
  `;

  try {
    const { data: docs, error } = await dbGetAllTrackers();
    if (error) throw error;

    const dateGroups = {};
    (docs || []).forEach(d => { (dateGroups[d.date] = dateGroups[d.date] || []).push(d); });
    const dates = Object.keys(dateGroups).sort((a, b) => b.localeCompare(a));
    const totalDays = dates.length;

    // Build analytics HTML (even if no tracking data, still show notes section)
    let analyticsHtml = '';

    if (totalDays === 0) {
      analyticsHtml = '<div class="alert text-center mb-8">No tracking data recorded yet. Start tracking your activities to see analytics!</div>';
    } else {
      // Best phase
      const phaseScores = { morning: { sum: 0, count: 0 }, afternoon: { sum: 0, count: 0 }, evening: { sum: 0, count: 0 } };
      (docs || []).forEach(d => { if (phaseScores[d.phase]) { phaseScores[d.phase].sum += parseFloat(d.completion_rate || 0); phaseScores[d.phase].count++; } });
      let bestPhase = 'N/A', maxAvg = -1;
      for (const p in phaseScores) {
        if (phaseScores[p].count > 0) {
          const avg = phaseScores[p].sum / phaseScores[p].count;
          if (avg > maxAvg) { maxAvg = avg; bestPhase = p.charAt(0).toUpperCase() + p.slice(1); }
        }
      }

      let totalRate = 0;
      let recentHtml = '';
      dates.slice(0, 7).forEach(date => {
        const dayDocs = dateGroups[date];
        const avg = dayDocs.reduce((acc, c) => acc + parseFloat(c.completion_rate || 0), 0) / dayDocs.length;
        recentHtml += `
          <div style="margin-bottom:1rem">
            <div style="display:flex;justify-content:space-between;font-size:0.875rem;margin-bottom:0.25rem;">
              <strong>${date}</strong>
              <span style="color:${avg >= 80 ? 'var(--accent-color)' : 'inherit'}">${Math.round(avg)}%</span>
            </div>
            <div class="progress-bg"><div class="progress-bar" style="width:${avg}%"></div></div>
          </div>`;
      });
      dates.forEach(date => {
        const dayDocs = dateGroups[date];
        totalRate += dayDocs.reduce((acc, c) => acc + parseFloat(c.completion_rate || 0), 0) / dayDocs.length;
      });
      const overallAvg = Math.round(totalRate / totalDays);

      analyticsHtml = `
        <div class="grid-3 mb-8">
          <div class="tracker-tile text-center" style="display:flex;flex-direction:column;justify-content:center;">
            <h3 class="font-bold mb-2">Days Tracked</h3>
            <p class="text-4xl" style="color:var(--accent-color)">${totalDays}</p>
          </div>
          <div class="tracker-tile text-center" style="display:flex;flex-direction:column;justify-content:center;">
            <h3 class="font-bold mb-2">Overall Consistency</h3>
            <p class="text-4xl" style="color:var(--accent-color)">${overallAvg}%</p>
          </div>
          <div class="tracker-tile text-center" style="display:flex;flex-direction:column;justify-content:center;">
            <h3 class="font-bold mb-2">Strongest Phase</h3>
            <p class="text-3xl" style="color:var(--accent-color);font-weight:bold">${bestPhase}</p>
          </div>
        </div>
        <div class="tracker-tile mb-8" style="max-width:800px;margin:0 auto;">
          <h2 class="text-2xl mb-6 border-b pb-2">Last 7 Active Days</h2>
          ${recentHtml}
        </div>`;
    }

    // Custom Summaries / Notes section
    const summaries = getAnonSummaries();
    const notesHtml = buildCustomSummariesHtml(summaries);

    document.getElementById('summary-content').innerHTML = analyticsHtml + notesHtml;
    attachSummaryListeners();

  } catch (err) {
    document.getElementById('summary-content').innerHTML =
      `<div class="alert alert-error">Error loading analysis: ${err.message}</div>`;
  }
}

// ─── Custom Summaries / Journal Notes ────────────────────────────────────────
const SUMMARY_CATEGORIES = [
  { value: 'reflection', label: '🪞 Reflection', color: '#8b5cf6' },
  { value: 'goal', label: '🎯 Goal', color: '#3b82f6' },
  { value: 'win', label: '🏆 Win', color: '#10b981' },
  { value: 'challenge', label: '⚡ Challenge', color: '#f59e0b' },
  { value: 'insight', label: '💡 Insight', color: '#ec4899' },
  { value: 'other', label: '📝 Other', color: '#6b7280' },
];

function buildCustomSummariesHtml(summaries) {
  const categoryOptions = SUMMARY_CATEGORIES.map(c =>
    `<option value="${c.value}">${c.label}</option>`
  ).join('');

  const sortedSummaries = [...summaries].sort((a, b) => b.createdAt - a.createdAt);

  const notesListHtml = sortedSummaries.length === 0
    ? `<div class="summary-notes-empty">
         <span class="summary-notes-empty-icon">📝</span>
         <p>No notes yet. Add your first reflection, goal, or insight above!</p>
       </div>`
    : sortedSummaries.map(note => {
        const cat = SUMMARY_CATEGORIES.find(c => c.value === note.category) || SUMMARY_CATEGORIES[5];
        const date = new Date(note.createdAt);
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        return `
          <div class="summary-note-card">
            <div class="summary-note-header">
              <div class="summary-note-meta">
                <span class="summary-note-category" style="--cat-color:${cat.color}">${cat.label}</span>
                <span class="summary-note-date">${dateStr} · ${timeStr}</span>
              </div>
              <button class="summary-note-delete" onclick="window.deleteCustomSummary('${note.id}')" title="Delete note">×</button>
            </div>
            ${note.title ? `<h4 class="summary-note-title">${escapeHtml(note.title)}</h4>` : ''}
            <p class="summary-note-body">${escapeHtml(note.content)}</p>
          </div>`;
      }).join('');

  return `
    <div class="summary-notes-section" style="max-width:800px;margin:0 auto;">
      <div class="summary-notes-header">
        <div>
          <h2 class="text-2xl" style="display:flex;align-items:center;gap:0.5rem;">📓 My Notes & Reflections</h2>
          <p class="text-gray" style="font-size:0.85rem;margin-top:0.25rem;">Track your thoughts, set goals, and celebrate wins.</p>
        </div>
        <span class="summary-notes-count">${summaries.length} ${summaries.length === 1 ? 'note' : 'notes'}</span>
      </div>

      <!-- Add note form -->
      <div class="summary-add-form" id="summary-add-form">
        <div class="summary-add-row">
          <select id="summary-category" class="summary-add-select">
            ${categoryOptions}
          </select>
          <input type="text" id="summary-title" class="summary-add-title" placeholder="Title (optional)" maxlength="100" />
        </div>
        <textarea id="summary-content-input" class="summary-add-textarea" placeholder="Write your reflection, goal, or insight…" rows="3" maxlength="1000"></textarea>
        <div class="summary-add-footer">
          <span class="summary-char-count" id="summary-char-count">0 / 1000</span>
          <button class="btn-primary summary-add-btn" id="summary-add-btn" onclick="window.addCustomSummary()">+ Add Note</button>
        </div>
      </div>

      <!-- Notes list -->
      <div class="summary-notes-list" id="summary-notes-list">
        ${notesListHtml}
      </div>
    </div>`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function attachSummaryListeners() {
  const textarea = document.getElementById('summary-content-input');
  const charCount = document.getElementById('summary-char-count');
  if (textarea && charCount) {
    textarea.addEventListener('input', () => {
      charCount.textContent = `${textarea.value.length} / 1000`;
    });
  }
}

window.addCustomSummary = function() {
  const category = document.getElementById('summary-category')?.value || 'reflection';
  const title = (document.getElementById('summary-title')?.value || '').trim();
  const content = (document.getElementById('summary-content-input')?.value || '').trim();

  if (!content) {
    showToast('Please write something before adding a note.', 'error');
    return;
  }

  const summaries = getAnonSummaries();
  const newNote = {
    id: 'note-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    category,
    title,
    content,
    createdAt: Date.now(),
    userId: currentUser ? currentUser.id : 'guest'
  };
  summaries.push(newNote);
  saveAnonSummaries(summaries);

  // Clear form
  document.getElementById('summary-title').value = '';
  document.getElementById('summary-content-input').value = '';
  document.getElementById('summary-char-count').textContent = '0 / 1000';

  // Re-render notes list
  const notesList = document.getElementById('summary-notes-list');
  if (notesList) {
    notesList.innerHTML = buildCustomSummariesHtml(summaries).match(/<div class="summary-notes-list"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*$/)?.[1] || '';
    // Simpler: just re-render the entire section
    refreshSummaryNotes();
  }

  const cat = SUMMARY_CATEGORIES.find(c => c.value === category);
  showToast(`${cat ? cat.label : '📝'} Note added!`, 'success');
};

window.deleteCustomSummary = function(noteId) {
  const summaries = getAnonSummaries().filter(s => s.id !== noteId);
  saveAnonSummaries(summaries);
  refreshSummaryNotes();
  showToast('Note deleted.', 'success');
};

function refreshSummaryNotes() {
  const summaries = getAnonSummaries();
  const section = document.querySelector('.summary-notes-section');
  if (!section) return;

  // Update notes list
  const notesList = section.querySelector('.summary-notes-list');
  const sortedSummaries = [...summaries].sort((a, b) => b.createdAt - a.createdAt);

  if (sortedSummaries.length === 0) {
    notesList.innerHTML = `
      <div class="summary-notes-empty">
        <span class="summary-notes-empty-icon">📝</span>
        <p>No notes yet. Add your first reflection, goal, or insight above!</p>
      </div>`;
  } else {
    notesList.innerHTML = sortedSummaries.map(note => {
      const cat = SUMMARY_CATEGORIES.find(c => c.value === note.category) || SUMMARY_CATEGORIES[5];
      const date = new Date(note.createdAt);
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      return `
        <div class="summary-note-card">
          <div class="summary-note-header">
            <div class="summary-note-meta">
              <span class="summary-note-category" style="--cat-color:${cat.color}">${cat.label}</span>
              <span class="summary-note-date">${dateStr} · ${timeStr}</span>
            </div>
            <button class="summary-note-delete" onclick="window.deleteCustomSummary('${note.id}')" title="Delete note">×</button>
          </div>
          ${note.title ? `<h4 class="summary-note-title">${escapeHtml(note.title)}</h4>` : ''}
          <p class="summary-note-body">${escapeHtml(note.content)}</p>
        </div>`;
    }).join('');
  }

  // Update count
  const countEl = section.querySelector('.summary-notes-count');
  if (countEl) countEl.textContent = `${summaries.length} ${summaries.length === 1 ? 'note' : 'notes'}`;
}

// ─── Custom Tracker Page — Drag & Drop Tile Builder ─────────────────────────
const SUGGESTED_ACTIVITIES = {
  morning: [
    { name: 'Meditation', icon: '🧘' },
    { name: 'Journaling', icon: '📓' },
    { name: 'Cold shower', icon: '🚿' },
    { name: 'Stretching', icon: '🤸' },
    { name: 'Gratitude log', icon: '🙏' },
    { name: 'Reading', icon: '📖' },
    { name: 'Healthy breakfast', icon: '🥣' },
    { name: 'Vitamins/Supplements', icon: '💊' },
  ],
  afternoon: [
    { name: 'Power nap', icon: '💤' },
    { name: 'Green tea break', icon: '🍵' },
    { name: 'Stand-up desk', icon: '🖥️' },
    { name: 'Social connection', icon: '🤝' },
    { name: 'Creative work', icon: '🎨' },
    { name: 'Nature walk', icon: '🌿' },
    { name: 'Hydration check', icon: '🥤' },
    { name: 'Mindful snack', icon: '🍎' },
  ],
  evening: [
    { name: 'Screen-free hour', icon: '📵' },
    { name: 'Evening walk', icon: '🌆' },
    { name: 'Skincare routine', icon: '🧴' },
    { name: 'Meal prep', icon: '🍱' },
    { name: 'Light yoga', icon: '🧘‍♀️' },
    { name: 'Reflection writing', icon: '✍️' },
    { name: 'Herbal tea', icon: '☕' },
    { name: 'Plan tomorrow', icon: '📋' },
  ]
};

function renderCustom(root) {
  root.innerHTML = `
    <div class="container">
      <h1 class="text-3xl mb-4">Custom Routine Builder</h1>
      <p class="text-gray mb-8">Drag activities from the palette into your routine, or add your own.</p>

      <!-- Suggestion Palette -->
      <div class="custom-builder-section">
        <h3 class="custom-builder-heading">
          <span class="custom-builder-heading-icon">🎨</span>
          Activity Palette
          <span class="custom-builder-heading-sub">— drag tiles into a phase below</span>
        </h3>
        <div class="custom-palette-tabs">
          <button class="custom-palette-tab active" data-ptab="morning" onclick="window.switchPaletteTab('morning')">🌅 Morning</button>
          <button class="custom-palette-tab" data-ptab="afternoon" onclick="window.switchPaletteTab('afternoon')">☀️ Afternoon</button>
          <button class="custom-palette-tab" data-ptab="evening" onclick="window.switchPaletteTab('evening')">🌙 Evening</button>
        </div>
        <div class="custom-palette" id="custom-palette">
          <!-- Tiles rendered by JS -->
        </div>
      </div>

      <!-- Phase Drop Zones -->
      <div class="custom-dropzones-grid">
        <div class="custom-dropzone morning-zone" id="dropzone-morning"
             ondragover="window.customDragOver(event)" ondragleave="window.customDragLeave(event)" ondrop="window.customDrop(event,'morning')">
          <div class="custom-dropzone-header">
            <span class="custom-dropzone-icon">🌅</span>
            <h3>Morning Routine</h3>
          </div>
          <div class="custom-dropzone-body" id="dropbody-morning">
            <div class="custom-dropzone-empty">Drop activities here</div>
          </div>
        </div>
        <div class="custom-dropzone afternoon-zone" id="dropzone-afternoon"
             ondragover="window.customDragOver(event)" ondragleave="window.customDragLeave(event)" ondrop="window.customDrop(event,'afternoon')">
          <div class="custom-dropzone-header">
            <span class="custom-dropzone-icon">☀️</span>
            <h3>Afternoon Routine</h3>
          </div>
          <div class="custom-dropzone-body" id="dropbody-afternoon">
            <div class="custom-dropzone-empty">Drop activities here</div>
          </div>
        </div>
        <div class="custom-dropzone evening-zone" id="dropzone-evening"
             ondragover="window.customDragOver(event)" ondragleave="window.customDragLeave(event)" ondrop="window.customDrop(event,'evening')">
          <div class="custom-dropzone-header">
            <span class="custom-dropzone-icon">🌙</span>
            <h3>Evening Routine</h3>
          </div>
          <div class="custom-dropzone-body" id="dropbody-evening">
            <div class="custom-dropzone-empty">Drop activities here</div>
          </div>
        </div>
      </div>

      <!-- Manual add fallback -->
      <div class="custom-manual-add">
        <h3 class="custom-builder-heading">
          <span class="custom-builder-heading-icon">✏️</span>
          Or Add Your Own
        </h3>
        <div class="custom-manual-row">
          <select id="custom-phase" class="custom-manual-select">
            <option value="morning">🌅 Morning</option>
            <option value="afternoon">☀️ Afternoon</option>
            <option value="evening">🌙 Evening</option>
          </select>
          <input type="text" id="custom-activity" class="custom-manual-input" placeholder="e.g. 10 minutes meditation" />
          <button class="btn-primary custom-manual-btn" onclick="window.saveCustomActivity()">+ Add</button>
        </div>
      </div>
    </div>
  `;

  window.switchPaletteTab('morning');
  window.loadCustomActivities();
}

window._currentPaletteTab = 'morning';

window.switchPaletteTab = function(phase) {
  window._currentPaletteTab = phase;
  document.querySelectorAll('.custom-palette-tab').forEach(t => {
    t.classList.toggle('active', t.getAttribute('data-ptab') === phase);
  });
  renderPaletteTiles(phase);
};

async function renderPaletteTiles(phase) {
  const palette = document.getElementById('custom-palette');
  if (!palette) return;
  // Get existing custom activities to grey-out already-added ones
  const { data: existing } = await dbGetCustomTrackers();
  const existingNames = (existing || []).filter(e => e.phase === phase).map(e => e.name.toLowerCase());

  const tiles = SUGGESTED_ACTIVITIES[phase] || [];
  palette.innerHTML = tiles.map(t => {
    const added = existingNames.includes(t.name.toLowerCase());
    return `<div class="custom-palette-tile ${added ? 'custom-palette-tile--added' : ''}"
                 draggable="${added ? 'false' : 'true'}"
                 ondragstart="window.paletteDragStart(event,'${phase}','${t.name.replace(/'/g, "\\'")}')"
                 ${!added ? `ondragend="this.classList.remove('dragging-card')"` : ''}>
              <span class="custom-palette-tile-icon">${t.icon}</span>
              <span class="custom-palette-tile-name">${t.name}</span>
              ${added ? '<span class="custom-palette-tile-badge">✓ Added</span>' : ''}
            </div>`;
  }).join('');
}

window.paletteDragStart = function(e, phase, name) {
  e.dataTransfer.setData('text/plain', name);
  e.dataTransfer.setData('palette-phase', phase);
  e.dataTransfer.setData('source', 'palette');
  e.target.classList.add('dragging-card');
};

window.customDragOver = function(e) {
  e.preventDefault();
  e.currentTarget.classList.add('custom-dropzone--active');
};

window.customDragLeave = function(e) {
  e.currentTarget.classList.remove('custom-dropzone--active');
};

window.customDrop = async function(e, targetPhase) {
  e.preventDefault();
  e.currentTarget.classList.remove('custom-dropzone--active');

  const source = e.dataTransfer.getData('source');
  const name = e.dataTransfer.getData('text/plain');
  if (!name) return;

  // Check if already exists
  const { data: existing } = await dbGetCustomTrackers();
  const alreadyExists = (existing || []).some(c => c.phase === targetPhase && c.name.toLowerCase() === name.toLowerCase());
  if (alreadyExists) {
    showToast('Activity already in this phase.', 'warning');
    return;
  }

  try {
    const { error } = await dbInsertCustomTracker(targetPhase, name);
    if (error) throw error;
    showToast(`✅ "${name}" added to ${targetPhase}!`, 'success');
    window.loadCustomActivities();
    renderPaletteTiles(window._currentPaletteTab);
  } catch (err) {
    showToast(err.message || String(err), 'error');
  }
};

window.loadCustomActivities = async function() {
  const phases = ['morning', 'afternoon', 'evening'];
  try {
    const { data, error } = await dbGetCustomTrackers();
    if (error) throw error;
    phases.forEach(phase => {
      const body = document.getElementById(`dropbody-${phase}`);
      if (!body) return;
      const items = (data || []).filter(i => i.phase === phase);
      if (items.length === 0) {
        body.innerHTML = '<div class="custom-dropzone-empty">Drop activities here</div>';
        return;
      }
      body.innerHTML = items.map(item => {
        const suggested = SUGGESTED_ACTIVITIES[phase]?.find(s => s.name.toLowerCase() === item.name.toLowerCase());
        const icon = suggested ? suggested.icon : '✨';
        return `<div class="custom-routine-tile" draggable="true">
                  <div class="custom-routine-tile-left">
                    <span class="custom-routine-tile-grip">⋮⋮</span>
                    <span class="custom-routine-tile-icon">${icon}</span>
                    <span class="custom-routine-tile-name">${item.name}</span>
                  </div>
                  <button class="custom-routine-tile-remove" onclick="window.deleteCustomActivity('${item.id}')" title="Remove">×</button>
                </div>`;
      }).join('');
    });
  } catch (err) {
    phases.forEach(phase => {
      const body = document.getElementById(`dropbody-${phase}`);
      if (body) body.innerHTML = `<p class="text-red" style="font-size:0.85rem;">Error loading: ${err.message || String(err)}</p>`;
    });
  }
};

window.deleteCustomActivity = async function(id) {
  try {
    const { error } = await dbDeleteCustomTracker(id);
    if (error) throw error;
    showToast('Activity removed.', 'success');
    window.loadCustomActivities();
    renderPaletteTiles(window._currentPaletteTab);
  } catch (err) {
    showToast('Failed to delete: ' + (err.message || String(err)), 'error');
  }
};

window.saveCustomActivity = async function() {
  const phase = document.getElementById('custom-phase').value;
  const name  = (document.getElementById('custom-activity').value || '').trim();
  if (!name) { showToast('Please enter an activity name.', 'error'); return; }
  try {
    const { error } = await dbInsertCustomTracker(phase, name);
    if (error) throw error;
    document.getElementById('custom-activity').value = '';
    showToast('Activity added!', 'success');
    window.loadCustomActivities();
    renderPaletteTiles(window._currentPaletteTab);
  } catch (err) {
    showToast(err.message || String(err), 'error');
  }
};

// ─── Samples Page — Celebrity Routines with Tile Feel ────────────────────────
const SAMPLE_ROUTINES = [
  {
    name: 'The Huberman Protocol',
    icon: '🧠',
    tagline: 'Neuroscience-optimised daily performance',
    color: 'morning',
    activities: [
      { icon: '🌤️', name: 'Morning Sunlight', desc: '10–30 min outdoor light within first hour' },
      { icon: '☕', name: 'Delay Caffeine', desc: '90–120 min after waking for cortisol alignment' },
      { icon: '🏃', name: 'Zone 2 Cardio', desc: '150–200 min per week of steady-state cardio' },
      { icon: '🧘', name: 'NSDR / Yoga Nidra', desc: '10–30 min non-sleep deep rest for recovery' },
      { icon: '📵', name: 'Evening Light Control', desc: 'Dim lights after sunset, avoid bright screens' },
    ]
  },
  {
    name: 'The Attia Longevity',
    icon: '🏋️',
    tagline: 'Medicine 3.0 — exercise & metabolic health',
    color: 'afternoon',
    activities: [
      { icon: '⏰', name: 'Fasting Window (16h)', desc: 'Time-restricted eating for metabolic flexibility' },
      { icon: '💪', name: 'Heavy Resistance Training', desc: '3–4x/week compound movements for lean mass' },
      { icon: '🥩', name: 'Protein Goal (1g/lb)', desc: 'Prioritize leucine-rich protein across meals' },
      { icon: '🧖', name: 'Sauna Protocol', desc: '4x/week at 180°F for cardiovascular benefits' },
      { icon: '📊', name: 'Biomarker Tracking', desc: 'Regular blood panels and metabolic checkups' },
    ]
  },
  {
    name: 'The Walker Sleep',
    icon: '😴',
    tagline: 'Why We Sleep — optimise rest & recovery',
    color: 'evening',
    activities: [
      { icon: '🕐', name: 'Consistent Bedtime', desc: 'Same sleep/wake time ±30 min, even weekends' },
      { icon: '❄️', name: 'Cold Room (65°F)', desc: 'Cool bedroom temperature triggers melatonin' },
      { icon: '☕', name: 'No Caffeine after 2PM', desc: 'Caffeine half-life is 5–6 hours' },
      { icon: '🚿', name: 'Hot Shower before Bed', desc: 'Core body temp drop after warm shower aids sleep' },
      { icon: '📱', name: 'Screen Curfew', desc: 'No screens 60 min before bed for better REM' },
    ]
  },
  {
    name: 'The Goggins Discipline',
    icon: '🔥',
    tagline: 'Mental toughness & physical excellence',
    color: 'morning',
    activities: [
      { icon: '⏰', name: '4:30 AM Wake-up', desc: 'Rise before the world to seize the day' },
      { icon: '🏃', name: 'Run / Cardio Session', desc: 'Daily high-intensity endurance training' },
      { icon: '📖', name: 'Study / Skill Building', desc: 'Dedicated time for mental growth' },
      { icon: '🧊', name: 'Cold Exposure', desc: 'Cold showers or ice baths for mental resilience' },
      { icon: '📓', name: 'Accountability Mirror', desc: 'Daily affirmations & honest self-assessment' },
    ]
  },
  {
    name: 'The Ferriss Efficiency',
    icon: '⚡',
    tagline: 'The 4-Hour Body & productivity hacks',
    color: 'afternoon',
    activities: [
      { icon: '🎯', name: '80/20 Focus', desc: 'Identify the 20% of tasks producing 80% of results' },
      { icon: '🧊', name: 'Morning Cold Exposure', desc: '30-second cold shower to boost metabolism' },
      { icon: '🥗', name: 'Slow-Carb Diet', desc: 'Protein + legumes, no white carbs 6 days/week' },
      { icon: '📝', name: 'Journaling (5-min)', desc: '5-minute journal for gratitude & focus' },
      { icon: '🧪', name: 'Self-Experimentation', desc: 'Track, measure, and optimise everything' },
    ]
  },
  {
    name: 'The Wim Hof Method',
    icon: '🧊',
    tagline: 'Breathwork, cold exposure & commitment',
    color: 'evening',
    activities: [
      { icon: '🫁', name: 'Breathing Rounds (3x)', desc: '30 power breaths + retention × 3 rounds' },
      { icon: '🧊', name: 'Cold Immersion', desc: '2–5 min cold bath or ice plunge' },
      { icon: '🧘', name: 'Meditation', desc: '15–20 min mindfulness or guided meditation' },
      { icon: '🏔️', name: 'Commitment Practice', desc: 'Push boundaries with gradual exposure training' },
      { icon: '🌿', name: 'Nature Connection', desc: 'Outdoor barefoot walking or grounding' },
    ]
  }
];

async function renderSamples(root) {
  // Pre-fetch existing custom trackers to show "Added" states
  const { data: existingCustom } = await dbGetCustomTrackers();
  const existingNames = (existingCustom || []).map(c => ({ phase: c.phase, name: c.name.toLowerCase() }));

  // Merge built-in and user-created samples
  const userSamples = getUserSamples();
  const allRoutines = [...SAMPLE_ROUTINES, ...userSamples];

  root.innerHTML = `
    <div class="container">
      <h1 class="text-3xl mb-4">Protocol Samples</h1>
      <p class="text-gray mb-8">Science-backed routines from experts, plus your own custom protocols.</p>

      <!-- Create new protocol button -->
      <div class="sample-create-banner">
        <div class="sample-create-banner-text">
          <span class="sample-create-banner-icon">✨</span>
          <div>
            <strong>Create Your Own Protocol</strong>
            <p>Design a custom routine with your own activities and share-ready format.</p>
          </div>
        </div>
        <button class="btn-primary sample-create-btn" onclick="window.openCreateSampleModal()">+ New Protocol</button>
      </div>

      ${userSamples.length > 0 ? `
      <h2 class="text-2xl mb-4" style="margin-top:2rem;">📌 My Protocols</h2>
      <div class="samples-grid mb-8" id="user-samples-grid">
        ${userSamples.map((r, i) => {
          const globalIdx = SAMPLE_ROUTINES.length + i;
          return buildSampleCard(r, globalIdx, existingNames, true);
        }).join('')}
      </div>
      ` : ''}

      <h2 class="text-2xl mb-4" ${userSamples.length > 0 ? '' : 'style="display:none;"'}>🔬 Expert Protocols</h2>
      <div class="samples-grid">
        ${SAMPLE_ROUTINES.map((r, idx) => buildSampleCard(r, idx, existingNames, false)).join('')}
      </div>
    </div>
  `;
}

function buildSampleCard(r, idx, existingNames, isUserCreated) {
  const alreadyAdded = r.activities.filter(a =>
    existingNames.some(e => e.name === a.name.toLowerCase())
  ).length;
  const allAdded = alreadyAdded === r.activities.length;

  return `
  <div class="sample-routine-card ${r.color}-tile ${isUserCreated ? 'sample-routine-card--user' : ''}" id="sample-card-${idx}">
    <div class="sample-routine-header">
      <span class="sample-routine-icon">${r.icon}</span>
      <div style="flex:1">
        <h3 class="sample-routine-title">${escapeHtml(r.name)}</h3>
        <p class="sample-routine-tagline">${escapeHtml(r.tagline)}</p>
      </div>
      ${isUserCreated ? `
        <button class="sample-card-delete-btn" onclick="window.deleteUserSample('${r.id}')" title="Delete this protocol">🗑️</button>
      ` : ''}
    </div>
    <div class="sample-routine-activities">
      ${r.activities.map(a => {
        const isAdded = existingNames.some(e => e.name === a.name.toLowerCase());
        return `
        <div class="sample-activity-tile ${isAdded ? 'sample-activity-tile--added' : ''}">
          <span class="sample-activity-icon">${a.icon}</span>
          <div class="sample-activity-info">
            <span class="sample-activity-name">${escapeHtml(a.name)}</span>
            <span class="sample-activity-desc">${escapeHtml(a.desc)}</span>
          </div>
          ${isAdded ? '<span class="sample-activity-badge">✓</span>' : ''}
        </div>`;
      }).join('')}
    </div>
    <div class="sample-use-section">
      <div class="sample-use-row">
        <label class="sample-phase-label" for="sample-phase-${idx}">Phase:</label>
        <select id="sample-phase-${idx}" class="sample-phase-select">
          <option value="morning" ${r.color === 'morning' ? 'selected' : ''}>🌅 Morning</option>
          <option value="afternoon" ${r.color === 'afternoon' ? 'selected' : ''}>☀️ Afternoon</option>
          <option value="evening" ${r.color === 'evening' ? 'selected' : ''}>🌙 Evening</option>
        </select>
      </div>
      <button class="sample-use-btn ${allAdded ? 'sample-use-btn--done' : ''}"
              id="sample-use-btn-${idx}"
              onclick="window.useProtocol(${idx})"
              ${allAdded ? 'disabled' : ''}>
        ${allAdded ? '✓ All Activities Added' : '🚀 Use This Protocol'}
      </button>
      ${allAdded ? '<a href="#custom" class="sample-view-link">→ View Custom Routines</a>' : ''}
    </div>
  </div>`;
}

// ─── Use Protocol — Bulk import sample activities as custom trackers ─────────
window.useProtocol = async function(routineIndex) {
  // Merge built-in and user samples to look up by index
  const allRoutines = [...SAMPLE_ROUTINES, ...getUserSamples()];
  const routine = allRoutines[routineIndex];
  if (!routine) return;

  const phaseSelect = document.getElementById(`sample-phase-${routineIndex}`);
  const targetPhase = phaseSelect ? phaseSelect.value : routine.color;
  const btn = document.getElementById(`sample-use-btn-${routineIndex}`);

  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Adding…';
    btn.classList.add('sample-use-btn--loading');
  }

  try {
    const { data: existing } = await dbGetCustomTrackers();
    const existingNames = (existing || []).map(c => c.name.toLowerCase());
    let addedCount = 0, skippedCount = 0;

    for (const activity of routine.activities) {
      if (existingNames.includes(activity.name.toLowerCase())) { skippedCount++; continue; }
      const { error } = await dbInsertCustomTracker(targetPhase, activity.name);
      if (error) { console.warn(`Failed to add "${activity.name}":`, error); continue; }
      addedCount++;
    }

    if (btn) {
      btn.classList.remove('sample-use-btn--loading');
      btn.classList.add('sample-use-btn--done');
      const phaseLabel = targetPhase.charAt(0).toUpperCase() + targetPhase.slice(1);
      btn.textContent = `✓ Added to ${phaseLabel}`;
      const card = document.getElementById(`sample-card-${routineIndex}`);
      const useSection = card?.querySelector('.sample-use-section');
      if (useSection && !useSection.querySelector('.sample-view-link')) {
        const link = document.createElement('a');
        link.href = '#custom'; link.className = 'sample-view-link'; link.textContent = '→ View Custom Routines';
        useSection.appendChild(link);
      }
    }

    if (addedCount > 0 && skippedCount > 0) {
      showToast(`✅ ${addedCount} activities from "${routine.name}" added to ${targetPhase}! (${skippedCount} already existed)`, 'success', 4000);
    } else if (addedCount > 0) {
      showToast(`✅ ${addedCount} activities from "${routine.name}" added to ${targetPhase}!`, 'success', 4000);
    } else {
      showToast(`All activities from "${routine.name}" were already in your custom trackers.`, 'warning', 3500);
      if (btn) btn.textContent = '✓ All Activities Added';
    }

    const card = document.getElementById(`sample-card-${routineIndex}`);
    if (card) {
      card.querySelectorAll('.sample-activity-tile').forEach(tile => {
        if (!tile.classList.contains('sample-activity-tile--added')) {
          tile.classList.add('sample-activity-tile--added');
          const badge = document.createElement('span'); badge.className = 'sample-activity-badge'; badge.textContent = '✓';
          tile.appendChild(badge);
        }
      });
    }
  } catch (err) {
    console.error('Use protocol error:', err);
    showToast('Failed to import protocol: ' + (err.message || String(err)), 'error');
    if (btn) { btn.disabled = false; btn.textContent = '🚀 Use This Protocol'; btn.classList.remove('sample-use-btn--loading', 'sample-use-btn--done'); }
  }
};

// ─── Create Custom Sample Modal ──────────────────────────────────────────────
const SAMPLE_ICONS = ['🧠','🏋️','😴','🔥','⚡','🧊','🌿','💪','🎯','🧘','📖','🫁','☀️','🌙','💡','❤️','🏃','🥗','📊','🔬'];

window.openCreateSampleModal = function() {
  const iconGrid = SAMPLE_ICONS.map(ic =>
    `<button type="button" class="cs-icon-btn" data-icon="${ic}" onclick="window._csSelectIcon(this,'${ic}')">${ic}</button>`
  ).join('');

  showModal('✨ Create Your Own Protocol', `
    <div class="cs-form">
      <div class="cs-row">
        <div class="cs-field" style="flex:2">
          <label class="cs-label">Protocol Name</label>
          <input type="text" id="cs-name" class="cs-input" placeholder="e.g. My Recovery Protocol" maxlength="60" />
        </div>
        <div class="cs-field" style="flex:1">
          <label class="cs-label">Phase</label>
          <select id="cs-color" class="cs-select">
            <option value="morning">🌅 Morning</option>
            <option value="afternoon">☀️ Afternoon</option>
            <option value="evening">🌙 Evening</option>
          </select>
        </div>
      </div>

      <div class="cs-field">
        <label class="cs-label">Icon</label>
        <div class="cs-icon-grid" id="cs-icon-grid">${iconGrid}</div>
        <input type="hidden" id="cs-icon" value="🧠" />
      </div>

      <div class="cs-field">
        <label class="cs-label">Tagline</label>
        <input type="text" id="cs-tagline" class="cs-input" placeholder="Short description of your protocol" maxlength="100" />
      </div>

      <div class="cs-field">
        <label class="cs-label">Activities <span style="font-weight:400;color:var(--muted-color)">(add 1–10)</span></label>
        <div id="cs-activities-list" class="cs-activities-list"></div>
        <div class="cs-add-activity-row">
          <input type="text" id="cs-act-icon" class="cs-input cs-act-icon-input" placeholder="🏃" maxlength="4" />
          <input type="text" id="cs-act-name" class="cs-input" style="flex:2" placeholder="Activity name" maxlength="60" />
          <input type="text" id="cs-act-desc" class="cs-input" style="flex:3" placeholder="Short description" maxlength="120" />
          <button type="button" class="btn-primary cs-add-act-btn" onclick="window._csAddActivity()">+</button>
        </div>
      </div>
    </div>
  `, `
    <span class="cs-act-count" id="cs-act-count">0 activities</span>
    <button class="btn-primary" onclick="window._csSaveProtocol()" style="min-width:140px;">💾 Save Protocol</button>
  `);

  // Select first icon by default
  const firstBtn = document.querySelector('.cs-icon-btn');
  if (firstBtn) firstBtn.classList.add('cs-icon-btn--active');

  // Store temp activities
  window._csActivities = [];
};

window._csSelectIcon = function(btn, icon) {
  document.querySelectorAll('.cs-icon-btn').forEach(b => b.classList.remove('cs-icon-btn--active'));
  btn.classList.add('cs-icon-btn--active');
  document.getElementById('cs-icon').value = icon;
};

window._csAddActivity = function() {
  if (window._csActivities.length >= 10) {
    showToast('Maximum 10 activities per protocol.', 'warning');
    return;
  }
  const icon = (document.getElementById('cs-act-icon')?.value || '').trim() || '✅';
  const name = (document.getElementById('cs-act-name')?.value || '').trim();
  const desc = (document.getElementById('cs-act-desc')?.value || '').trim();
  if (!name) { showToast('Activity name is required.', 'error'); return; }

  window._csActivities.push({ icon, name, desc: desc || name });

  // Clear inputs
  document.getElementById('cs-act-icon').value = '';
  document.getElementById('cs-act-name').value = '';
  document.getElementById('cs-act-desc').value = '';
  document.getElementById('cs-act-name').focus();

  // Re-render list
  _csRenderActivities();
};

window._csRemoveActivity = function(idx) {
  window._csActivities.splice(idx, 1);
  _csRenderActivities();
};

function _csRenderActivities() {
  const list = document.getElementById('cs-activities-list');
  const count = document.getElementById('cs-act-count');
  if (!list) return;

  if (window._csActivities.length === 0) {
    list.innerHTML = '<div class="cs-empty">No activities yet — add one below.</div>';
  } else {
    list.innerHTML = window._csActivities.map((a, i) => `
      <div class="cs-activity-item">
        <span class="cs-activity-item-icon">${a.icon}</span>
        <span class="cs-activity-item-name">${escapeHtml(a.name)}</span>
        <span class="cs-activity-item-desc">${escapeHtml(a.desc)}</span>
        <button type="button" class="cs-activity-item-remove" onclick="window._csRemoveActivity(${i})" title="Remove">×</button>
      </div>
    `).join('');
  }
  if (count) count.textContent = `${window._csActivities.length} activit${window._csActivities.length === 1 ? 'y' : 'ies'}`;
}

window._csSaveProtocol = function() {
  const name = (document.getElementById('cs-name')?.value || '').trim();
  const icon = document.getElementById('cs-icon')?.value || '🧠';
  const tagline = (document.getElementById('cs-tagline')?.value || '').trim();
  const color = document.getElementById('cs-color')?.value || 'morning';

  if (!name) { showToast('Please enter a protocol name.', 'error'); return; }
  if (window._csActivities.length === 0) { showToast('Add at least one activity.', 'error'); return; }

  const samples = getUserSamples();
  samples.push({
    id: 'us-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    name, icon, tagline: tagline || name, color,
    activities: [...window._csActivities],
    createdAt: Date.now()
  });
  saveUserSamples(samples);

  // Close modal and refresh page
  document.getElementById('rt-modal-overlay')?.remove();
  showToast(`✅ "${name}" protocol created!`, 'success');
  route(); // Re-render the samples page
};

window.deleteUserSample = function(sampleId) {
  const samples = getUserSamples().filter(s => s.id !== sampleId);
  saveUserSamples(samples);
  showToast('Protocol deleted.', 'success');
  route(); // Re-render
};

// ─── About Page ──────────────────────────────────────────────────────────────
function renderAbout(root) {
  root.innerHTML = `
    <div class="container">
      <h1 class="text-3xl mb-4">About Productivity Tracker</h1>
      <div class="tracker-tile">
        <p class="mb-4 text-lg">This application is built on the principles of neuroscience and human biology to optimise daily performance, focus, and sleep.</p>
        <p class="mb-4">Inspired by leading scientists and researchers, our protocols divide the day into three distinct phases:</p>
        <ul style="padding-left:1.5rem;margin-bottom:1.5rem;line-height:1.8;">
          <li><strong>Phase 1 (Morning):</strong> Focus on wakefulness, cortisol peaks, and bright light viewing.</li>
          <li><strong>Phase 2 (Afternoon):</strong> Focus on physical exertion, deep work, and active recovery (NSDR).</li>
          <li><strong>Phase 3 (Evening):</strong> Focus on temperature drops, light limitation, and preparing the brain for rest.</li>
        </ul>
        <p>Built as a static, lightning-fast application powered by Supabase.</p>
      </div>
    </div>
  `;
}

// ─── Contact Page ────────────────────────────────────────────────────────────
function renderContact(root) {
  root.innerHTML = `
    <div class="container">
      <h1 class="text-3xl mb-4">Contact</h1>
      <p class="text-gray mb-8">Have questions about the protocols or the application?</p>
      <div class="auth-box" style="max-width:600px;margin:0 auto;">
        <div id="contact-status" style="display:none" class="auth-status"></div>
        <div class="form-group">
          <label for="contact-name">Name</label>
          <input type="text" id="contact-name" placeholder="Your Name" />
        </div>
        <div class="form-group">
          <label for="contact-email">Email</label>
          <input type="email" id="contact-email" placeholder="you@example.com" />
        </div>
        <div class="form-group">
          <label for="contact-message">Message</label>
          <textarea id="contact-message" style="width:100%;padding:0.5rem;border:1px solid #d1d5db;border-radius:0.5rem;min-height:100px;font-family:inherit;" placeholder="How can we help?"></textarea>
        </div>
        <button class="btn-primary" style="width:100%" onclick="window.submitContact()">Send Message</button>
      </div>
    </div>
  `;
}

window.submitContact = async function() {
  const name    = (document.getElementById('contact-name')?.value  || '').trim();
  const email   = (document.getElementById('contact-email')?.value || '').trim();
  const message = (document.getElementById('contact-message')?.value || '').trim();
  if (!name || !email || !message) { showToast('Please fill out all fields.', 'error'); return; }
  try {
    const { error } = await dbInsertContactMessage(name, email, message);
    if (error) throw error;
    showToast('Message sent! We will get back to you soon.', 'success');
    document.getElementById('contact-name').value    = '';
    document.getElementById('contact-email').value   = '';
    document.getElementById('contact-message').value = '';
  } catch (err) {
    showToast(err.message || String(err), 'error');
  }
};

// ─── E2E Test Runner ─────────────────────────────────────────────────────────
function renderTestRunner(root) {
  if (!document.getElementById('test-runner-styles')) {
    const style = document.createElement('style');
    style.id = 'test-runner-styles';
    style.textContent = `
      .test-step-card { background:white; border-radius:1rem; padding:1.25rem 1.5rem; box-shadow:0 4px 10px rgba(0,0,0,.03); border:1px solid #f1f5f9; margin-bottom:0.75rem; transition:all .25s ease; }
      .test-step-card:hover { transform:translateY(-2px); box-shadow:0 10px 20px rgba(139,92,246,.06); }
      .badge { padding:.25rem .75rem; border-radius:9999px; font-size:.75rem; font-weight:600; text-transform:uppercase; letter-spacing:.05em; display:inline-flex; align-items:center; gap:.25rem; }
      .badge-pending { background:#f3f4f6; color:#4b5563; }
      .badge-running { background:#eff6ff; color:#2563eb; animation:pomo-pulse 1.5s infinite; }
      .badge-passed  { background:#ecfdf5; color:#059669; }
      .badge-failed  { background:#fef2f2; color:#dc2626; }
      @keyframes pomo-pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
      .test-log-line { margin-top:.25rem; font-family:Consolas,Monaco,monospace; font-size:.75rem; color:#4b5563; padding-left:.5rem; border-left:2px solid #ddd; }
    `;
    document.head.appendChild(style);
  }

  root.innerHTML = `
    <div class="container" style="max-width:800px;">
      <div style="text-align:center;margin-bottom:2rem;">
        <h1 style="font-size:2.5rem;font-weight:800;background:linear-gradient(135deg,#8b5cf6,#3b82f6);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:0.5rem;">E2E QA Test Runner</h1>
        <p style="color:#6b7280;font-size:1.1rem;">Programmatic Validation for Zen Security & Productivity Tracker</p>
      </div>
      <div class="tracker-tile" style="padding:2rem;border-radius:1.5rem;background:rgba(255,255,255,.85);backdrop-filter:blur(10px);box-shadow:0 10px 25px rgba(0,0,0,.05);margin-bottom:2rem;border:1.5px solid rgba(139,92,246,.15);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:1rem;">
          <h3 style="font-size:1.25rem;font-weight:700;color:#1f2937;">Test Progress</h3>
          <div id="test-progress-text" style="font-weight:600;color:#6b7280;font-size:.95rem;">0 / 6 Completed</div>
        </div>
        <div class="progress-bg" style="height:.75rem;margin-bottom:1.5rem;">
          <div id="test-progress-bar" class="progress-bar" style="width:0%;background:linear-gradient(to right,#8b5cf6,#3b82f6);"></div>
        </div>
        <div id="test-steps-list" style="display:flex;flex-direction:column;gap:.5rem;margin-bottom:1.5rem;"></div>
        <div style="display:flex;justify-content:center;gap:1rem;">
          <button id="run-tests-btn" class="btn-primary" style="padding:.75rem 2rem;font-size:1rem;border-radius:.75rem;cursor:pointer;">▶ Run Test Suite</button>
          <a href="#app" class="btn-secondary" style="padding:.75rem 2rem;font-size:1rem;border-radius:.75rem;text-decoration:none;text-align:center;">Go to App</a>
        </div>
      </div>
      <div id="test-console-card" class="tracker-tile hidden" style="padding:1.25rem;border-radius:1rem;background:#0f172a;color:#38bdf8;font-family:monospace;font-size:.85rem;max-height:250px;overflow-y:auto;">
        <div style="color:#94a3b8;border-bottom:1px solid #334155;padding-bottom:.5rem;margin-bottom:.5rem;font-weight:bold;display:flex;justify-content:space-between;">
          <span>CONSOLE LOGS</span>
          <span style="color:#64748b;font-size:.75rem;cursor:pointer;" onclick="document.getElementById('test-console-logs').innerHTML=''">Clear</span>
        </div>
        <div id="test-console-logs" style="line-height:1.6;white-space:pre-wrap;"></div>
      </div>
    </div>
  `;

  const steps = [
    { id:1, title:'Operational Status check',       desc:'Verify full operational status of both websites.' },
    { id:2, title:'Cross-Navigation validation',    desc:'Confirm cross-navigation links function correctly.' },
    { id:3, title:'Interactive & Movable elements', desc:'Validate draggable Pomodoro widget and card reordering.' },
    { id:4, title:'Header Link integrity',          desc:'Verify all tracker header links map to correct sections.' },
    { id:5, title:'New User Registration flow',     desc:'Simulate account creation and check authentication state.' },
    { id:6, title:'Anonymous Guest Sign-In',        desc:'Verify guest mode, disclaimer, and local storage.' }
  ];

  document.getElementById('test-steps-list').innerHTML = steps.map(s => `
    <div class="test-step-card" id="step-card-${s.id}">
      <div style="display:flex;flex-direction:column;gap:.25rem;flex:1;">
        <div style="font-weight:700;color:#1f2937;font-size:.95rem;display:flex;align-items:center;gap:.5rem;">
          <span style="background:#eef2ff;color:#4f46e5;border-radius:50%;width:1.5rem;height:1.5rem;display:inline-flex;align-items:center;justify-content:center;font-size:.75rem;">${s.id}</span>
          <span>${s.title}</span>
        </div>
        <div style="font-size:.825rem;color:#6b7280;padding-left:2rem;">${s.desc}</div>
        <div id="step-logs-${s.id}" style="padding-left:2rem;margin-top:.5rem;"></div>
      </div>
      <div><span class="badge badge-pending" id="step-badge-${s.id}">Pending ⏳</span></div>
    </div>`).join('');

  document.getElementById('run-tests-btn').onclick = () => executeE2ETests(steps);
}

async function executeE2ETests(steps) {
  const runBtn = document.getElementById('run-tests-btn');
  runBtn.disabled = true; runBtn.textContent = 'Running…';
  const consoleCard = document.getElementById('test-console-card');
  consoleCard.classList.remove('hidden');
  const consoleLogs = document.getElementById('test-console-logs');
  consoleLogs.innerHTML = '';

  const logC = msg => { consoleLogs.innerHTML += `[${new Date().toLocaleTimeString()}] ${msg}\n`; consoleCard.scrollTop = consoleCard.scrollHeight; };
  const setBadge = (id, status, text) => { const b = document.getElementById(`step-badge-${id}`); b.className = `badge badge-${status}`; b.textContent = text; };
  const addLog = (id, text, isErr = false) => {
    document.getElementById(`step-logs-${id}`).innerHTML +=
      `<div class="test-log-line" style="${isErr ? 'color:#ef4444;font-weight:500;' : 'color:#10b981;'}">${isErr ? '❌' : '✓'} ${text}</div>`;
  };

  let passed = 0;
  const total = steps.length;
  const updateProgress = () => {
    document.getElementById('test-progress-bar').style.width = `${Math.round(passed/total*100)}%`;
    document.getElementById('test-progress-text').textContent = `${passed} / ${total} Passed`;
  };

  for (let i = 1; i <= total; i++) { setBadge(i, 'pending', 'Pending ⏳'); document.getElementById(`step-logs-${i}`).innerHTML = ''; }
  updateProgress();

  const delay = ms => new Promise(r => setTimeout(r, ms));
  const prevUser = currentUser, prevToken = sessionToken;

  // Step 1: Operational Status
  try {
    setBadge(1, 'running', 'Running 🔄'); logC('Step 1: Operational Status'); await delay(400);
    const zenRes = await fetch('../zensecurity-main/index.html');
    if (zenRes.status !== 200) throw new Error(`Zen Security returned ${zenRes.status}`);
    addLog(1, 'Zen Security homepage operational (200 OK)');
    const trackerRes = await fetch('index.html');
    if (trackerRes.status !== 200) throw new Error(`Productivity Tracker returned ${trackerRes.status}`);
    addLog(1, 'Productivity Tracker operational (200 OK)');
    setBadge(1, 'passed', 'Passed ✅'); passed++; updateProgress();
  } catch (err) { setBadge(1, 'failed', 'Failed ❌'); addLog(1, err.message, true); logC(`Step 1 Failed: ${err.message}`); }

  // Step 2: Cross-Navigation
  try {
    setBadge(2, 'running', 'Running 🔄'); logC('Step 2: Cross-Navigation'); await delay(400);
    const zenNavLink = document.getElementById('zen-nav-link');
    if (!zenNavLink) throw new Error('Could not find #zen-nav-link');
    const href = zenNavLink.getAttribute('href');
    if (!href.includes('zensecurity-main')) throw new Error(`Zen Security nav link incorrect: "${href}"`);
    addLog(2, `Productivity Tracker → Zen Security link valid: "${href}"`);
    const zenHtml = await (await fetch('../zensecurity-main/index.html')).text();
    const doc2 = new DOMParser().parseFromString(zenHtml, 'text/html');
    const trackerLink = doc2.getElementById('nav-tracker-link') || doc2.querySelector('a[href*="Productivity_tracker"]');
    if (!trackerLink) throw new Error('No Productivity Tracker link in Zen Security page');
    addLog(2, `Zen Security → Productivity Tracker link valid: "${trackerLink.getAttribute('href')}"`);
    setBadge(2, 'passed', 'Passed ✅'); passed++; updateProgress();
  } catch (err) { setBadge(2, 'failed', 'Failed ❌'); addLog(2, err.message, true); logC(`Step 2 Failed: ${err.message}`); }

  // Step 3: Interactive elements
  try {
    setBadge(3, 'running', 'Running 🔄'); logC('Step 3: Interactive elements'); await delay(400);
    const pomo = document.getElementById('pomodoro-widget');
    if (!pomo) throw new Error('Pomodoro widget missing from DOM');
    addLog(3, 'Pomodoro widget found in DOM');
    if (!document.getElementById('pomodoro-handle')) throw new Error('Pomodoro drag handle missing');
    addLog(3, 'Pomodoro drag handle present');
    if (typeof triggerConfetti !== 'function') throw new Error('triggerConfetti not defined');
    addLog(3, 'Confetti function exists');
    if (typeof Element.prototype.animate !== 'function') throw new Error('Web Animations API not supported');
    addLog(3, 'Web Animations API supported');
    triggerConfetti();
    addLog(3, 'Confetti animation triggered successfully');
    setBadge(3, 'passed', 'Passed ✅'); passed++; updateProgress();
  } catch (err) { setBadge(3, 'failed', 'Failed ❌'); addLog(3, err.message, true); logC(`Step 3 Failed: ${err.message}`); }

  // Step 4: Header Link Integrity
  try {
    setBadge(4, 'running', 'Running 🔄'); logC('Step 4: Header links'); await delay(400);
    const links = Array.from(document.querySelectorAll('#nav-links .nav-lnk'));
    if (!links.length) throw new Error('No desktop navigation links found');
    const required = ['#app','#tracker','#custom','#samples','#summary','#about','#contact'];
    required.forEach(hash => {
      const found = links.find(l => l.getAttribute('href') === hash);
      if (!found) throw new Error(`Missing nav link for "${hash}"`);
      addLog(4, `Nav link "${hash}" verified`);
    });
    setBadge(4, 'passed', 'Passed ✅'); passed++; updateProgress();
  } catch (err) { setBadge(4, 'failed', 'Failed ❌'); addLog(4, err.message, true); logC(`Step 4 Failed: ${err.message}`); }

  // Step 5: Registration flow
  try {
    setBadge(5, 'running', 'Running 🔄'); logC('Step 5: Registration flow'); await delay(400);
    const ta = document.createElement('div'); ta.id = 'temp-auth-test'; ta.style.display = 'none'; document.body.appendChild(ta);
    renderLogin(ta);
    const toggle = ta.querySelector('#auth-toggle');
    if (!toggle) throw new Error('Auth toggle button not found');
    toggle.click();
    const title = ta.querySelector('#auth-title');
    if (!title || title.textContent !== 'Create Account') throw new Error(`Wrong title: "${title?.textContent}"`);
    addLog(5, 'Register mode toggle works correctly');
    const emailIn = ta.querySelector('#auth-email'), passIn = ta.querySelector('#auth-password'), passConf = ta.querySelector('#auth-password-confirm'), submitIn = ta.querySelector('#auth-submit');
    if (!emailIn || !passIn || !passConf || !submitIn) throw new Error('Register form fields missing');
    addLog(5, 'All register form fields present');
    document.body.removeChild(ta);
    setBadge(5, 'passed', 'Passed ✅'); passed++; updateProgress();
  } catch (err) {
    setBadge(5, 'failed', 'Failed ❌'); addLog(5, err.message, true); logC(`Step 5 Failed: ${err.message}`);
    document.getElementById('temp-auth-test')?.remove();
  }

  // Step 6: Anonymous Guest
  try {
    setBadge(6, 'running', 'Running 🔄'); logC('Step 6: Anonymous Guest'); await delay(400);
    const ta2 = document.createElement('div'); ta2.id = 'temp-anon-test'; ta2.style.display = 'none'; document.body.appendChild(ta2);
    renderLogin(ta2);
    const anonBtn = ta2.querySelector('#auth-anon');
    if (!anonBtn) throw new Error('Guest sign-in button missing');
    addLog(6, 'Guest sign-in button present');
    if (!ta2.innerHTML.includes('saved locally')) throw new Error('Disclaimer about local storage missing');
    addLog(6, 'Local storage disclaimer present');
    await signInAnonymously();
    if (!currentUser?.isAnonymous) throw new Error('Anonymous auth state not set');
    addLog(6, 'Anonymous user state set correctly');
    const testName = `QA-Test-${Date.now()}`;
    await dbInsertCustomTracker('morning', testName);
    const stored = localStorage.getItem(ANON_CUSTOM_KEY);
    if (!stored || !stored.includes(testName)) throw new Error('Guest data not persisted to localStorage');
    addLog(6, 'Guest data persisted to localStorage');
    const items = JSON.parse(stored);
    const item  = items.find(i => i.name === testName);
    if (item) { await dbDeleteCustomTracker(item.id); addLog(6, 'Test data cleaned up'); }
    document.body.removeChild(ta2);
    setBadge(6, 'passed', 'Passed ✅'); passed++; updateProgress();
  } catch (err) {
    setBadge(6, 'failed', 'Failed ❌'); addLog(6, err.message, true); logC(`Step 6 Failed: ${err.message}`);
    document.getElementById('temp-anon-test')?.remove();
  }

  // Cleanup
  logC('E2E Test Suite complete.');
  runBtn.disabled = false; runBtn.textContent = '▶ Re-run Test Suite';
  currentUser = prevUser; sessionToken = prevToken;
  if (currentUser && currentUser.isAnonymous) {
    sessionStorage.setItem('pt_anonymous_user', JSON.stringify(currentUser));
    sessionStorage.setItem('pt_anonymous_token', sessionToken);
  } else if (!currentUser) {
    sessionStorage.removeItem('pt_anonymous_user');
    sessionStorage.removeItem('pt_anonymous_token');
  }
  updateNav();

  if (passed === total) { logC('🎉 ALL TESTS PASSED!'); triggerConfetti(); await delay(300); triggerConfetti(); }
  else { logC(`⚠️ ${passed}/${total} tests passed.`); }
}

// ─── Custom Dropdown Component ──────────────────────────────────────────────
// Replaces native <select> dropdown panels with fully-styled custom menus
// Uses a MutationObserver to automatically enhance selects as they appear

class CustomDropdown {
  constructor(selectEl) {
    if (selectEl.dataset.csdEnhanced) return;
    selectEl.dataset.csdEnhanced = 'true';
    this.select = selectEl;

    // Create wrapper
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'csd-wrapper';

    // Trigger button
    this.trigger = document.createElement('button');
    this.trigger.type = 'button';
    this.trigger.className = 'csd-trigger';
    this.trigger.setAttribute('aria-haspopup', 'listbox');
    this.trigger.setAttribute('aria-expanded', 'false');

    // Text span
    this.triggerText = document.createElement('span');
    this.triggerText.className = 'csd-trigger-text';
    this.trigger.appendChild(this.triggerText);

    // Arrow
    const arrow = document.createElement('span');
    arrow.className = 'csd-arrow';
    arrow.innerHTML = '<svg width="12" height="8" viewBox="0 0 12 8" fill="none"><path d="M1.41 0L6 4.58L10.59 0L12 1.41L6 7.41L0 1.41L1.41 0Z" fill="currentColor"/></svg>';
    this.trigger.appendChild(arrow);

    // Options panel
    this.optionsPanel = document.createElement('div');
    this.optionsPanel.className = 'csd-options';
    this.optionsPanel.setAttribute('role', 'listbox');
    this.buildOptions();
    this.updateTriggerText();

    // Assemble DOM: insert wrapper before select, move select inside
    selectEl.parentNode.insertBefore(this.wrapper, selectEl);
    this.wrapper.appendChild(this.trigger);
    this.wrapper.appendChild(this.optionsPanel);
    this.wrapper.appendChild(selectEl);

    // Bind events
    this._onTriggerClick = (e) => { e.preventDefault(); e.stopPropagation(); this.toggle(); };
    this._onDocClick = (e) => { if (!this.wrapper.contains(e.target)) this.close(); };
    this._onKeydown = (e) => this._handleKeydown(e);

    this.trigger.addEventListener('click', this._onTriggerClick);
    document.addEventListener('click', this._onDocClick);
    this.trigger.addEventListener('keydown', this._onKeydown);

    // Listen for programmatic changes on native select
    this.select.addEventListener('change', () => {
      this.updateTriggerText();
      this.updateActiveOption();
    });
  }

  buildOptions() {
    this.optionsPanel.innerHTML = '';
    Array.from(this.select.options).forEach((opt, i) => {
      const div = document.createElement('div');
      div.className = 'csd-option';
      if (opt.selected && opt.value !== '') div.classList.add('csd-option--active');
      if (opt.value === '' || opt.textContent.startsWith('--')) div.classList.add('csd-option--placeholder');
      div.textContent = opt.textContent;
      div.setAttribute('role', 'option');
      div.setAttribute('data-value', opt.value);
      div.setAttribute('data-index', String(i));
      div.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.selectOption(i);
      });
      this.optionsPanel.appendChild(div);
    });
  }

  updateTriggerText() {
    const sel = this.select.options[this.select.selectedIndex];
    if (sel) {
      this.triggerText.textContent = sel.textContent;
      if (sel.value === '' || sel.textContent.startsWith('--')) {
        this.trigger.classList.add('csd-trigger--placeholder');
      } else {
        this.trigger.classList.remove('csd-trigger--placeholder');
      }
    }
  }

  updateActiveOption() {
    const opts = this.optionsPanel.querySelectorAll('.csd-option');
    opts.forEach((opt, i) => {
      const isActive = i === this.select.selectedIndex;
      opt.classList.toggle('csd-option--active', isActive && this.select.options[i]?.value !== '');
    });
  }

  selectOption(index) {
    this.select.selectedIndex = index;
    this.select.dispatchEvent(new Event('change', { bubbles: true }));
    this.updateTriggerText();
    this.updateActiveOption();
    this.close();
  }

  toggle() {
    const isOpen = this.wrapper.classList.contains('csd-open');
    // Close all other open dropdowns
    document.querySelectorAll('.csd-wrapper.csd-open').forEach(w => {
      if (w !== this.wrapper) w.classList.remove('csd-open');
    });
    if (!isOpen) {
      this.open();
    } else {
      this.close();
    }
  }

  open() {
    // Determine direction
    const rect = this.wrapper.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    this.optionsPanel.classList.toggle('csd-options--above', spaceBelow < 200);

    this.wrapper.classList.add('csd-open');
    this.trigger.setAttribute('aria-expanded', 'true');

    // Elevate parent activity-card so dropdown renders above sibling cards
    const parentCard = this.wrapper.closest('.activity-card');
    if (parentCard) parentCard.classList.add('csd-card-elevated');

    // Scroll active option into view
    requestAnimationFrame(() => {
      const active = this.optionsPanel.querySelector('.csd-option--active');
      if (active) active.scrollIntoView({ block: 'nearest' });
    });
  }

  close() {
    this.wrapper.classList.remove('csd-open');
    this.trigger.setAttribute('aria-expanded', 'false');

    // Remove elevation from parent activity-card
    const parentCard = this.wrapper.closest('.activity-card');
    if (parentCard) parentCard.classList.remove('csd-card-elevated');
  }

  _handleKeydown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.toggle();
    } else if (e.key === 'Escape') {
      this.close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      let next = this.select.selectedIndex + dir;
      if (next >= 0 && next < this.select.options.length) {
        this.selectOption(next);
      }
    }
  }

  destroy() {
    this.trigger.removeEventListener('click', this._onTriggerClick);
    document.removeEventListener('click', this._onDocClick);
    this.trigger.removeEventListener('keydown', this._onKeydown);
    // Restore native select
    if (this.wrapper.parentNode) {
      this.wrapper.parentNode.insertBefore(this.select, this.wrapper);
      this.wrapper.remove();
    }
    delete this.select.dataset.csdEnhanced;
  }
}

// Selector for all selects to enhance
const CSD_SELECTORS = [
  'select.rt-select',
  'select.custom-manual-select',
  'select.sample-phase-select',
  'select.summary-add-select',
  '.form-group select'
].join(', ');

function enhanceAllSelects(root) {
  const container = root || document;
  container.querySelectorAll(CSD_SELECTORS).forEach(sel => {
    if (!sel.dataset.csdEnhanced) {
      try { new CustomDropdown(sel); } catch (e) { console.warn('CSD enhance error:', e); }
    }
  });
}

// MutationObserver: auto-enhance selects as they appear in #root
(function initCustomDropdownObserver() {
  let debounceTimer = null;
  const observer = new MutationObserver((mutations) => {
    let hasNewNodes = false;
    for (const m of mutations) {
      if (m.addedNodes.length > 0) { hasNewNodes = true; break; }
    }
    if (!hasNewNodes) return;
    // Debounce to batch DOM updates
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => enhanceAllSelects(), 80);
  });
  // Start observing when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, { childList: true, subtree: true });
      enhanceAllSelects();
    });
  } else {
    observer.observe(document.body, { childList: true, subtree: true });
    enhanceAllSelects();
  }
})();
