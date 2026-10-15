import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { loadData } from "../src/site.ts";
import { fixture } from "./fixtures.ts";

// Synthetic schedule marked official only inside this test process.
function productionData() {
  const schedule = fixture();
  schedule.kind = "official";
  schedule.prefecture = { id: "saitama", name: "埼玉県" };
  schedule.municipality = { id: "tokorozawa", name: "所沢市" };
  const pending = {
    prefecture: schedule.prefecture,
    municipality: schedule.municipality,
    district: { id: "pending-test-district", name: "テスト確認地区" },
    sourceUrl: schedule.source.url,
    termsUrl: schedule.redistribution.termsUrl,
    checkedAt: "2026-10-15",
    reason: "Synthetic review metadata",
  };
  const profile = {
    municipality: schedule.municipality,
    sourceUrl: schedule.source.url,
    reviewedAt: "2026-10-15",
    categories: schedule.categories,
  };
  return { schedule, pending, profile };
}

async function loadSyntheticData(overrides: Record<string, unknown> = {}) {
  const root = await mkdtemp(join(tmpdir(), "gomiwake-scope-loader-"));
  try {
    await mkdir(join(root, "schedules"));
    await mkdir(join(root, "categories"));
    const { schedule, pending, profile } = productionData();
    for (const [file, value] of Object.entries({
      "schedules/test.json": schedule,
      "pending.json": [pending],
      "categories/test.json": profile,
      ...overrides,
    })) {
      if (value !== undefined)
        await writeFile(join(root, file), JSON.stringify(value));
    }
    return await loadData(pathToFileURL(`${root}/`));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("data loader accepts Tokorozawa schedules, pending districts and category profiles", async () => {
  const result = await loadSyntheticData();
  assert.deepEqual(
    [
      result.schedules.length,
      result.pending.length,
      result.categoryProfiles.length,
    ],
    [1, 1, 1],
  );
  assert.equal(result.schedules[0]!.district.id, "sample-district");
  assert.equal(result.pending[0]!.district.id, "pending-test-district");
  assert.equal(result.categoryProfiles[0]!.municipality.id, "tokorozawa");
});

for (const field of ["prefecture", "municipality"] as const) {
  test(`data loader rejects schedules outside the supported ${field}`, async () => {
    const { schedule } = productionData();
    schedule[field] = { id: "other-area", name: "テスト対象外" };
    await assert.rejects(
      loadSyntheticData({
        "schedules/test.json": schedule,
        "pending.json": [],
      }),
      /Only Saitama\/Tokorozawa data is supported/,
    );
  });

  test(`data loader rejects pending districts outside the supported ${field}`, async () => {
    const { pending } = productionData();
    pending[field] = { id: "other-area", name: "テスト対象外" };
    await assert.rejects(
      loadSyntheticData({
        "schedules/test.json": undefined,
        "pending.json": [pending],
      }),
      /Only Saitama\/Tokorozawa data is supported/,
    );
  });
}

test("data loader rejects category profiles for other municipalities", async () => {
  const { profile } = productionData();
  profile.municipality = { id: "other-city", name: "テスト対象外" };
  await assert.rejects(
    loadSyntheticData({ "categories/test.json": profile }),
    /Only Saitama\/Tokorozawa data is supported/,
  );
});

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
