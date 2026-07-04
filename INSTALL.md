# Installing FeedHacker in Chrome

FeedHacker is an unsigned developer build, so it installs through Chrome's
**Extensions** manager rather than the Web Store. Takes about a minute. The same
steps work in any Chromium browser (Chrome, Edge, Brave, Arc, Opera).

> **Windows shortcut:** double-click `installer\install.bat` to automate the
> build and set up daily auto-updates from GitHub — you only do the one-time
> "Load unpacked" click. See [installer/README.md](installer/README.md). The rest
> of this page is the manual walkthrough.

## 1. Get the extension folder

You need the built `feedhacker` folder (the one containing `manifest.json`).

**From the prebuilt zip:**
- Unzip `feedhacker-0.1.0.zip`. You'll get a `feedhacker/` folder.

**Or build it from source:**
```bash
npm install
npm run build
```
This produces `dist/feedhacker/` (the unpacked folder) and
`dist/feedhacker-0.1.0.zip`.

## 2. Open the Extensions manager

- Click the **puzzle-piece icon** 🧩 in the toolbar → **Manage extensions**, or
- Paste **`chrome://extensions`** into the address bar and press Enter, or
- Menu **⋮ → Extensions → Manage Extensions**.

## 3. Turn on Developer mode

Flip the **Developer mode** toggle in the **top-right** corner. A new row of
buttons appears (Load unpacked / Pack extension / Update).

## 4. Load the extension

Click **Load unpacked**, then select the **`feedhacker/`** folder from step 1
(select the folder itself — the one that contains `manifest.json`, not a file
inside it).

FeedHacker now appears in the list with its icon, name, and version.

> Tip: you can also **drag-and-drop the `.zip`** directly onto the
> `chrome://extensions` page instead of steps 3–4.

## 5. Pin it

Click the **puzzle-piece icon** 🧩 in the toolbar and click the **pin** next to
FeedHacker so its icon stays visible.

## 6. Use it

Open your **LinkedIn feed** (`https://www.linkedin.com/feed/`), click the
FeedHacker icon, and set your Mute/Solo filters. The toolbar badge shows how many
posts are hidden on the page. Open **Details & activity** in the popup for the
options page (custom filters, muted authors, insights, error log).

---

## Managing the extension

- **Pause without uninstalling:** toggle **Enabled** off in the FeedHacker popup.
- **Disable / re-enable:** `chrome://extensions` → the toggle on the FeedHacker card.
- **Update after a rebuild:** run `npm run build` again, then click the **↻ reload**
  icon on the FeedHacker card in `chrome://extensions`.
- **Uninstall:** `chrome://extensions` → FeedHacker → **Remove**, or right-click
  the toolbar icon → **Remove from Chrome**.

## Notes & troubleshooting

- **Permissions:** FeedHacker requests only `storage`. It runs solely on
  `www.linkedin.com`. The optional "remote banlist" feature (off by default) asks
  for access to one site only, when you enable it.
- **"Manifest version 2 is deprecated" or load errors:** make sure you selected
  the built folder that contains `manifest.json` (`dist/feedhacker/`), not the
  repo root — the source is TypeScript and must be compiled first (`npm run build`).
- **Nothing gets hidden:** confirm you're on the home feed, that **Enabled** is on,
  and that at least one filter is muted. If a LinkedIn markup change broke
  detection, the toolbar badge shows a red `!` and the popup lists the error.
- **It survives restarts** once loaded; Developer-mode extensions stay installed
  until you remove them.
