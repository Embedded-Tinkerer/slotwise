# Connecting Google Calendar and Outlook

Slotwise reads your calendars so it can schedule tasks around your meetings. It
only asks for **read-only** calendar access, signs in with OAuth + PKCE (no
client secret is stored in the app), and keeps tokens in Android's encrypted
secure storage on your phone. No server is involved: the phone talks to Google
and Microsoft directly.

You need to register the app once with each provider, then add the two client
IDs as GitHub secrets so the APK build includes them. About 15 minutes total.

---

## 1. Google Calendar (personal)

1. Go to <https://console.cloud.google.com/> and create a new project (top bar,
   project picker, **New project**). Name it `Slotwise`.
2. Enable the Calendar API: **APIs & Services → Library**, search for
   **Google Calendar API**, click **Enable**.
3. Set up the consent screen: **APIs & Services → OAuth consent screen**
   (shown as **Google Auth Platform**).
   - **Branding**: app name `Slotwise`, your email as support and developer
     contact.
   - **Audience**: choose **External**. Under **Test users**, add your own
     Gmail address.
   - **Data access**: add the scope
     `https://www.googleapis.com/auth/calendar.readonly` (optional, the app
     asks for it anyway).
4. Create the client: **Clients → Create client**.
   - **Application type: iOS** (yes, iOS, even though you are on Android; see
     the note below).
   - **Bundle ID**: `com.embeddedtinkerer.slotwise`
   - Click **Create** and copy the **Client ID**. It looks like
     `1234567890-abc123.apps.googleusercontent.com`.

> **Why the iOS client type?** Google's iOS client type lets a mobile app sign
> in with PKCE using the redirect `com.googleusercontent.apps.<id>:/oauthredirect`
> and no client secret. The Android client type would also need the APK's
> signing-certificate fingerprint and an extra opt-in for custom URI schemes.
> The iOS type is the simplest setup that works for this app.

> **Refresh tokens expire after 7 days while the app is in "Testing".** If you
> don't want to reconnect Google weekly, go to **Audience** and click
> **Publish app**. For personal use you don't need Google's verification; you
> will just see a "Google hasn't verified this app" screen once at sign-in.
> Click **Advanced → Go to Slotwise** to continue.

## 2. Outlook / Microsoft 365 (work)

1. Go to <https://entra.microsoft.com/> (or the Azure portal) and open
   **Applications → App registrations → New registration**.
2. Fill in:
   - **Name**: `Slotwise`
   - **Supported account types**: *Accounts in any organizational directory and
     personal Microsoft accounts*. This works for your work account and also
     lets you test with a personal Outlook.com account.
   - **Redirect URI**: platform **Public client/native (mobile & desktop)**,
     value `slotwise://auth`
3. Click **Register** and copy the **Application (client) ID** from the
   Overview page.
4. **API permissions → Add a permission → Microsoft Graph → Delegated
   permissions**, add `Calendars.Read`, `User.Read`, `offline_access`,
   `openid`, `profile`.

**If your work account blocks it.** Many companies don't let users consent to
third-party apps. If you see *"Need admin approval"* when connecting Outlook,
there are two ways around it:

- Ask your IT admin to grant consent for the app (they can do it from the link
  on that screen), or
- Register the app inside your company's tenant yourself, if you are allowed
  to, and set `MS_TENANT` (below) to your company's tenant ID.

If you don't have an Entra/Azure directory to register the app in, signing up
for a free Azure account with a personal Microsoft account creates one.

## 3. Add the IDs to GitHub

In the repo on GitHub: **Settings → Secrets and variables → Actions → New
repository secret**. Add:

| Secret | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | The Google client ID from step 1 |
| `MS_CLIENT_ID` | The Microsoft application (client) ID from step 2 |
| `MS_TENANT` | Optional. Leave unset to allow any account (`common`), or set `organizations` or your company's tenant ID |

Client IDs aren't secret, but keeping them out of the code lets you swap them
without a commit.

## 4. Build and install

1. On GitHub go to **Actions → Android APK → Run workflow** (it also runs on
   every push to `main`).
2. When it finishes (about 15 to 25 minutes), open the repo's **Releases**
   page on your phone while signed in to GitHub, and tap the newest
   `slotwise-<n>.apk`.
3. Android will ask to allow installs from your browser the first time. Allow
   it, then install. Later builds install over the top and keep your data.
4. Open Slotwise, go to **Calendars**, and tap **Connect Google Calendar** and
   **Connect Outlook**.

## Local development (optional)

Create a `.env` file in the repo root:

```
EXPO_PUBLIC_GOOGLE_CLIENT_ID=...apps.googleusercontent.com
EXPO_PUBLIC_MS_CLIENT_ID=...
```

Then run `npx expo run:android` with Android Studio installed and a phone
connected over USB (or an emulator). Sign-in needs this native build: it does
not work inside Expo Go, because Expo Go can't receive the app's own redirect
schemes.
