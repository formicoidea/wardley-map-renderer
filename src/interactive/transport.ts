/**
 * "Send to Claude" transport cascade + clipboard/download helpers.
 *
 * Cascade: MCP Apps host (JSON-RPC `ui/initialize` → `ui/notifications/initialized`
 * → `ui/message`, spec 2026-01-26, github.com/modelcontextprotocol/ext-apps)
 * → optional POST endpoint → clipboard → "failed". Never throws, never mutates ops.
 *
 * @module interactive/transport
 */

import type { DiffOp } from "../diff-ops-apply.js";

export type SendResult = "host" | "endpoint" | "clipboard" | "failed";

/** Per-step wait for a host JSON-RPC response before falling through. */
export const HOST_TIMEOUT_MS = 1500;
const PROTOCOL_VERSION = "2026-01-26";

export function buildPrompt(ops: readonly DiffOp[], title?: string): string {
  const what = title ? `the Wardley map "${title}"` : "the Wardley map";
  return (
    `Apply these ${ops.length} edit(s) I made in the interactive editor to ${what} ` +
    "(diff ops, in order), then re-render it:\n\n```json\n" +
    JSON.stringify(ops, null, 2) +
    "\n```\n"
  );
}

let seq = 0;
/** Windows whose host already completed the MCP Apps handshake. */
const ready = new WeakSet<Window>();

/** JSON-RPC request to the parent; resolves the result, or undefined on error/timeout. */
function rpc(win: Window, method: string, params: unknown): Promise<Record<string, unknown> | undefined> {
  return new Promise((resolve) => {
    const id = `wardley-${++seq}`;
    const done = (v?: Record<string, unknown>) => {
      clearTimeout(timer);
      win.removeEventListener("message", onMessage);
      resolve(v);
    };
    const onMessage = (ev: MessageEvent) => {
      const d = ev.data;
      if (ev.source !== win.parent || !d || d.jsonrpc !== "2.0" || d.id !== id) return;
      done(d.error ? undefined : (d.result ?? {}));
    };
    const timer = setTimeout(done, HOST_TIMEOUT_MS);
    win.addEventListener("message", onMessage);
    try {
      win.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
    } catch {
      done();
    }
  });
}

async function sendToHost(win: Window, text: string): Promise<boolean> {
  if (!ready.has(win)) {
    const init = await rpc(win, "ui/initialize", {
      protocolVersion: PROTOCOL_VERSION,
      appInfo: { name: "wardley-map-editor", version: "1" },
      appCapabilities: {},
    });
    if (!init) return false;
    win.parent.postMessage({ jsonrpc: "2.0", method: "ui/notifications/initialized", params: {} }, "*");
    ready.add(win);
  }
  const res = await rpc(win, "ui/message", { role: "user", content: [{ type: "text", text }] });
  return !!res && !res.isError;
}

export async function sendToClaude(
  ops: readonly DiffOp[],
  opts: { title?: string; endpoint?: string; win?: Window } = {},
): Promise<SendResult> {
  const win = opts.win ?? (typeof window === "undefined" ? undefined : window);
  if (!win) return "failed";
  const text = buildPrompt(ops, opts.title);
  try {
    if (win.parent && win.parent !== win && (await sendToHost(win, text))) return "host";
  } catch { /* fall through */ }
  if (opts.endpoint) {
    try {
      const res = await win.fetch(opts.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: opts.title, ops }),
      });
      if (res.ok) return "endpoint";
    } catch { /* fall through */ }
  }
  return (await copyText(text, win)) ? "clipboard" : "failed";
}

export async function copyText(text: string, win?: Window): Promise<boolean> {
  const w = win ?? (typeof window === "undefined" ? undefined : window);
  if (!w) return false;
  try {
    await w.navigator.clipboard.writeText(text);
    return true;
  } catch { /* fallback below */ }
  try {
    const doc = w.document;
    const ta = doc.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    doc.body.append(ta);
    ta.select();
    const ok = doc.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export function downloadJSON(filename: string, data: unknown, doc: Document = document): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = doc.createElement("a");
  a.href = url;
  a.download = filename;
  doc.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
