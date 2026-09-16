import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiffOp } from "../diff-ops-apply.js";
import { buildPrompt, copyText, downloadJSON, HOST_TIMEOUT_MS, sendToClaude } from "./transport.js";

const ops: DiffOp[] = [
  { op: "rename_component", payload: { id: "a", name: "B" } },
  { op: "delete_edge", payload: { id: "r1" } },
];

type Listener = (ev: { data: unknown; source: unknown }) => void;
interface FakeOpts {
  embedded?: boolean;
  /** Host reply per method: result object, "error", or undefined (silent). */
  host?: Record<string, unknown>;
  fetch?: (url: string, init: RequestInit) => Promise<{ ok: boolean }>;
  clipboard?: "ok" | "reject" | "missing";
  execCommand?: boolean;
}
function fakeWin(o: FakeOpts = {}) {
  const listeners = new Set<Listener>();
  const posted: any[] = [];
  const textareas: any[] = [];
  const win: any = {
    addEventListener: (_: string, f: Listener) => listeners.add(f),
    removeEventListener: (_: string, f: Listener) => listeners.delete(f),
    fetch: vi.fn(o.fetch ?? (async () => ({ ok: true }))),
    navigator: {
      clipboard: o.clipboard === "missing" ? undefined : {
        writeText: vi.fn(async () => { if (o.clipboard === "reject") throw new Error("denied"); }),
      },
    },
    document: {
      body: { append: (el: any) => textareas.push(el) },
      createElement: () => ({ style: {}, setAttribute() {}, select() {}, remove() {} }),
      execCommand: vi.fn(() => o.execCommand ?? false),
    },
  };
  const parent: any = {
    postMessage: vi.fn((msg: any) => {
      posted.push(msg);
      const reply = o.host?.[msg.method];
      if (msg.id === undefined || reply === undefined) return;
      const data = reply === "error"
        ? { jsonrpc: "2.0", id: msg.id, error: { code: -1, message: "no" } }
        : { jsonrpc: "2.0", id: msg.id, result: reply };
      queueMicrotask(() => {
        // Noise first: foreign source and wrong id are ignored.
        for (const f of [...listeners]) f({ data, source: {} });
        for (const f of [...listeners]) f({ data: { ...data, id: "other" }, source: parent });
        for (const f of [...listeners]) f({ data, source: parent });
      });
    }),
  };
  win.parent = o.embedded ? parent : win;
  return { win: win as Window, parent, posted, listeners, textareas };
}

describe("buildPrompt", () => {
  it("has an instruction line and fenced JSON of the ops", () => {
    const p = buildPrompt(ops, "Tea");
    expect(p.split("\n")[0]).toContain('"Tea"');
    const json = p.match(/```json\n([\s\S]*)\n```/)![1];
    expect(JSON.parse(json)).toEqual(ops);
    expect(buildPrompt([])).toContain("0 edit(s)");
  });
});

