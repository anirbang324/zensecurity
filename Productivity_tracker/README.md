# 🧠 Productivity Tracker

A neuroscience-backed daily protocol tracker built as a **zero-build, static web application**. Track your morning, afternoon, and evening routines with full Supabase-powered sync for registered users, or use it instantly as a guest with local-storage-only data.

> Part of the [Zen Security](../zensecurity-main/index.html) project by **Trupti Shiralkar**.

---

## 🌟 Features

### 🔐 Dual Authentication System
- **Guest Mode (Anonymous)**: Instant access — no sign-up required. All data stored in `localStorage` only; nothing is sent to the server.
- **Registered Users**: Secure email + password auth via **Supabase Auth**, with full cloud-sync of tracker logs and custom activities.
- Toggle between Sign In and Register on a single auth page, with inline field validation, password visibility toggle, and clear error/success feedback.

### 📅 Three-Phase Daily Tracker
- **🌅 Morning** — Sunlight exposure, delayed caffeine, cold shower
- **☀️ Afternoon** — Zone 2 cardio, NSDR session, focused work block
- **🌙 Evening** — Sunset viewing, temperature prep, screen-free hour

Each phase has:
- **Per-activity status buttons**: Done / Skip / Reset
- **Live progress bar** with animated fill (bouncy cubic-bezier)
- **Drag-and-drop reordering** of activity cards (mouse & touch, persisted to `localStorage`)
- **Confetti celebration** when a phase hits 100% completion
- **Date picker** — track any past or future date, not just today
- **Auto-save** — all changes sync to Supabase (or `localStorage` for guests) immediately

### 📊 Progress Analytics (Summary Page)
- Total days tracked
- Overall consistency percentage across all tracked days
- Strongest phase (Morning / Afternoon / Evening) calculated from historical averages
- Per-day completion bar chart for the last 7 active days

### ✏️ Custom Tracker Builder
- Add custom activities to any phase (Morning / Afternoon / Evening)
- Activities persist to Supabase `custom_trackers` table (registered) or `localStorage` (guest)
- Remove individual activities on demand
- Custom activities appear inline in the Daily Tracker alongside default ones

### 📚 Protocol Samples
Pre-built science-backed sample protocols for inspiration:
- **The Huberman** — Sunlight, delayed caffeine, Zone 2, NSDR/Yoga Nidra
- **The Attia** — 16h fasting, heavy resistance training, protein goal, sauna
- **The Walker (Sleep)** — Consistent bedtime, cold room, no late caffeine, pre-bed shower

### ⏱️ Floating Pomodoro Timer
- Glassmorphic, draggable floating widget (mouse & touch)
- Modes: **Focus (25 min)**, **Short Break (5 min)**, **Long Break (15 min)**
- Start / Pause / Reset controls
- Browser toast notification on timer completion
- Position persisted to `localStorage` across sessions
- Accessible via the **⏱️ Focus** button in the navbar

### 🔔 Toast Notification System
- Colour-coded slide-in toasts: `success` (green), `error` (red), `warning` (amber)
- Auto-dismiss with smooth fade animation

### 🧪 Built-in E2E Test Runner (`#test`)
Navigate to `#test` to open the in-browser QA suite. Runs 6 automated tests:
1. Operational Status — verifies both sites return HTTP 200
2. Cross-Navigation — confirms bi-directional links between Zen Security and Productivity Tracker
3. Interactive Elements — validates Pomodoro widget, drag handles, and confetti function
4. Header Link Integrity — checks all 7 nav links are present and correct
5. Registration Flow — simulates auth form toggle and verifies all fields
6. Anonymous Guest Mode — tests guest sign-in, `localStorage` persistence, and data clean-up

### 📱 Responsive Design
- Sticky top navbar with hamburger menu on mobile
- Fluid CSS Grid layouts (`repeat(auto-fit, minmax(300px, 1fr))`)
- Accessible `aria-label`, `aria-expanded`, and `aria-live` attributes throughout

---

## 🛠 Tech Stack

This is a **fully static, no-build application**. There is no bundler, no framework, no npm install required.

