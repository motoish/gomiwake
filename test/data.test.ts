import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { loadData } from "../src/site.ts";
import { fixture } from "./fixtures.ts";

test("data loader rejects malformed JSON and fixtures in the production schedule directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "gomiwake-build-loader-"));
  try {
    await mkdir(join(root, "schedules"));
    await writeFile(join(root, "pending.json"), "[]");
    const file = join(root, "schedules", "invalid.json");
    await writeFile(file, "{ invalid json");
    await assert.rejects(
      loadData(pathToFileURL(`${root}/`)),
      /Invalid schedule JSON/,
    );
    await writeFile(file, JSON.stringify(fixture()));
    await assert.rejects(loadData(pathToFileURL(`${root}/`)), /Fixture/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
