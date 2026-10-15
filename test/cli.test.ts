import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("CLI validates the production dataset without publishing schedules and rejects bad commands", () => {
  const run = (command: string) =>
    spawnSync(process.execPath, ["src/cli.ts", command], { encoding: "utf8" });
  const result = run("validate");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /0 publishable/);
  assert.notEqual(run("unknown").status, 0);
});
