# TwelfthMan Demo Videos

This directory builds two narrated, self-running recordings from the live TwelfthMan workbench.

## Outputs

- `final/twelfthman-hackathon-40s-final.mp4` is the 39.8-second hackathon insert. Each narration beat zooms into and highlights its live component, returns to the full workbench, then moves to the next stage: routing, input policy, local decision, local answer, scorecard, cloud review, redaction and compression, approval, Azure answer, and ledger accounting.
- `final/twelfthman-reference-walkthrough.mp4` is the 153.8-second complete walkthrough. It covers both runtimes, pre-generation routing, trust boundaries, sensitivity policy, local inference, failure integrity, redaction coverage and limitations, evidence compression, human approval, the bounded Azure contract, content-free accounting, offline queueing, renewed consent, and visible failure behavior.

Both videos are 1920x1080 H.264 MP4 files with normalized 48 kHz stereo AAC narration marked as the default English audio track. The recordings use synthetic test data only.

## Watch With Sound

Do not judge audio in the VS Code inline video preview. It may retain an older file buffer or open muted. Use one of these tested Windows paths from the repository root.

Open the dedicated browser player, click **Test speakers**, then click **Play from start with sound**:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\demo-output\play-videos.ps1
```

The command starts a loopback-only player at `http://127.0.0.1:4312`. It serves the videos with byte-range support so Edge can decode and seek normally. Stop it when finished with:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\demo-output\play-videos.ps1 -StopBrowserServer
```

Open the short or long file in the current Windows default Media Player:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\demo-output\play-videos.ps1 -Video Short
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\demo-output\play-videos.ps1 -Video Long
```

Force the classic Windows Media Player installed on this machine:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\demo-output\play-videos.ps1 -Video Short -WindowsMediaPlayer
```

If the **Test speakers** tone is silent, open Windows **Settings > System > Sound > Volume mixer** and confirm that the browser or Media Player is not muted and uses the intended output device. If the tone works but a video is silent, close every existing preview and reopen the new filenames above.

## Rebuild Both

Prerequisites:

- Foundry Local is running and the application reports `Foundry Local ready`.
- `.env.local` is configured and the application reports `Azure configured`.
- The signed-in identity can invoke the configured Azure model.
- Microsoft Edge, Node.js, and Windows PowerShell are available.

From the repository root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\demo-output\build.ps1
```

The script installs its isolated media dependencies, starts the production app on port 3001 when needed, records both live browser flows, synthesizes narration with the installed Windows voice, composes the MP4 files, and validates the outputs. A server that was already running is left untouched.

To use an existing app on another URL:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\demo-output\build.ps1 -BaseUrl http://127.0.0.1:3002
```

## Individual Commands

Run these inside `demo-output`:

```powershell
npm run capture:short
npm run capture:long
npm run compose
npm run validate
npm run watch
```

The browser checkpoints deliberately fail if the live product does not show the expected local route, cloud review, Azure answer, offline queue, or renewed review state. Scene intent is documented in `short/scenes.json` and `long/scenes.json`; narration is in `narration/`.