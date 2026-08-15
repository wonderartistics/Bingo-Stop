# 🎯 Bingo Stop — Native Android App (built by GitHub)

**Version 2026.BINGO.104.1**

This repo turns the Bingo Stop web game into a **real installable Android app (.apk)**, without you needing Android Studio or a Mac. A GitHub Actions workflow builds the APK automatically every time you push to `main`, and drops it in **Releases** and in the **Actions** run as a downloadable file.

Under the hood it uses [Capacitor](https://capacitorjs.com/) to wrap the existing offline web app (`www/`) into a native Android shell. The game logic, UI, and offline local-storage behavior are all unchanged in spirit — this just packages it as a proper app with a custom icon, a branded splash screen, and no browser chrome.

## What's new in this version

- **Free card arrangement**: numbers are no longer locked to a fixed column (1‑5 always in B, 6‑10 always in I, etc). Choose **Auto Shuffle** for a fully random layout across the whole 25‑cell grid every time, or **Manual Arrangement** to hand‑pick exactly which number goes in which cell before you start. You can re‑shuffle or re‑arrange mid‑game too, from the "Manual Shuffle"/"Manual Arrangement" card on the game screen.
- **Selectable board size**: choose 25 (quick/small groups), 50 (medium groups), or 75 (classic/large groups) numbers on the Setup screen.
- **Reworked "green line" behavior**: a BINGO letter lights up (green, cut) for **every** line completed anywhere on the board — any row, column, or diagonal — counted left to right, up to 5.
- **Auto‑win at 5 lines**: as soon as 5 lines are completed, the round is automatically recorded as a **WIN** and a celebration banner appears. You can still tap **"Actually, mark as LOSS"** on that banner to override the auto‑recorded result.
- **Flat, professional UI**: reworked the whole interface away from a heavy glass/gradient look to a cleaner, calmer, native‑app style — solid surfaces, crisp borders, one flat accent color per theme.
- **App icon**: a flat, modern icon (bingo card + completed diagonal line motif), no gradients, used for the Android launcher and the web/PWA icon.
- **Splash screen**: a ~3.5 second branded splash on launch, prominently crediting **Created by TAIMOOR HASSAN**. (Earlier builds had a native splash-screen plugin that covered this up — it's been removed so the credit reliably shows every launch.)
- **App version**: `2026.BINGO.104.1`, shown on the splash screen and the Setup screen footer, and set as the native Android `versionName`.

## What's in this repo

```
bingo-stop-app/
├── www/                        # The actual game (HTML/CSS/JS)
│   ├── index.html
│   ├── css/style.css
│   ├── js/app.js
│   └── icons/                  # Web/PWA icons (favicon, 192/512, maskable, apple-touch)
├── resources/                  # Source art for the native app icon & splash screen
│   ├── icon.png                 # 1024×1024 legacy/flattened icon
│   ├── icon-foreground.png      # Android adaptive icon foreground layer
│   ├── icon-background.png      # Android adaptive icon background layer
│   └── splash.png / splash-dark.png   # 2732×2732 native splash art
├── capacitor.config.json       # Packaging + SplashScreen plugin config (3.5s duration)
├── package.json                # Capacitor + @capacitor/assets dependencies, app version
├── .github/workflows/
│   └── build-android.yml       # Builds the APK, generates icons/splash, sets version
└── android/                    # Generated automatically by the workflow (not committed)
```

## Step-by-step: get your APK

1. **Create a new GitHub repo** (public or private) and push everything in this folder to it:
   ```bash
   cd bingo-stop-app
   git init
   git add .
   git commit -m "Bingo Stop: initial app"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```

2. **Go to the "Actions" tab** on your GitHub repo. A workflow called **Build Android APK** will start running automatically (it also runs on every future push, or you can click "Run workflow" any time). It will add the Android platform, generate the app icon and splash screen from `resources/`, and stamp the app with version `2026.BINGO.104.1`.

3. **Wait for the green checkmark** (first run takes a few minutes — it's setting up Java, Node, and Android build tools on GitHub's machine).

4. **Get the APK** two ways:
   - **Releases tab** → open the latest `build-N` release → download `app-debug.apk`
   - or **Actions tab** → open the finished run → under "Artifacts" download `bingo-stop-debug-apk`

5. **Install it on an Android phone:**
   - Transfer the `.apk` file to the phone (email it to yourself, use a USB cable, Google Drive, etc.)
   - Tap the file to install. Android will warn about "unknown sources" the first time — that's normal for an app not published on the Play Store; allow it for this install.
   - Open **Bingo Stop** from the app drawer. You'll see the branded splash screen for a few seconds, then the app runs fully offline from then on, with its own launcher icon.

You never need to open Android Studio — GitHub's servers do the actual Android build for you.

## Updating the app later

Any time you edit files inside `www/` (the game itself) or the icon/splash art in `resources/`, and push to `main`, the workflow re-runs and builds a fresh APK automatically. Just repeat step 4 to grab the new one.

If you want to bump the version number for a future release, update the `APP_VERSION_NAME` / `APP_VERSION_CODE` values at the top of `.github/workflows/build-android.yml`, and the `APP_VERSION` constant near the top of `www/js/app.js`.

## Running it as a website too

The `www/` folder is still a complete, standalone website — nothing about the app packaging changes that. You can still:
- Open `www/index.html` directly in a browser on a laptop/PC, or
- Enable **GitHub Pages** on this repo (Settings → Pages → deploy from the `www` folder) to get a shareable link people can open on any device's browser and "Add to Home Screen" without installing the APK at all.

## Building an iOS app (optional, needs a Mac)

Capacitor also supports iOS, but Apple requires building on macOS with Xcode — GitHub's free Android runners don't cover this. If you have access to a Mac:
```bash
npm install
npx cap add ios
npx capacitor-assets generate --ios
npx cap copy ios
npx cap open ios
```
Then build and run from Xcode. (App Store distribution additionally requires a paid Apple Developer account — for personal/offline use, running it on your own device via Xcode is free.)

## Notes

- The debug APK from this workflow is fine for installing on your own devices or sharing directly with players. If you eventually want to publish to the Google Play Store, that requires generating a **signed release build** with your own keystore — a good next step once you're happy with the app, and something I can help set up when you're ready.
- All game data (player name, theme, board size, results history) still lives only in the app's local storage on each device — nothing is synced or uploaded, matching the offline pass-and-play design.
- The "Mark as LOSS" override on an auto-win only changes that one round's saved result; it doesn't affect earlier rounds already in history.

