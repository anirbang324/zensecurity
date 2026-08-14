# 📧 Setting Up Custom Email Authentication (Gmail SMTP + Supabase)

This guide walks you through configuring Gmail as your SMTP provider for Supabase so that email verification works when users register on the Productivity Tracker app.

---

## 🧠 Why This Is Needed

Supabase's **free tier (NANO plan)** has a built-in email service, but it has critical limitations:

- Emails can **only** be sent to verified members of your Supabase organization
- It is **not designed for external/real users**
- Even your first registration attempt from an external email will fail with:  
  > `Error sending confirmation email`

The fix is to configure a **Custom SMTP provider** — in this case, Gmail.

---

## ✅ Prerequisites

- A Gmail account (e.g., `axza2863@gmail.com`)
- 2-Step Verification enabled on your Google Account
- Access to your Supabase project dashboard

---

## Part 1 — Generate a Gmail App Password

> ⚠️ You must have **2-Step Verification** enabled on your Google Account before you can create App Passwords.

### Step 1.1 — Enable 2-Step Verification (if not already enabled)
1. Go to [https://myaccount.google.com/security](https://myaccount.google.com/security)
2. Under **"How you sign in to Google"**, click **2-Step Verification**
3. Follow the prompts to enable it

### Step 1.2 — Generate an App Password
1. Go to [https://myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
2. Sign in if prompted
3. In the **"App name"** field, type a name like `supabase`
4. Click **Create**
5. Google will display a **16-character password** like:
   ```
   ctxl rmzl bcqu vyzr
   ```
6. **Copy it immediately** — Google will never show this password again after you close the dialog
7. Click **Done**

> ⚠️ **Security Note:** Remove the spaces when entering the password into Supabase. The correct format is `ctxlrmzlbcquvyzr` (no spaces). Also, since this password grants full Gmail access, treat it like your main password — do not share it.

---

## Part 2 — Configure Supabase SMTP Settings

### Step 2.1 — Navigate to the SMTP Settings Page
1. Open your Supabase Dashboard: [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Click on your project (**anirbang324's Project**)
3. In the **left sidebar**, look for the **Authentication** section
4. Under **NOTIFICATIONS**, click **"Emails"**
5. Click the **"SMTP Settings"** tab at the top

Or navigate directly via URL:
```
https://supabase.com/dashboard/project/nkdxdpetluyzlavcgnfk/auth/smtp
```

### Step 2.2 — Enable Custom SMTP
Toggle **"Enable custom SMTP"** to **ON** (green)

### Step 2.3 — Fill in Sender Details

| Field | Value |
|---|---|
| **Sender email address** | `axza2863@gmail.com` |
| **Sender name** | `Productivity Tracker` |

### Step 2.4 — Fill in SMTP Provider Settings

| Field | Value |
|---|---|
| **Host** | `smtp.gmail.com` |
| **Port number** | `465` |
| **Minimum interval per user** | `60` (seconds) |
| **Username** | `axza2863@gmail.com` |
| **Password** | Your 16-char App Password **without spaces** (e.g., `ctxlrmzlbcquvyzr`) |

> ⚠️ **Common Mistake:** The **Username** field must be your Gmail address — NOT your Supabase project name. If it says something like `anirbang324's Project`, clear it and enter your Gmail address instead.

> ℹ️ **Yellow Warning:** Supabase may show a warning saying Gmail is designed for personal use. This is just a caution — Gmail SMTP will still work for sending verification emails.

### Step 2.5 — Save
Click the **"Save changes"** button at the bottom right.

---

## Part 3 — Verify It Works

1. Open the app: [http://localhost:3000/Productivity_tracker/#login](http://localhost:3000/Productivity_tracker/#login)
2. Click **"Don't have an account? Register"**
3. Enter any real email address and a password (min. 6 characters)
4. Click **"Create Account"**
5. You should see: ✅ `Account created! Check your email to confirm your address, then sign in.`
6. Check the inbox of the email you used — you'll receive a confirmation email from `axza2863@gmail.com`
7. Click the confirmation link in the email
8. Return to the app and **Sign In** with your credentials

---

## 🔒 Security Best Practices

- **Revoke the App Password** if you ever suspect it has been compromised:  
  [https://myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
- **Never commit** the App Password or Supabase keys to version control (GitHub, etc.)
- The `config.js` file contains your `SUPABASE_ANON_KEY` — add it to `.gitignore` if you plan to push to a public repo

---

## 🐛 Troubleshooting

| Error | Likely Cause | Fix |
|---|---|---|
| `Error sending confirmation email` | SMTP not configured / wrong credentials | Check Username and Password fields |
| `Invalid login credentials` | Wrong email/password at sign-in | Make sure you confirmed your email first |
| `User already registered` | Email already exists in Supabase | Use Sign In instead of Register |
| Email not received | Check spam folder | Also verify the App Password has no spaces |
| Gmail blocks the send | Less secure app access issue | App Passwords bypass this — no extra setup needed |

---

## 📋 Summary Checklist

- [ ] 2-Step Verification enabled on Google Account
- [ ] App Password generated from Google (16 chars, no spaces)
- [ ] Supabase → Authentication → Emails → SMTP Settings opened
- [ ] Custom SMTP toggled ON
- [ ] Sender email: `axza2863@gmail.com`
- [ ] Sender name: `Productivity Tracker`
- [ ] Host: `smtp.gmail.com`
- [ ] Port: `465`
- [ ] Username: `axza2863@gmail.com` *(not the project name)*
- [ ] Password: App Password without spaces
- [ ] Saved changes in Supabase
- [ ] Tested registration — confirmation email received ✅
