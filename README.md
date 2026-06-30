# pi-clip

Disclaimer: Extension written fully by Pi itself.

A clipboard snippet picker for the
[pi](https://www.npmjs.com/package/@earendil-works/pi-coding-agent) coding agent.

Selecting text in the TUI copies the *rendered* output — soft-wrap line breaks,
indentation, highlight artifacts — so it pastes dirty. `pi-clip` pulls snippets
straight from the conversation instead, so they paste clean.

Every assistant message is scanned for fenced ` ```code blocks``` ` and each one
is pushed onto an in-memory ring buffer (newest first). `/clip` opens a picker of
those snippets; Enter copies the chosen one to the system clipboard, raw.

No agent instruction needed — the agent already fences commands and SQL, so the
buffer fills itself just by working.

## Install

```bash
pi install npm:@grammeaway/pi-clip
```

To try it without permanently installing:

```bash
pi -e npm:@grammeaway/pi-clip
```

## Usage

Run `/clip`, arrow to the snippet you want, press Enter. A notification confirms
which tool copied it and how many characters.

## Notes

- **Platform-agnostic clipboard.** Tries `wl-copy` (Wayland), `pbcopy` (macOS),
  `xclip` / `xsel` (X11), then `clip.exe` (Windows/WSL) — the first one that runs
  and succeeds wins. A missing or wrong-context tool falls through to the next.
  Requires at least one of them on `PATH`; if none exist, `/clip` reports it
  instead of failing silently.
- **Ring buffer** holds the 30 most recent blocks. Re-seeing an identical
  snippet floats it back to the top rather than duplicating it.
- **In-memory** — the buffer resets when the session restarts.
- The buffer is captured per code block, so multi-block messages give you each
  block as a separate, individually-pickable entry.
