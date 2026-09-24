/**
 * pi-clip — /clip: pick a recently-seen code block and put it on the system
 * clipboard, raw.
 *
 * Every assistant message is scanned for fenced ```code blocks```; each block
 * is pushed onto an in-memory ring buffer (newest first). `/clip` opens a picker
 * of those snippets — Enter copies the chosen one to the clipboard, clean (no
 * soft-wrap/indent/highlight artifacts you'd get from selecting in the TUI).
 *
 * No agent instruction needed: the agent already fences commands and SQL, so the
 * buffer fills itself. (/copy is owned by the harness, hence /clip.)
 *
 *   pi install npm:@grammeaway/pi-clip
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// ponytail: in-memory, resets on restart. Add session persistence (appendEntry)
// only if surviving restarts ever matters.
const buffer: string[] = [];
const CAP = 30;

// ponytail: first clipboard tool that runs wins — covers wayland/x11/mac/wsl.
// spawnSync tries each in turn; ENOENT just falls through to the next.
function copyToClipboard(text: string): string | null {
  const { spawnSync } = require("node:child_process");
  const candidates: [string, string[]][] = [
    ["wl-copy", []],
    ["pbcopy", []],
    ["xclip", ["-selection", "clipboard"]],
    ["xsel", ["--clipboard", "--input"]],
    ["clip.exe", []],
  ];
  for (const [cmd, args] of candidates) {
    // ponytail: stdout/stderr -> ignore, NOT pipe. wl-copy (and xclip) fork a
    // daemon that inherits the pipes; spawnSync would then block forever
    // waiting for EOF on pipes the daemon never closes.
    const r = spawnSync(cmd, args, { input: text, stdio: ["pipe", "ignore", "ignore"] });
    if (!r.error && r.status === 0) return cmd;
  }
  return null;
}

function textFromContent(content: any): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b) => b?.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

function codeBlocks(md: string): string[] {
  const blocks: string[] = [];
  const re = /```[^\n]*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md))) blocks.push(m[1].replace(/\n$/, ""));
  return blocks;
}

// Newest first, dedup (re-adding a snippet floats it to the top), capped.
function ringPush(text: string): void {
  if (!text) return;
  const i = buffer.indexOf(text);
  if (i >= 0) buffer.splice(i, 1);
  buffer.unshift(text);
  if (buffer.length > CAP) buffer.length = CAP;
}

function previewLabel(text: string, i: number): string {
  const lines = text.split("\n");
  const head = lines[0].trim().slice(0, 60);
  const more = lines.length > 1 ? ` (${lines.length} lines)` : "";
  return `${i + 1}. ${head}${more}`;
}

export default function clipExtension(pi: ExtensionAPI) {
  pi.on("message_end", (e: any) => {
    if (e?.message?.role !== "assistant") return;
    for (const b of codeBlocks(textFromContent(e.message.content))) ringPush(b);
  });

  // Other extensions (e.g. pi-first-prompt) can offer snippets: pi.events.emit("clip:snippet", text).
  pi.events.on("clip:snippet", (text) => typeof text === "string" && ringPush(text));

  pi.registerCommand("clip", {
    description: "Pick a recent code block and copy it to the system clipboard",
    handler: async (_args, ctx) => {
      if (buffer.length === 0) {
        ctx.ui.notify("Clip buffer empty — no code blocks captured yet.", "warning");
        return;
      }
      const options = buffer.map(previewLabel);
      const choice = await ctx.ui.select("Copy to clipboard", options);
      if (!choice) return;
      const payload = buffer[options.indexOf(choice)];

      const tool = copyToClipboard(payload);
      if (!tool) {
        ctx.ui.notify("No clipboard tool found (wl-copy/pbcopy/xclip/xsel/clip.exe).", "error");
        return;
      }
      ctx.ui.notify(`Copied via ${tool} — ${payload.length} chars.`, "info");
    },
  });
}

// ponytail: runnable self-check — `node --experimental-strip-types index.ts`
// exercises the parsers + buffer.
if ((import.meta as any).main) {
  const assert = (c: unknown, m: string) => {
    if (!c) throw new Error(m);
  };
  const md = "hi\n```bash\ncurl x\n```\nbye\n```\nplain\n```";
  const b = codeBlocks(md);
  assert(b.length === 2 && b[0] === "curl x" && b[1] === "plain", `blocks ${JSON.stringify(b)}`);
  assert(textFromContent([{ type: "text", text: "a" }, { type: "toolCall" }, { type: "text", text: "b" }]) === "a\nb", "textFromContent join");
  assert(textFromContent("raw") === "raw", "textFromContent string");

  buffer.length = 0;
  ringPush("one");
  ringPush("two");
  ringPush("one"); // re-add floats to top, no dup
  assert(buffer.length === 2 && buffer[0] === "one" && buffer[1] === "two", `ring ${JSON.stringify(buffer)}`);
  assert(previewLabel("curl x\nmore", 0) === "1. curl x (2 lines)", previewLabel("curl x\nmore", 0));
  console.log("ok");
}
