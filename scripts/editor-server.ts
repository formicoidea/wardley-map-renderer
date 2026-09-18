/**
 * Dev server for the interactive editor: serves the map as an editable page and
 * catches the edits its "Send" button POSTs back.
 *
 *   pnpm run editor <map.json> [--port 4173] [--inbox .claude/wardley-inbox]
 *
 *   GET  /        the editor, map re-read from disk on every request
 *   POST /edits   { title, ops } → one <timestamp>.json in the inbox, 204
 *   GET  /health  200
 *
 * The inbox is drained by the `Stop` hook (.claude/hooks/wardley-inbox.mjs),
 * which hands the ops back to the Claude Code session. See README.
 *
 * node:http only, no new dependency, 127.0.0.1 only. Dev tool — not for the wild.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { invalidateInteractiveBundle, renderToHTML } from "../src/render-html.js";

/** Refuse bodies larger than this (the editor sends a few KB of ops). */
const MAX_BODY = 1024 * 1024;

export interface EditorServerOptions {
  /** Map JSON, re-read on every `GET /` so a reload shows the file's latest state. */
  readonly mapPath: string;
  /** Directory the received edits are written to (created on demand). */
  readonly inbox: string;
}

const send = (res: ServerResponse, status: number, type: string, body: string) =>
  res
    // Dev server: never let a browser serve a stale editor from its cache.
    .writeHead(status, { "content-type": type, "content-length": Buffer.byteLength(body), "cache-control": "no-store" })
    .end(body);

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((ok, fail) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      if ((size += c.length) > MAX_BODY) {
        fail(new Error("body too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => ok(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", fail);
  });
}

/** Write one received batch to the inbox; returns the file path. */
function drop(inbox: string, payload: { title?: string; ops: readonly unknown[] }): string {
  mkdirSync(inbox, { recursive: true });
  // ISO stamp sorts chronologically; the suffix keeps same-millisecond batches apart.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = join(inbox, `${stamp}-${Math.random().toString(36).slice(2, 6)}.json`);
  writeFileSync(file, JSON.stringify(payload, null, 2), "utf-8");
  return file;
}

export function createEditorServer({ mapPath, inbox }: EditorServerOptions): Server {
  return createServer(async (req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    try {
      if (req.method === "GET" && path === "/health") return send(res, 200, "text/plain", "ok");

      if (req.method === "GET" && path === "/") {
        // Dev server: a reload must show the editor code as it is on disk now.
        invalidateInteractiveBundle();
        const map = JSON.parse(readFileSync(mapPath, "utf-8"));
        const html = await renderToHTML(map, { interactive: true, editsEndpoint: "/edits" });
        return send(res, 200, "text/html; charset=utf-8", html);
      }

      if (req.method === "POST" && path === "/edits") {
        const { title, ops } = JSON.parse(await readBody(req)) as { title?: string; ops?: unknown };
        if (!Array.isArray(ops)) return send(res, 400, "text/plain", "expected { title?, ops: [] }");
        const file = drop(inbox, { title, ops });
        const shown = relative(process.cwd(), file);
        console.log(`[editor] ${ops.length} edit(s) received → ${shown.startsWith("..") ? file : shown}`);
        return void res.writeHead(204).end();
      }

      send(res, 404, "text/plain", "not found");
    } catch (err) {
      send(res, 500, "text/plain", (err as Error).message);
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let mapPath = "";
  let port = 4173;
  let inbox = ".claude/wardley-inbox";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port") port = Number(args[++i]);
    else if (args[i] === "--inbox") inbox = args[++i];
    else mapPath = args[i];
  }
  if (!mapPath) {
    console.error("usage: pnpm run editor <map.json> [--port 4173] [--inbox .claude/wardley-inbox]");
    process.exit(1);
  }
  createEditorServer({ mapPath: resolve(mapPath), inbox: resolve(inbox) }).listen(port, "127.0.0.1", () => {
    console.log(`[editor] http://127.0.0.1:${port}  —  ${mapPath}  →  inbox ${inbox}`);
  });
}
