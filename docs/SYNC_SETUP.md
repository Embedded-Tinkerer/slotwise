# Web app and phone sync (self-hosted)

Slotwise can run in a browser as well as on your phone. One small Docker
container on your own server (Unraid, a NAS, any Docker host) serves the web
app and keeps the phone and the browser in sync: tasks, projects, habits,
personal blocks and preferences. The phone also shares the calendar events it
reads from Google and Outlook, so the web app shows your full day without its
own calendar sign-in. No outside service is involved.

Things that stay on the phone: connecting Google/Outlook, Google Tasks import,
writing blocks back to your calendars, and reminders.

## 1. Make the image pullable

GitHub builds `ghcr.io/embedded-tinkerer/slotwise:latest` on every push
(**Actions → Server image**). New packages are private. Either make it public
(GitHub → your profile → **Packages → slotwise → Package settings → Change
visibility → Public**; the image contains no secrets), or log Docker in to
GHCR with a personal access token that has `read:packages`.

## 2. Add the container on Unraid

**Docker → Add Container**, then:

| Field | Value |
| --- | --- |
| Name | `slotwise` |
| Repository | `ghcr.io/embedded-tinkerer/slotwise:latest` |
| Network Type | `bridge` |
| Port | container `8080` → host `8088` (any free port) |
| Path | container `/data` → host `/mnt/user/appdata/slotwise` |
| Variable | `SLOTWISE_PASSWORD` = a long password of your choice |

Use **Add another Path, Port, Variable or Device** for each of the last three
rows. Apply, then open `http://<unraid-ip>:8088` in a browser.

All synced data lives in `/mnt/user/appdata/slotwise/slotwise.json`, so it is
covered by your usual appdata backups. The container runs as user `node`
(uid 1000); if it can't write there, run
`chown -R 1000:1000 /mnt/user/appdata/slotwise` once.

The container is its own web server, so no extra nginx host is needed at home.

## 3. Connect

- **Browser:** open the web app, go to **Settings → Sync between phone and
  web**, enter the password, press **Connect**.
- **Phone:** same place, enter the server address (`http://<unraid-ip>:8088`)
  and the password. Connect the phone first so the web app starts with your
  existing tasks.

## Away from home

At home the phone talks to the server over your Wi-Fi. When you are out it
simply syncs the next time it can reach the server; nothing is lost. To sync
from anywhere, either:

- use **Tailscale** (Unraid has a plugin) and put the Tailscale address in the
  phone, or
- add a reverse proxy host with HTTPS (Nginx Proxy Manager, SWAG, …) pointing
  at `<unraid-ip>:8088`, and use that `https://` address in the phone and
  browser. Use a strong password if you expose it to the internet.

## Updating

Use **Check for Updates** on the Unraid Docker tab after a new build, or let a
tool like Watchtower pull `:latest` for you.

## Running it locally

```sh
npx expo export -p web --output-dir dist
SLOTWISE_PASSWORD=test DATA_DIR=./data node server/server.mjs
# or
docker build -t slotwise . && docker run -p 8088:8080 -e SLOTWISE_PASSWORD=test -v $PWD/data:/data slotwise
```