| Layer | Technology |
|---|---|
| **HTML** | Semantic HTML5 — single `index.html` file |
| **CSS** | Vanilla CSS with CSS custom properties (`--accent-color`, `--bg-color`, etc.) |
| **JavaScript** | Vanilla ES2020+ (async/await, modules) — single `app.js` file |
| **Auth & Database** | [Supabase](https://supabase.com) (loaded via CDN UMD build) |
| **Fonts** | [Inter](https://fonts.google.com/specimen/Inter) from Google Fonts |
| **Local Dev Server** | `npx serve` (from root workspace `package.json`) |
| **Animations** | CSS transitions + Web Animations API (`element.animate()`) |

### Supabase Tables
| Table | Purpose |
|---|---|
| `trackers` | Stores daily phase logs per user: `user_id`, `date`, `phase`, `activities` (JSON), `completion_rate` |
| `custom_trackers` | Stores user-defined custom activities: `user_id`, `phase`, `name` |
| `contact_messages` | Stores contact form submissions: `name`, `email`, `message` |

---

## 📁 File Structure

```
Productivity_tracker/
├── index.html       # Shell HTML: nav, footer, Pomodoro widget, CDN scripts
├── app.js           # All application logic — routing, pages, auth, DB calls
├── styles.css       # All styles — layout, components, animations
├── config.js        # Supabase URL + anon key (fill in before use)
└── assets/
    └── favicon.svg  # App favicon
```

---

## 🚀 Quick Start

### 1. Configure Supabase

Edit [`config.js`](./config.js) with your project credentials:

```js
const SUPABASE_URL     = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';
```

Get these from: **Supabase Dashboard → Your Project → Settings → API**

### 2. Create Database Tables

Run the following SQL in your Supabase **SQL Editor**:

```sql
-- Daily tracker logs
create table trackers (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users not null,
  date             date not null,
  phase            text not null check (phase in ('morning','afternoon','evening')),
  activities       jsonb not null default '{}',
  completion_rate  numeric default 0,
  created_at       timestamptz default now()
);

-- Custom user-defined activities
create table custom_trackers (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid references auth.users not null,
  phase    text not null check (phase in ('morning','afternoon','evening')),
  name     text not null,
  created_at timestamptz default now()
);

-- Contact form messages
create table contact_messages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null,
  message    text not null,
  created_at timestamptz default now()
);

-- Enable Row Level Security (RLS)
alter table trackers        enable row level security;
alter table custom_trackers enable row level security;

-- RLS policies: users can only access their own data
create policy "Own trackers" on trackers        for all using (auth.uid() = user_id);
create policy "Own custom"   on custom_trackers for all using (auth.uid() = user_id);
```

### 3. Run Locally

From the **workspace root** (`zensecurity-main/`):

```bash
npx serve . -l 3000
```

Then open: **[http://localhost:3000/Productivity_tracker/](http://localhost:3000/Productivity_tracker/)**

> Or open `Productivity_tracker/index.html` directly in a browser (note: some Supabase auth callbacks require a real HTTP server).

---

## 🗺️ Page Routing

All routing is **hash-based** (`window.location.hash`), handled in `app.js`.

| Hash | Page |
|---|---|
| `#login` | Sign In / Register / Guest access |
| `#app` or `#tracker` | Daily Tracker (default) |
| `#summary` | Progress Analytics |
| `#custom` | Custom Tracker Builder |
| `#samples` | Protocol Samples |
| `#about` | About page |
| `#privacy` | Privacy Policy |
| `#contact` | Contact form |
| `#test` | Built-in E2E Test Runner |

---

## 🔒 Privacy

### Guest (Anonymous) Users
- No account or email required
- All data (`pt_anon_trackers`, `pt_anon_custom_activities`) stored in `localStorage` only
- Clearing browser data or signing out permanently erases all guest data
- Nothing is ever uploaded to the server

### Registered Users
- Email + password stored via Supabase Auth (bcrypt hashed)
- Daily logs and custom activities synced to Supabase database with Row Level Security enabled
- You can request full data deletion at any time

---

## 🎯 Default Activities

### Morning 🌅
- Morning sunlight exposure
- Delayed caffeine intake
- Cold shower

### Afternoon ☀️
- Zone 2 cardio
- NSDR session
- Focused work block

### Evening 🌙
- Sunset viewing
- Temperature drop prep
- No screens 1h before bed

All default activities can be **reordered via drag and drop**. Custom activities can be added per phase via the Custom Tracker page.

---

## 🌐 Deployment

This is a static site — deploy anywhere that serves files over HTTP.

### Netlify / Vercel / GitHub Pages
1. Push the repo to GitHub
2. Connect to Netlify or Vercel
3. Set the **publish directory** to `./` (root) or `Productivity_tracker/` depending on your setup
4. No build command needed

### Manual Upload
Upload the `Productivity_tracker/` folder contents to any web host. No server-side runtime required.

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'Add your feature'`)
4. Push and open a Pull Request

---

## 📝 License

MIT License — see the [LICENSE](../LICENSE) file for details.

---

## 🙏 Acknowledgments

- **Andrew Huberman** — Neuroscience protocols that inspired the tracking structure
- **Peter Attia** — Longevity and performance protocols in the Samples page
- **Matthew Walker** — Sleep science and the Walker sleep protocol

---

**Disclaimer**: This application is not affiliated with any of the researchers mentioned. It is an independent project inspired by publicly available science and podcast content.

**Health Notice**: This app provides general wellness information. Always consult a healthcare professional before making significant changes to your health routines.