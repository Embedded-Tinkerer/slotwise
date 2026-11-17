# Slotwise

A personal time and task planner for Android. You tell it what needs doing, how
long it takes, how important it is and when it's due. Slotwise fits the work
into the free time in your working hours, around your Google and Outlook
meetings, and re-plans automatically when something slips.

## Features

- **Tasks** with duration, priority (ASAP, High, Medium, Low), deadline, a
  "don't start before" date, and an option to split into smaller blocks.
- **Auto-scheduling** into free time inside your working hours, highest
  priority first, then earliest deadline.
- **Re-planning**: the plan is always rebuilt from *now*, so a block you didn't
  finish rolls forward to the next free slot. Log a block as done and only the
  remaining time is scheduled.
- **Deadline warnings** when a task won't finish in time or doesn't fit in the
  planning window.
- **Calendar sync** (read-only) with Google Calendar and Outlook / Microsoft
  365. Free, declined and cancelled events don't block time.
- **Google Tasks**: open tasks are imported, shown on their due day and
  scheduled before it. Finishing one here ticks it off in Google.
- **Add with AI**: type or dictate a note and Gemini turns it into tasks and
  fixed blocks for you to review before adding.
- **Personal blocks** for fixed time that isn't on a synced calendar.
- Light and dark mode.

## Install on your phone

Every push to `main` builds an APK with GitHub Actions and publishes it on the
repo's **Releases** page. Open that page on your Android phone and tap the
`.apk` file. See [docs/OAUTH_SETUP.md](docs/OAUTH_SETUP.md) for the one-time
Google and Microsoft setup that calendar sync needs.

## Development

```bash
npm install
npm test            # scheduler unit tests
npm run typecheck
npx expo start      # UI preview (calendar sign-in needs a native build)
npx expo run:android
```

| Path | What it is |
| --- | --- |
| `src/scheduler.ts` | The scheduling algorithm (pure TypeScript, unit tested) |
| `src/store.tsx` | App state, persistence, auto-sync |
| `src/sync/auth.ts` | OAuth + PKCE sign-in and token refresh |
| `src/sync/calendars.ts` | Google Calendar and Microsoft Graph event fetching |
| `src/sync/googleTasks*.ts` | Google Tasks import and completion sync |
| `src/ai/` | Gemini prompt, schema and response validation |
| `src/screens/` | Plan, Tasks, task editor, Calendars & hours |
| `.github/workflows/android-apk.yml` | APK build and release |
