import { test } from "node:test";
import assert from "node:assert/strict";
import { generate, validate } from "../src/calendar.ts";

import { fixture } from "./fixtures.ts";

test("all-day events retain Japanese dates, exclusive end dates and multiple categories", () => {
  const output = generate([fixture()]);
  assert.match(output, /VERSION:2.0\r\nPRODID:/);
  assert.match(output, /X-WR-TIMEZONE:Asia\/Tokyo/);
  assert.match(output, /DTSTAMP:20261015T000000Z/);
  assert.match(
    output,
    /DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101/,
  );
  assert.match(
    output,
    /DTSTART;VALUE=DATE:20270102\r\nDTEND;VALUE=DATE:20270103/,
  );
  assert.equal(output.match(/BEGIN:VEVENT/g)?.length, 3);
  assert.match(output, /SUMMARY:🔥 燃やせるごみ/);
  assert.match(output, /SUMMARY:🧴 ペットボトル/);
  assert.ok(!output.includes("RRULE"));
  assert.ok(!output.replaceAll("\r\n", "").includes("\n"));
});
test("UIDs survive rebuilds, reordered data and display-name edits", () => {
  const data = fixture();
  const uids = (s: string) => s.match(/UID:[^\r]+/g)?.sort();
  const before = uids(generate([data]));
  data.district.name = "別の表示名";
  data.days.reverse();
  assert.deepEqual(uids(generate([data])), before);
  data.district.id = "another";
  assert.notDeepEqual(uids(generate([data])), before);
});
test("escapes text and folds UTF-8 at 75 octets without splitting characters", () => {
  const data = fixture();
  data.district.name = `地区,;\\\n${"日本語🧴".repeat(40)}`;
  const output = generate([data]);
  for (const line of output.split("\r\n"))
    assert.ok(Buffer.byteLength(line) <= 75);
  assert.ok(!output.includes("\uFFFD"));
  const unfolded = output.replaceAll("\r\n ", "");
  assert.ok(unfolded.includes(`地区\\,\\;\\\\\\n${"日本語🧴".repeat(40)}`));
});
for (const [name, mutate] of Object.entries({
  empty: (d: any) => {
    d.days = [];
  },
  missing: (d: any) => {
    d.days.splice(1, 1);
  },
  invalidDate: (d: any) => {
    d.days[0].date = "2026-02-30";
  },
  duplicateDay: (d: any) => {
    d.days.push(d.days[0]);
  },
  duplicateCategory: (d: any) => {
    d.days[0].categories = ["pet", "pet"];
  },
  unknownCategory: (d: any) => {
    d.days[0].categories = ["unknown"];
  },
  unverified: (d: any) => {
    d.verification.status = "draft";
  },
  noDistrict: (d: any) => {
    d.district.id = "";
  },
  reversedPeriod: (d: any) => {
    d.source.end = "2026-01-01";
  },
  unsafeSource: (d: any) => {
    d.source.url = "javascript:alert(1)";
  },
  outsidePeriod: (d: any) => {
    d.days[0].date = "2026-12-30";
  },
  emptyEvents: (d: any) => {
    d.days.forEach((day: any) => {
      day.categories = [];
    });
  },
}))
  test(`rejects ${name}`, () => {
    const data = fixture();
    mutate(data);
    assert.throws(() => validate(data));
  });
test("rejects malformed inputs", () => {
  for (const value of [null, {}, [], "text", { days: [] }])
    assert.throws(() => validate(value));
});
test("leap-day dates advance correctly", () => {
  const data = fixture();
  data.source.start = "2028-02-28";
  data.source.end = "2028-03-01";
  data.days.forEach((day, i) => {
    day.date = ["2028-02-28", "2028-02-29", "2028-03-01"][i]!;
    day.categories = ["burnable"];
  });
  assert.match(
    generate([data]),
    /DTSTART;VALUE=DATE:20280229\r\nDTEND;VALUE=DATE:20280301/,
  );
});

test("deterministic output ignores input order and retains UIDs on category corrections", () => {
  const data = fixture();
  const before = generate([data]);
  data.days.reverse();
  data.days.forEach((day) => {
    day.categories.reverse();
  });
  assert.equal(generate([data]), before);
  const uids = (value: string) =>
    value.replaceAll("\r\n ", "").match(/UID:[^\r]+/g);
  data.categories.burnable = "🔥 燃やすごみ";
  data.verification.reviewedAt = "2026-10-16";
  assert.deepEqual(uids(generate([data])), uids(before));
  assert.notEqual(generate([data]), before);
});
test("multiple years retain the URL and earlier event UIDs without inventing gap dates", () => {
  const first = fixture(),
    second = fixture();
  second.source.start = "2028-01-01";
  second.source.end = "2028-01-01";
  second.days = [{ date: "2028-01-01", categories: ["pet"] }];
  const output = generate([second, first]);
  assert.equal(output.match(/BEGIN:VEVENT/g)?.length, 4);
  assert.ok(!output.includes("DTSTART;VALUE=DATE:20270103"));
  const firstUid = generate([first])
    .replaceAll("\r\n ", "")
    .match(/UID:[^\r]+/)![0];
  assert.ok(output.replaceAll("\r\n ", "").includes(firstUid));
});
test("generator rejects overlapping periods and conflicting municipality identities", () => {
  const first = fixture(),
    second = fixture();
  assert.throws(() => generate([first, second]), /overlap/i);
  second.municipality.name = "別の市";
  assert.throws(() => generate([first, second]), /conflict/i);
});
