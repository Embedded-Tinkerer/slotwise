# Web app and phone sync

Slotwise can run in a browser as well as on your phone. Both sign in to the
same free Supabase project and keep tasks, projects, habits, personal blocks
and preferences in step. The phone also shares the calendar events it reads
from Google and Outlook, so the web app shows your full day without its own
calendar sign-in.

Things that stay on the phone: connecting Google/Outlook, Google Tasks import,
writing blocks back to your calendars, and reminders.

## 1. Create the Supabase project (5 minutes)

1. Go to <https://supabase.com>, sign up, and create a new project (free tier
   is plenty). Pick any name and a region near you.
2. Open **SQL Editor → New query**, paste the contents of
   [`supabase/schema.sql`](../supabase/schema.sql), and press **Run**.
3. Supabase only lets you edit email templates once you use your own email
   sender, so set that up first. With Gmail: turn on 2-Step Verification in
   your Google account, then create an app password at
   <https://myaccount.google.com/apppasswords>. In Supabase open
   **Authentication → Emails → SMTP Settings**, turn on custom SMTP and enter
   host `smtp.gmail.com`, port `465`, your Gmail address as username and
   sender email, sender name `Slotwise`, and the app password.

   Then open **Templates → Magic link or OTP** and set the body to something
   that includes the code, for example:

   ```html
   <h2>Your Slotwise code</h2>
   <p>Enter this code in Slotwise: <strong>{{ .Token }}</strong></p>
   ```

   Do the same for **Confirm sign up**. Without `{{ .Token }}` the email only
   has a link, and Slotwise signs in with the 6 digit code.
4. Open **Project Settings → API** (or **Connect**) and copy the
   **Project URL** and the **anon / publishable key**. The anon key is safe
   to ship in the app; row level security keeps your data private.

## 2. Add the GitHub secrets

In the repo, open **Settings → Secrets and variables → Actions → New
repository secret** and add:

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | the Project URL |
| `SUPABASE_ANON_KEY` | the anon key |

Then run both workflows again (**Actions → Android APK → Run workflow**, and
**Web image → Run workflow**), or push any commit. The new APK and the web
image will both have sync turned on.

## 3. Run the web app on Unraid

The **Web image** workflow publishes
`ghcr.io/embedded-tinkerer/slotwise-web:latest`.

GitHub makes new packages private. Either make it public (GitHub → your
profile → **Packages → slotwise-web → Package settings → Change visibility →
Public**; the image holds no secrets beyond the anon key), or log Unraid in to
GHCR with a personal access token that has `read:packages`.

In Unraid, **Docker → Add Container**:

| Field | Value |
| --- | --- |
| Name | `slotwise-web` |
| Repository | `ghcr.io/embedded-tinkerer/slotwise-web:latest` |
| Network Type | `bridge` |
| Port | container `80` → host `8088` (any free port) |

Apply, then open `http://<unraid-ip>:8088`.

The container has its own web server, so you do not need another nginx host
for use at home. Add a reverse proxy host (Nginx Proxy Manager, SWAG, etc.)
pointing at `<unraid-ip>:8088` only if you want to reach it from outside your
network; turn on HTTPS there.

To update, use **Check for Updates** on the Docker tab after a new build, or
let a tool like Watchtower pull `:latest` for you.

## 4. Sign in

On the phone and in the browser: **Settings → Sync between phone and web**,
enter your email, press **Email me a code**, and type the 6 digit code. Sign
in on the phone first so the web app starts with your existing tasks.

## Running it locally

```sh
EXPO_PUBLIC_SUPABASE_URL=... EXPO_PUBLIC_SUPABASE_ANON_KEY=... npx expo start --web
# or build the image yourself
docker build -t slotwise-web \
  --build-arg EXPO_PUBLIC_SUPABASE_URL=... \
  --build-arg EXPO_PUBLIC_SUPABASE_ANON_KEY=... .
```
