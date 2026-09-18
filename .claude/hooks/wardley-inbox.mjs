#!/usr/bin/env node
/**
 * `Stop` hook: hand the edits dropped by scripts/editor-server.ts back to Claude.
 *
 * Inbox empty, absent, or anything at all going wrong → exit 0, silent: a broken
 * hook must never wedge a session. Otherwise the batches are read, deleted
 * (consumed once), and replayed as `{"decision":"block","reason":"<prompt>"}`,
 * whose reason is fed to Claude as the next instruction.
 *
 * `stop_hook_active` guards the loop: we already relaunched the turn, so stop.
 *
 * Inbox: $WARDLEY_INBOX, else <project>/.claude/wardley-inbox.
 */

import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

/** Mirrors buildPrompt() in src/interactive/transport.ts. */
const buildPrompt = (ops, title) =>
  `Apply these ${ops.length} edit(s) I made in the interactive editor to ` +
  `${title ? `the Wardley map "${title}"` : "the Wardley map"} (diff ops, in order), ` +
  `then re-render it:\n\n\`\`\`json\n${JSON.stringify(ops, null, 2)}\n\`\`\`\n`;

const read = (stream) => new Promise((ok) => {
  let s = "";
  stream.setEncoding("utf-8").on("data", (c) => (s += c)).on("end", () => ok(s)).on("error", () => ok(""));
});

try {
  const input = JSON.parse((await read(process.stdin)) || "{}");
  if (input.stop_hook_active) process.exit(0);

  const inbox = process.env.WARDLEY_INBOX
    ?? join(process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd(), ".claude", "wardley-inbox");

  const files = readdirSync(inbox).filter((f) => f.endsWith(".json")).sort();
  if (files.length === 0) process.exit(0);

  const prompts = [];
  for (const f of files) {
    const path = join(inbox, f);
    try {
      const { title, ops } = JSON.parse(readFileSync(path, "utf-8"));
      if (Array.isArray(ops) && ops.length > 0) prompts.push(buildPrompt(ops, title));
    } catch { /* unreadable batch: drop it rather than replay it forever */ }
    rmSync(path, { force: true });
  }
  if (prompts.length === 0) process.exit(0);

  process.stdout.write(JSON.stringify({ decision: "block", reason: prompts.join("\n\n") }));
} catch {
  process.exit(0);
}
