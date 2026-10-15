import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calendarPath,
  groupSchedules,
  validate,
  validatePending,
} from "../src/calendar.ts";
import { fixture } from "./fixtures.ts";

for (const unsafe of [
  "",
  "../other",
  "a/b",
  "a%2fb",
  "-area",
  "area-",
  "a--b",
  "日本語",
  "AREA",
  "a".repeat(81),
]) {
  test(`rejects unsafe district slug ${JSON.stringify(unsafe)}`, () => {
    const data = fixture();
    data.district.id = unsafe;
    assert.throws(() => validate(data), /slug/);
    assert.throws(() => calendarPath(data), /slug/);
  });
}
test("municipality-specific categories work without generator changes", () => {
  const data = fixture();
  data.categories = { metal: "金属類" };
  data.days.forEach((day) => {
    day.categories = ["metal"];
  });
  assert.doesNotThrow(() => validate(data));
  data.days[0]!.categories = ["burnable"];
  assert.throws(() => validate(data), /Unknown/);
});
test("conflicting municipality parents, prefecture names and district names are rejected", () => {
  for (const field of ["parent", "prefecture", "district"]) {
    const one = fixture(),
      two = fixture();
    two.source.start = "2028-01-01";
    two.source.end = "2028-01-01";
    two.days = [{ date: "2028-01-01", categories: ["pet"] }];
    if (field === "parent") two.prefecture.id = "different";
    if (field === "prefecture") two.prefecture.name = "別の県";
    if (field === "district") two.district.name = "別の地区";
    assert.throws(() => groupSchedules([one, two]), /Conflicting/);
  }
});
test("pending metadata cannot contain unsafe links, duplicate districts or missing review details", () => {
  const data = fixture();
  const pending = {
    prefecture: data.prefecture,
    municipality: data.municipality,
    district: data.district,
    sourceUrl: data.source.url,
    termsUrl: data.redistribution.termsUrl,
    checkedAt: "2026-10-15",
    reason: "Review pending",
  };
  assert.doesNotThrow(() => validatePending([pending]));
  assert.throws(() => validatePending([pending, pending]), /Conflicting/);
  assert.throws(() =>
    validatePending([{ ...pending, sourceUrl: "javascript:alert(1)" }]),
  );
  assert.throws(() => validatePending([{ ...pending, reason: "" }]));
});
test("calendar paths are fiscal-year independent and municipality-scoped", () => {
  const data = fixture();
  assert.equal(calendarPath(data), "/sample-city/sample-district.ics");
  data.source.start = "2028-01-01";
  data.source.end = "2028-01-01";
  assert.equal(calendarPath(data), "/sample-city/sample-district.ics");
  data.municipality.id = "another-city";
  assert.equal(calendarPath(data), "/another-city/sample-district.ics");
});

test("district readings reject invalid metadata and conflicts across years", () => {
  for (const reading of ["", 42, "漢字", "<script>"]) {
    const data: any = fixture();
    data.district.reading = reading;
    assert.throws(() => validate(data), /reading/i);
  }
  const first: any = fixture();
  first.district.reading = "あおい";
  const second = structuredClone(first);
  second.source.start = "2028-01-01";
  second.source.end = "2028-01-01";
  second.days = [{ date: "2028-01-01", categories: ["pet"] }];
  second.district.reading = "かすみ";
  assert.throws(() => groupSchedules([first, second]), /Conflicting/);
});
