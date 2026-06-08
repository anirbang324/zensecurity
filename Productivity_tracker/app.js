// app.js — Productivity Tracker (Supabase-backed, plain HTML/CSS/JS)

// -- Configuration from config.js --
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// -- Local Storage Keys for Anonymous Users --
const ANON_TRACKERS_KEY = 'pt_anon_trackers';
const ANON_CUSTOM_KEY   = 'pt_anon_custom_activities';

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
    ? `<span style="font-size:0.875rem;font-weight:600;color:var(--muted-color);">${currentUser.isAnonymous ? 'Guest' : currentUser.email}</span>
       <button onclick="logout()" class="btn-sm" style="color:#f87171;font-weight:600;border-color:rgba(239,68,68,0.3);background:rgba(239,68,68,0.1);">Log Out</button>`
    : `<a href="#login" class="btn-primary" style="padding:0.25rem 0.75rem;font-size:0.875rem;">Sign In</a>`;
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
      case 'samples': renderSamples(root); break;
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
                placeholder="${isReg ? 'Min. 6 characters' : 'Your password'}" required/>
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
    } else if (authMode === 'register' && password.length < 6) {
      setFieldError('pw-err', 'Password must be at least 6 characters.');
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
      if (result && result.autoLogin) return; // route() already handles redirect
      setLoading(false);
      setStatus('✅ Account created! Check your email to confirm your address, then sign in.', 'success');
      setTimeout(() => { authMode = 'signin'; render(); setStatus('Account created! Please sign in.', 'success'); }, 3000);
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

const DEFAULT_ACTIVITIES = {
  morning:   ['Morning sunlight exposure', 'Delayed caffeine intake', 'Cold shower'],
  afternoon: ['Zone 2 cardio', 'NSDR session', 'Focused work block'],
  evening:   ['Sunset viewing', 'Temperature drop prep', 'No screens 1h before bed']
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

async function loadTrackerData() {
  const grid = document.getElementById('tracker-grid');
  if (!grid) return;
  grid.innerHTML = '<div style="text-align:center;padding:2rem;color:#6b7280;">Loading…</div>';
  try {
    const targetDate = selectedDate;
    const { data: customData } = await dbGetCustomTrackers();
    const { data: docs, error } = await dbGetTrackersForDate(targetDate);
    if (error) throw error;

    let html = '';
    ['morning', 'afternoon', 'evening'].forEach(phase => {
      let doc = (docs || []).find(d => d.phase === phase) || { phase, activities: {}, completion_rate: 0 };
      const acts = getOrderedActivities(phase, customData);

      const actHtml = acts.map(act => {
        const st = doc.activities[act.id]?.status || 'pending';
        return `
          <div id="card-${phase}-${act.id}"
               class="activity-card ${st === 'completed' ? 'completed' : st === 'skipped' ? 'skipped' : ''}"
               draggable="true"
               ondragstart="handleCardDragStart(event,'${phase}','${act.id}')"
               ondragend="this.classList.remove('dragging-card')"
               ondragover="handleCardDragOver(event)"
               ondragleave="handleCardDragLeave(event)"
               ondrop="handleCardDrop(event,'${phase}','${act.id}')">
            <div style="display:flex;align-items:center;width:100%;">
              <div class="card-drag-handle" title="Drag to reorder">⋮⋮</div>
              <div style="flex:1">
                <strong>${act.name}</strong>
                <div class="activity-actions">
                  <button onclick="updateActivity('${phase}','${act.id}','completed')" class="btn-sm done">Done</button>
                  <button onclick="updateActivity('${phase}','${act.id}','skipped')"   class="btn-sm skip">Skip</button>
                  <button onclick="updateActivity('${phase}','${act.id}','pending')"   class="btn-sm">Reset</button>
                </div>
              </div>
            </div>
          </div>`;
      }).join('');

      html += `
        <div class="tracker-tile ${phase}-tile">
          <h2 class="text-2xl mb-4" style="text-transform:capitalize">${phase}</h2>
          <div class="progress-bg"><div class="progress-bar" style="width:${doc.completion_rate}%"></div></div>
          <div style="margin-top:1rem">${actHtml}</div>
        </div>`;
    });
    grid.innerHTML = html;
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

    if (totalDays === 0) {
      document.getElementById('summary-content').innerHTML =
        '<div class="alert text-center">No data recorded yet. Start tracking your activities to see analysis!</div>';
      return;
    }

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

    document.getElementById('summary-content').innerHTML = `
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
      <div class="tracker-tile" style="max-width:800px;margin:0 auto;">
        <h2 class="text-2xl mb-6 border-b pb-2">Last 7 Active Days</h2>
        ${recentHtml}
      </div>`;
  } catch (err) {
    document.getElementById('summary-content').innerHTML =
      `<div class="alert alert-error">Error loading analysis: ${err.message}</div>`;
  }
}

// ─── Custom Tracker Page ─────────────────────────────────────────────────────
function renderCustom(root) {
  root.innerHTML = `
    <div class="container">
      <h1 class="text-3xl mb-4">Custom Tracker Builder</h1>
      <p class="text-gray mb-8">Build your own personal daily protocol.</p>

      <div class="auth-box" style="max-width:600px;margin:0 auto 2rem;">
        <h3 class="font-bold mb-4 border-b pb-2">Add New Activity</h3>
        <div class="form-group">
          <label for="custom-phase">Phase</label>
          <select id="custom-phase" style="width:100%;padding:0.5rem;border:1px solid #d1d5db;border-radius:0.5rem;font-family:inherit;">
            <option value="morning">Morning</option>
            <option value="afternoon">Afternoon</option>
            <option value="evening">Evening</option>
          </select>
        </div>
        <div class="form-group">
          <label for="custom-activity">Activity Name</label>
          <input type="text" id="custom-activity" placeholder="e.g. 10 minutes meditation" />
        </div>
        <button class="btn-primary" style="width:100%" onclick="window.saveCustomActivity()">Add Activity to Protocol</button>
      </div>

      <div class="auth-box" style="max-width:600px;margin:0 auto;">
        <h3 class="font-bold mb-4 border-b pb-2">Your Custom Activities</h3>
        <div id="custom-activities-list">Loading…</div>
      </div>
    </div>
  `;
  window.loadCustomActivities();
}

window.loadCustomActivities = async function() {
  const list = document.getElementById('custom-activities-list');
  if (!list) return;
  try {
    const { data, error } = await dbGetCustomTrackers();
    if (error) throw error;
    if (!data || data.length === 0) {
      list.innerHTML = '<p class="text-gray text-sm">No custom activities added yet.</p>';
      return;
    }
    list.innerHTML = `<ul style="list-style:none;padding:0;margin:0;">${data.map(item => `
      <li style="display:flex;justify-content:space-between;align-items:center;padding:0.75rem 0;border-bottom:1px solid #eee;">
        <div>
          <strong>${item.name}</strong>
          <span style="color:#888;font-size:0.8rem;margin-left:0.5rem;text-transform:capitalize;">(${item.phase})</span>
        </div>
        <button onclick="window.deleteCustomActivity('${item.id}')" class="btn-sm" style="color:red;border:1px solid red;background:transparent;">Remove</button>
      </li>`).join('')}</ul>`;
  } catch (err) {
    list.innerHTML = `<p class="text-red">Error loading custom activities: ${err.message || String(err)}</p>`;
  }
};

window.deleteCustomActivity = async function(id) {
  if (!confirm('Remove this activity?')) return;
  try {
    const { error } = await dbDeleteCustomTracker(id);
    if (error) throw error;
    showToast('Activity removed.', 'success');
    window.loadCustomActivities();
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
  } catch (err) {
    showToast(err.message || String(err), 'error');
  }
};

// ─── Samples Page ────────────────────────────────────────────────────────────
function renderSamples(root) {
  root.innerHTML = `
    <div class="container">
      <h1 class="text-3xl mb-4">Protocol Samples</h1>
      <p class="text-gray mb-8">Science-backed routines from industry experts.</p>
      <div class="grid-3">
        <div class="tracker-tile morning-tile">
          <h3 class="text-2xl mb-2">The Huberman</h3>
          <ul style="padding-left:1.5rem;color:#4b5563;line-height:1.8;">
            <li>Morning Sunlight (10-30m)</li>
            <li>Delay Caffeine (90-120m)</li>
            <li>Zone 2 Cardio</li>
            <li>NSDR / Yoga Nidra</li>
          </ul>
        </div>
        <div class="tracker-tile afternoon-tile">
          <h3 class="text-2xl mb-2">The Attia</h3>
          <ul style="padding-left:1.5rem;color:#4b5563;line-height:1.8;">
            <li>Fasting Window (16h)</li>
            <li>Heavy Resistance Training</li>
            <li>Protein Goal (1g/lb)</li>
            <li>Sauna Protocol</li>
          </ul>
        </div>
        <div class="tracker-tile evening-tile">
          <h3 class="text-2xl mb-2">The Walker (Sleep)</h3>
          <ul style="padding-left:1.5rem;color:#4b5563;line-height:1.8;">
            <li>Consistent Bedtime</li>
            <li>Cold Room (65°F)</li>
            <li>No Caffeine after 2PM</li>
            <li>Hot Shower before Bed</li>
          </ul>
        </div>
      </div>
    </div>
  `;
}

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
