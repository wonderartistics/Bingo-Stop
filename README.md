# 🎯 Bingo Stop — Native Android App (built by GitHub)

This repo turns the Bingo Stop web game into a **real installable Android app (.apk)**, without you needing Android Studio or a Mac. A GitHub Actions workflow builds the APK automatically every time you push to `main`, and drops it in **Releases** and in the **Actions** run as a downloadable file.

Under the hood it uses [Capacitor](https://capacitorjs.com/) to wrap the existing offline web app (`www/`) into a native Android shell. The game logic, UI, and offline local-storage behavior are all unchanged — this just packages it as a proper app with an icon, a home-screen launcher, and no browser chrome.

## What's in this repo

```
bingo-stop-app/
├── www/                        # The actual game (HTML/CSS/JS) — same app as before
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js
├── capacitor.config.json       # Tells Capacitor to package www/ as the app
├── package.json                # Capacitor dependencies
├── .github/workflows/
│   └── build-android.yml       # Builds the APK automatically on GitHub's servers
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

2. **Go to the "Actions" tab** on your GitHub repo. A workflow called **Build Android APK** will start running automatically (it also runs on every future push, or you can click "Run workflow" any time).

3. **Wait for the green checkmark** (first run takes a few minutes — it's setting up Java, Node, and Android build tools on GitHub's machine).

4. **Get the APK** two ways:
   - **Releases tab** → open the latest `build-N` release → download `app-debug.apk`
   - or **Actions tab** → open the finished run → under "Artifacts" download `bingo-stop-debug-apk`

5. **Install it on an Android phone:**
   - Transfer the `.apk` file to the phone (email it to yourself, use a USB cable, Google Drive, etc.)
   - Tap the file to install. Android will warn about "unknown sources" the first time — that's normal for an app not published on the Play Store; allow it for this install.
   - Open **Bingo Stop** from the app drawer. It runs fully offline from then on, exactly like the web version, with its own launcher icon.

You never need to open Android Studio — GitHub's servers do the actual Android build for you.

## Updating the app later

Any time you edit files inside `www/` (the game itself) and push to `main`, the workflow re-runs and builds a fresh APK automatically. Just repeat step 4 to grab the new one.

## Running it as a website too

The `www/` folder is still a complete, standalone website — nothing about the app packaging changes that. You can still:
- Open `www/index.html` directly in a browser on a laptop/PC, or
- Enable **GitHub Pages** on this repo (Settings → Pages → deploy from the `www` folder) to get a shareable link people can open on any device's browser and "Add to Home Screen" without installing the APK at all.

## Building an iOS app (optional, needs a Mac)

Capacitor also supports iOS, but Apple requires building on macOS with Xcode — GitHub's free Android runners don't cover this. If you have access to a Mac:
```bash
npm install
npx cap add ios
npx cap copy ios
npx cap open ios
```
Then build and run from Xcode. (App Store distribution additionally requires a paid Apple Developer account — for personal/offline use, running it on your own device via Xcode is free.)

## Notes

- The debug APK from this workflow is fine for installing on your own devices or sharing directly with players. If you eventually want to publish to the Google Play Store, that requires generating a **signed release build** with your own keystore — a good next step once you're happy with the app, and something I can help set up when you're ready.
- All game data (player name, theme, results history) still lives only in the app's local storage on each device — nothing is synced or uploaded, matching the offline pass-and-play design.
