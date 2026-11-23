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
3. Open **Authentication → Sign In / Providers → Email** and turn **off**
   "Confirm email", then save. Slotwise signs in with an email and password,
   so Supabase never needs to send you an email.
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

On the phone or in the browser, open **Settings → Sync between phone and web**,
enter your email and a password, and press **Create account** once. Everywhere
else, use the same email and password with **Sign in**. Sign in on the phone
first so the web app starts with your existing tasks.

Once your account exists, you can turn off **Allow new users to sign up**
(Authentication → Sign In / Providers) so nobody else can make an account on
your Supabase project.

## Running it locally

```sh
EXPO_PUBLIC_SUPABASE_URL=... EXPO_PUBLIC_SUPABASE_ANON_KEY=... npx expo start --web
# or build the image yourself
docker build -t slotwise-web \
  --build-arg EXPO_PUBLIC_SUPABASE_URL=... \
  --build-arg EXPO_PUBLIC_SUPABASE_ANON_KEY=... .
```
