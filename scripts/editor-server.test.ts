/** Editor → Claude bridge: the dev server drops edits in the inbox, the Stop hook drains it. */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEditorServer } from "./editor-server.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HOOK = resolve(ROOT, ".claude/hooks/wardley-inbox.mjs");
const OPS = [{ op: "setComponentPosition", id: "tea", position: { evolution: { scalar: 0.6 } } }];

let dir: string;
let inbox: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "wardley-bridge-"));
  inbox = join(dir, "inbox");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("editor-server", () => {
  it("writes POSTed edits to the inbox and serves /health", async () => {
    const server = createEditorServer({ mapPath: join(dir, "map.json"), inbox });
    await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      expect((await fetch(`${base}/health`)).status).toBe(200);
      expect((await fetch(`${base}/nope`)).status).toBe(404);

      const res = await fetch(`${base}/edits`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Tea shop", ops: OPS }),
      });
      expect(res.status).toBe(204);

      const files = readdirSync(inbox);
      expect(files).toHaveLength(1);
      expect(JSON.parse(readFileSync(join(inbox, files[0]), "utf-8"))).toEqual({ title: "Tea shop", ops: OPS });
    } finally {
      await new Promise((ok) => server.close(ok));
    }
  });
});

/** Run the Stop hook with `inbox` as its inbox and the given hook input on stdin. */
function runHook(input: Record<string, unknown>) {
  return spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(input),
    encoding: "utf-8",
    env: { ...process.env, WARDLEY_INBOX: inbox },
  });
}

describe("wardley-inbox Stop hook", () => {
  it("blocks with the edit prompt and consumes the inbox", () => {
    mkdirSync(inbox, { recursive: true });
    writeFileSync(join(inbox, "2026-01-01.json"), JSON.stringify({ title: "Tea shop", ops: OPS }), "utf-8");

    const { status, stdout } = runHook({ hook_event_name: "Stop", stop_hook_active: false });
    expect(status).toBe(0);
    const out = JSON.parse(stdout);
    expect(out.decision).toBe("block");
    expect(out.reason).toContain('Apply these 1 edit(s) I made in the interactive editor to the Wardley map "Tea shop"');
    expect(out.reason).toContain("setComponentPosition");
    expect(readdirSync(inbox)).toEqual([]);
  });

  it("stays silent when the inbox is missing, and when stop_hook_active is set", () => {
    expect(runHook({ hook_event_name: "Stop" })).toMatchObject({ status: 0, stdout: "" });

    mkdirSync(inbox, { recursive: true });
    writeFileSync(join(inbox, "a.json"), JSON.stringify({ ops: OPS }), "utf-8");
    expect(runHook({ hook_event_name: "Stop", stop_hook_active: true })).toMatchObject({ status: 0, stdout: "" });
    expect(readdirSync(inbox)).toEqual(["a.json"]); // untouched: still there for the next real stop
  });
});
