import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { generate } from "../src/calendar.ts";
import {
  validateCategoryProfiles,
  type CategoryProfile,
} from "../src/categories.ts";
import { fixture } from "./fixtures.ts";

const profile = JSON.parse(
  await readFile(
    new URL("../data/categories/tokorozawa.json", import.meta.url),
    "utf8",
  ),
) as CategoryProfile;

test("all nine categories produce separate same-day events, including categories collected together", () => {
  validateCategoryProfiles([profile]);
  const data = fixture();
  data.categories = { ...profile.categories };
  data.source.start = "2026-12-31";
  data.source.end = "2026-12-31";
  data.days = [
    { date: "2026-12-31", categories: Object.keys(profile.categories) },
  ];
  const output = generate([data]).replaceAll("\r\n ", "");
  const summaries = output.match(/SUMMARY:[^\r]+/g)?.sort();
  assert.deepEqual(
    summaries,
    [
      "SUMMARY:古着・古布",
      "SUMMARY:小型家電製品",
      "SUMMARY:びん・かん・スプレー缶",
      "SUMMARY:容器包装プラスチック",
      "SUMMARY:新聞・雑誌・雑がみ・段ボール",
      "SUMMARY:ペットボトル",
      "SUMMARY:燃やせるごみ",
      "SUMMARY:破砕ごみ類",
      "SUMMARY:有害ごみ",
    ].sort(),
  );
  assert.equal(output.match(/DTSTART;VALUE=DATE:20261231/g)?.length, 9);
  assert.equal(new Set(output.match(/UID:[^\r]+/g)).size, 9);
  const reversed = structuredClone(data);
  reversed.days[0]!.categories.reverse();
  assert.equal(generate([data]), generate([reversed]));
});

test("category metadata rejects missing labels, unsafe source URLs and conflicting municipality IDs", () => {
  assert.throws(() =>
    validateCategoryProfiles([{ ...profile, categories: { clothing: "" } }]),
  );
  assert.throws(() =>
    validateCategoryProfiles([
      { ...profile, sourceUrl: "javascript:alert(1)" },
    ]),
  );
  assert.throws(() => validateCategoryProfiles([profile, profile]));
});