describe("sendToClaude", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("host: handshake then ui/message; handshake cached", async () => {
    const f = fakeWin({ embedded: true, host: { "ui/initialize": { protocolVersion: "2026-01-26" }, "ui/message": {} } });
    const frozen = Object.freeze(ops.map((x) => Object.freeze(x)));
    await expect(sendToClaude(frozen, { win: f.win, title: "Tea", endpoint: "http://x" })).resolves.toBe("host");
    expect(f.posted.map((m) => m.method)).toEqual(["ui/initialize", "ui/notifications/initialized", "ui/message"]);
    expect(f.posted[0].params).toMatchObject({ protocolVersion: "2026-01-26", appInfo: { name: expect.any(String) } });
    expect(f.posted[1].id).toBeUndefined();
    expect(f.posted[2]).toMatchObject({ jsonrpc: "2.0", params: { role: "user", content: [{ type: "text", text: buildPrompt(ops, "Tea") }] } });
    expect(f.parent.postMessage.mock.calls[0][1]).toBe("*");
    expect(f.win.fetch).not.toHaveBeenCalled();
    expect(f.listeners.size).toBe(0);

    await expect(sendToClaude(ops, { win: f.win })).resolves.toBe("host");
    expect(f.posted.map((m) => m.method).slice(3)).toEqual(["ui/message"]);
  });

  it("host silent: times out and falls through to the endpoint", async () => {
    const f = fakeWin({ embedded: true });
    const p = sendToClaude(ops, { win: f.win, title: "Tea", endpoint: "http://localhost:1/edits" });
    await vi.advanceTimersByTimeAsync(HOST_TIMEOUT_MS - 1);
    expect(f.win.fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(p).resolves.toBe("endpoint");
    expect(f.posted.map((m) => m.method)).toEqual(["ui/initialize"]);
    expect(f.listeners.size).toBe(0);
    const [url, init] = (f.win.fetch as any).mock.calls[0];
    expect(url).toBe("http://localhost:1/edits");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ title: "Tea", ops });
  });

  it("host initializes but message times out or errors: falls through", async () => {
    const f = fakeWin({ embedded: true, host: { "ui/initialize": {} }, clipboard: "ok" });
    const p = sendToClaude(ops, { win: f.win });
    await vi.advanceTimersByTimeAsync(HOST_TIMEOUT_MS);
    await expect(p).resolves.toBe("clipboard");

    for (const reply of ["error", { isError: true }]) {
      const g = fakeWin({ embedded: true, host: { "ui/initialize": {}, "ui/message": reply }, clipboard: "ok" });
      await expect(sendToClaude(ops, { win: g.win })).resolves.toBe("clipboard");
    }
  });

  it("host rejects initialize: no ui/message sent", async () => {
    const f = fakeWin({ embedded: true, host: { "ui/initialize": "error" }, clipboard: "ok" });
    await expect(sendToClaude(ops, { win: f.win })).resolves.toBe("clipboard");
    expect(f.posted.map((m) => m.method)).toEqual(["ui/initialize"]);
  });

  it("postMessage throwing falls through", async () => {
    const f = fakeWin({ embedded: true, clipboard: "ok" });
    f.parent.postMessage.mockImplementation(() => { throw new Error("detached"); });
    await expect(sendToClaude(ops, { win: f.win })).resolves.toBe("clipboard");
  });

  it("top-level window skips the host branch", async () => {
    const f = fakeWin({ clipboard: "ok" });
    await expect(sendToClaude(ops, { win: f.win, endpoint: "/e" })).resolves.toBe("endpoint");
    expect(f.posted).toHaveLength(0);
  });

  it("endpoint not ok or rejecting: clipboard with prompt", async () => {
    for (const fetch of [async () => ({ ok: false }), async () => { throw new Error("offline"); }]) {
      const f = fakeWin({ fetch, clipboard: "ok" });
      await expect(sendToClaude(ops, { win: f.win, endpoint: "/e", title: "Tea" })).resolves.toBe("clipboard");
      expect(f.win.navigator.clipboard.writeText).toHaveBeenCalledWith(buildPrompt(ops, "Tea"));
    }
  });

  it("no endpoint, clipboard fails, execCommand fails: failed", async () => {
    const f = fakeWin({ clipboard: "reject", execCommand: false });
    await expect(sendToClaude(ops, { win: f.win })).resolves.toBe("failed");
    expect(f.win.fetch).not.toHaveBeenCalled();
  });
});

describe("copyText", () => {
  it("uses the async clipboard", async () => {
    const f = fakeWin({ clipboard: "ok" });
    await expect(copyText("hi", f.win)).resolves.toBe(true);
    expect(f.win.document.execCommand).not.toHaveBeenCalled();
  });

  it("falls back to a hidden textarea + execCommand", async () => {
    for (const clipboard of ["reject", "missing"] as const) {
      const f = fakeWin({ clipboard, execCommand: true });
      await expect(copyText("hi", f.win)).resolves.toBe(true);
      expect(f.textareas[0].value).toBe("hi");
      expect(f.win.document.execCommand).toHaveBeenCalledWith("copy");
    }
  });

  it("never throws", async () => {
    const f = fakeWin({ clipboard: "missing" });
    (f.win as any).document = undefined;
    await expect(copyText("hi", f.win)).resolves.toBe(false);
  });
});

describe("downloadJSON", () => {
  it("clicks an a[download] with a JSON blob and revokes the URL", async () => {
    vi.useFakeTimers();
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:x");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const a: any = { click: vi.fn(), remove: vi.fn() };
    const doc: any = { createElement: vi.fn(() => a), body: { append: vi.fn() } };
    downloadJSON("map.json", { a: 1 }, doc);
    expect(doc.createElement).toHaveBeenCalledWith("a");
    expect(a).toMatchObject({ href: "blob:x", download: "map.json" });
    expect(a.click).toHaveBeenCalled();
    expect(a.remove).toHaveBeenCalled();
    const blob = create.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("application/json");
    expect(JSON.parse(await blob.text())).toEqual({ a: 1 });
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith("blob:x");
    create.mockRestore();
    revoke.mockRestore();
    vi.useRealTimers();
  });
});
