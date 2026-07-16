# EVE on Railway — the away-from-home move

Goal: her brain leaves this PC and lives on the internet, so chat/voice/Ops work
from anywhere (not just your Wi-Fi) and nothing depends on a console window
staying open.

**Everything code-side is already done.** What follows is your part.

---

## Step 0 — one SQL paste (30 seconds, do this first)

Hosted filesystems get wiped on every deploy, which would silently lose your
push token and kill the 7:00 brief. Tokens move to Supabase:

1. EVE's Supabase dashboard → **SQL Editor** → New query
2. Paste all of `C:\dev\eve\brain\sql\002_push_tokens.sql` → **Run**

## Step 1 — Railway account + project (~5 min)

1. [railway.com](https://railway.com) → sign up (GitHub login is easiest)
2. **Upgrade to Hobby ($5/mo)** — the free trial *sleeps* services, and a
   sleeping brain misses your 7:00 brief. This is the one unavoidable cost.
3. **New Project** → **Deploy from GitHub repo** → pick the `eve` repo
   (see Step 2 if it doesn't exist yet)
4. Service **Settings → Root Directory** → set to **`brain`**
   (the repo holds both app and brain; Railway must build the brain only)

## Step 2 — get the code to GitHub (tell me and I'll do it)

The repo at `C:\dev\eve` is initialized but has **never been committed**. When
you're ready, say **"push to GitHub"** and I'll commit and push — I've already
verified `.gitignore` keeps every secret out (`.env`, service-account JSON,
keystores) while including her wardrobe so she has a closet in the cloud.

You'll need to either create an empty **private** repo named `eve` on GitHub
and give me the URL, or authorize the `gh` CLI so I can create it.

## Step 3 — environment variables (~5 min, the fiddly bit)

Railway service → **Variables** → **Raw Editor** → paste your entire
`C:\dev\eve\brain\.env` contents, then fix these three:

| Variable | Change |
|---|---|
| `PORT` | **delete it** — Railway injects its own |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | **delete it** — the file won't exist there |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | **add it** — see below |

For that last one, run this locally and paste the (long) output as the value:

```
node -e "console.log(require('fs').readFileSync('C:/dev/eve-secrets/eve-service-account.json','utf8'))"
```

(The brain now accepts the service account as raw JSON *or* base64 in that
variable — no file needed.)

## Step 4 — deploy + get her URL

Railway builds automatically. When it's green:

1. Service → **Settings → Networking → Generate Domain**
2. You'll get something like `eve-brain-production.up.railway.app`
3. Send me that URL — I'll rebuild the APK to point at it, install it, and
   verify chat + push from **cellular data with Wi-Fi off** (the real proof).

---

## What changes once she's hosted

- **Chat/voice/Ops work anywhere** — coffee shop, client site, car.
- **This PC becomes optional.** No console window, no sleep worries, no
  `start-eve-brain.bat`, no LAN IP.
- **Her crons run in the cloud** — the 7:00 brief fires whether your PC is on
  or in a drawer.
- **Cost:** $5/mo Railway + her existing API usage.

## Known trade-offs (honest)

- **Wardrobe uploads change.** Today: drop a PNG in the folder, live in 60s.
  Hosted: the closet ships with the deploy, so adding a look = drop the file
  in, then a redeploy (I can make this one command, or build a proper upload
  page later — a Railway volume + upload endpoint is the real fix).
- **Latency:** +50–150ms per call vs. localhost. Unnoticeable in chat.
- **Secrets live on Railway.** Same keys, someone else's disk. Standard for
  hosting; worth knowing.
