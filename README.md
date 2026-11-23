# Slotwise

A personal time and task planner for Android. You tell it what needs doing, how
long it takes, how important it is and when it's due. Slotwise fits the work
into the free time in your working hours, around your Google and Outlook
meetings, and re-plans automatically when something slips.

## Features

- **Tasks** with duration, priority (ASAP, High, Medium, Low), deadline, a
  "don't start before" date, and an option to split into smaller blocks.
- **Auto-scheduling** into free time, highest priority first, then earliest
  deadline. ASAP work goes first, then hard deadlines.
- **Day, week and agenda views** with your meetings and planned task blocks,
  a "now / next" card, and actions on every block: done, need more time, pin to
  this time, move to tomorrow.
- **Projects** with a deadline and ordered steps: each step is scheduled after
  the one before it, and you see when the whole project will finish.
- **Plan a project with AI**: describe a project and its deadline, Gemini
  drafts ordered steps with time estimates, you edit them, and Slotwise
  schedules them and shows the project timeline. Works on existing projects
  too ("Add with AI" adds the missing steps). Attach PDFs, photos or text
  files and Gemini plans from them.
- **Recurring tasks and habits**: every day, weekdays, certain days, or
  "3 times a week" spread across the week, at a preferred time of day.
- **Work and personal hours**: each task, project or habit goes in one or the
  other.
- **Pinned tasks** stay at a fixed time; everything else flows around them.
- **Labels, search and filters** (work, personal, at risk, project, label).
- **Reminders** a few minutes before each task block.
- **Planned blocks on your calendars**: optionally adds task blocks to a
  "Slotwise" calendar in Google and/or Outlook so others see you as busy.
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

## Web app and sync

The same app runs in a browser and syncs with the phone through Supabase. A Docker image (`ghcr.io/embedded-tinkerer/slotwise-web`) is built on every push for self-hosting. See [docs/SYNC_SETUP.md](docs/SYNC_SETUP.md).
