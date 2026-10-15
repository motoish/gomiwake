import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

test("CLI validates the production dataset without writing output and rejects bad commands", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gomiwake-cli-"));
  const entry = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
  const run = (command: string) =>
    spawnSync(process.execPath, [entry, command], {
      cwd: directory,
      encoding: "utf8",
    });
  try {
    const result = run("validate");
    assert.equal(result.status, 0, result.stderr);
    assert.match(
      result.stdout,
      /^\d+ verified schedule files; \d+ publishable districts; \d+ pending areas\n$/,
    );
    const invalid = run("unknown");
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /Usage:/);
    assert.deepEqual(await readdir(directory, { recursive: true }), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
