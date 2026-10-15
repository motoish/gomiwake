import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSite, createCatalog } from "../src/site.ts";
import { fixture } from "./fixtures.ts";

// Simulates reviewed official input only inside the test process.
function approved() {
  const data = fixture();
  data.kind = "official";
  return data;
}
test("public build rejects fixtures and never exposes permission-pending dates", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gomiwake-build-"));
  try {
    await assert.rejects(buildSite([fixture()], [], dir), /fixture/i);
    const data = approved();
    data.redistribution.status = "pending";
    await buildSite([data], [], dir);
    const index = await readFile(join(dir, "index.html"), "utf8");
    assert.match(index, /現在、購読できる地区はありません/);
    const files = await readdir(dir, { recursive: true });
    assert.ok(!files.some((file) => file.endsWith(".ics")));
    assert.ok(!index.includes("2026-12-31"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("build is deterministic, writes stable paths and removes withdrawn calendars", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gomiwake-build-"));
  try {
    const data = approved();
    await buildSite([data], [], dir);
    const path = join(dir, "sample-city/sample-district.ics");
    const before = await readFile(path, "utf8");
    const html = await readFile(join(dir, "index.html"), "utf8");
    assert.match(
      html,
      /https:\/\/calendar.motoish.dev\/sample-city\/sample-district.ics/,
    );
    assert.match(
      html,
      /webcal:\/\/calendar.motoish.dev\/sample-city\/sample-district.ics/,
    );
    await buildSite([data], [], dir);
    assert.equal(await readFile(path, "utf8"), before);
    assert.equal(await readFile(join(dir, "index.html"), "utf8"), html);
    const invalid = approved();
    invalid.days.pop();
    await assert.rejects(buildSite([invalid], [], dir));
    assert.equal(await readFile(path, "utf8"), before);
    await buildSite([], [], dir);
    await assert.rejects(readFile(path));
    await writeFile(join(dir, "unexpected.ics"), before);
    await buildSite([], [], dir);
    await assert.rejects(readFile(join(dir, "unexpected.ics")));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("catalog merges years and records separate verified coverage intervals", () => {
  const first = approved(),
    second = approved();
  second.source.start = "2028-01-01";
  second.source.end = "2028-01-01";
  second.days = [{ date: "2028-01-01", categories: ["pet"] }];
  const catalog = createCatalog([second, first]);
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0]!.path, "/sample-city/sample-district.ics");
  assert.deepEqual(
    catalog[0]!.coverage.map((period) => [period.start, period.end]),
    [
      ["2026-12-31", "2027-01-02"],
      ["2028-01-01", "2028-01-01"],
    ],
  );
});
test("HTML escapes municipality labels instead of injecting markup", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gomiwake-build-"));
  try {
    const data = approved();
    data.district.name = "</script><img src=x onerror=alert(1)>";
    await buildSite([data], [], dir);
    const html = await readFile(join(dir, "index.html"), "utf8");
    assert.ok(!html.includes(data.district.name));
    assert.ok(html.includes("&lt;/script&gt;"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("published data cannot conflict with pending area identifiers", async () => {
  const data = approved();
  const pending = {
    prefecture: data.prefecture,
    municipality: { ...data.municipality, name: "Different city" },
    district: data.district,
    sourceUrl: data.source.url,
    termsUrl: data.redistribution.termsUrl,
    checkedAt: "2026-10-15",
    reason: "Pending",
  };
  const dir = await mkdtemp(join(tmpdir(), "gomiwake-build-"));
  try {
    await assert.rejects(buildSite([data], [pending], dir), /Conflicting/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("template replacement preserves dollar sequences in external labels", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gomiwake-build-"));
  try {
    const data = approved();
    data.district.name = "地区$&$`$'";
    await buildSite([data], [], dir);
    const page = await readFile(join(dir, "index.html"), "utf8");
    assert.ok(page.includes("地区$&amp;$`$&#39;"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("pending districts stay private in every public build artifact", async () => {
  const data = approved();
  const pending = {
    prefecture: { id: "private-prefecture", name: "非公開の県" },
    municipality: { id: "private-city", name: "非公開の市" },
    district: { id: "private-district", name: "非公開の地区" },
    sourceUrl: "https://example.com/private-source",
    termsUrl: "https://example.com/private-terms",
    checkedAt: "2026-10-15",
    reason: "Private research note",
  };
  const dir = await mkdtemp(join(tmpdir(), "gomiwake-build-"));
  try {
    for (const schedules of [[], [data]]) {
      await buildSite(schedules, [pending], dir);
      const files = await readdir(dir, {
        recursive: true,
        withFileTypes: true,
      });
      for (const file of files.filter((file) => file.isFile())) {
        const content = await readFile(
          join(file.parentPath, file.name),
          "utf8",
        );
        for (const privateValue of [
          pending.prefecture.id,
          pending.prefecture.name,
          pending.municipality.id,
          pending.municipality.name,
          pending.district.id,
          pending.district.name,
          pending.sourceUrl,
          pending.termsUrl,
          pending.reason,
        ]) {
          assert.ok(
            !content.includes(privateValue),
            `${file.name} leaks pending metadata`,
          );
        }
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("homepage keeps Issue and PR contribution links without district selectors", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gomiwake-build-"));
  try {
    await buildSite([], [], dir);
    const page = await readFile(join(dir, "index.html"), "utf8");
    assert.ok(!/<select\b/i.test(page));
    assert.match(
      page,
      /https:\/\/github.com\/motoish\/gomiwake\/issues\/new\?template=municipality.yml/,
    );
    assert.match(page, /https:\/\/github.com\/motoish\/gomiwake\/compare/);
    assert.match(page, /Issueでリクエスト/);
    assert.match(page, /PRで追加する/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("published districts are grouped by municipality and kana with matching copy URLs and manual links", async () => {
  const areas = [
    { id: "z-asahi", name: "朝日地区", reading: "あさひ", group: "あ行" },
    { id: "a-aoi", name: "葵地区", reading: "あおい", group: "あ行" },
    { id: "kasumi", name: "霞地区", reading: "かすみ", group: "か・き" },
    { id: "kozue", name: "梢地区", reading: "ゴズエ", group: "く・け・こ" },
    { id: "sakura", name: "桜地区", reading: "さくら", group: "さ行" },
    { id: "natsu", name: "夏地区", reading: "なつ", group: "た行・な行" },
    { id: "bara", name: "薔薇地区", reading: "ばら", group: "は行" },
    { id: "midori", name: "緑地区", reading: "みどり", group: "ま行" },
    { id: "yama", name: "山地区", reading: "やま", group: "や行・わ行" },
    { id: "ringo", name: "林檎地区", reading: "りんご", group: "ら行" },
    { id: "unknown", name: "読未確認地区", group: "その他" },
  ];
  const schedules = areas.map(({ group: _group, ...district }) => ({
    ...approved(),
    district,
  }));
  const secondYear = structuredClone(schedules[0]!);
  secondYear.source.start = "2028-01-01";
  secondYear.source.end = "2028-01-01";
  secondYear.days = [{ date: "2028-01-01", categories: ["pet"] }];
  const anotherCity = structuredClone(schedules[0]!);
  anotherCity.municipality = { id: "another-city", name: "別のテスト市" };
  const privateArea = approved();
  privateArea.district = { id: "private-area", name: "非公開地区" };
  privateArea.redistribution.status = "pending";
  const dir = await mkdtemp(join(tmpdir(), "gomiwake-build-"));
  try {
    const inputs = [...schedules, secondYear, anotherCity, privateArea];
    await buildSite(inputs, [], dir);
    const page = await readFile(join(dir, "index.html"), "utf8");
    const groups = [
      ...page.matchAll(
        /<h4 id="([^"]+)">([^<]+)<\/h4><ul class="district-list">([\s\S]*?)<\/ul>/g,
      ),
    ];
    assert.deepEqual(
      groups
        .filter((match) => match[1]!.startsWith("areas-sample-city-"))
        .map((match) => match[2]),
      [
        "あ行",
        "か・き",
        "く・け・こ",
        "さ行",
        "た行・な行",
        "は行",
        "ま行",
        "や行・わ行",
        "ら行",
        "その他",
      ],
    );
    for (const area of areas) {
      const group = groups.find(
        (match) =>
          match[1]!.startsWith("areas-sample-city-") && match[2] === area.group,
      );
      assert.ok(group?.[3]?.includes(area.name));
      const url = `https://calendar.motoish.dev/sample-city/${area.id}.ics`;
      assert.equal(page.split(`data-calendar-url="${url}"`).length - 1, 1);
      assert.ok(page.includes(`readonly value="${url}"`));
    }
    const aGroup = groups.find(
      (match) => match[1] === "areas-sample-city-a",
    )![3]!;
    assert.ok(aGroup.indexOf("葵地区") < aGroup.indexOf("朝日地区"));
    assert.ok(page.includes('id="areas-another-city-a"'));
    assert.ok(page.includes('href="#areas-sample-city-a"'));
    assert.ok(page.includes('role="status"'));
    assert.ok(page.includes('href="https://example.com/synthetic-schedule"'));
    assert.ok(page.includes("2028-01-01〜2028-01-01"));
    assert.ok(!page.includes("非公開地区"));
    assert.ok(!page.includes("private-area"));
    const script = page.match(/<script src="([^"]+)" defer><\/script>/)?.[1];
    assert.ok(script);
    assert.ok((await readFile(join(dir, script), "utf8")).length > 0);
    await buildSite(inputs.reverse(), [], dir);
    assert.equal(await readFile(join(dir, "index.html"), "utf8"), page);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("static category overview lists all nine municipal categories without publishing schedules", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gomiwake-build-"));
  try {
    const profile = JSON.parse(
      await readFile("data/categories/tokorozawa.json", "utf8"),
    );
    await buildSite([], [], dir, [profile]);
    const page = await readFile(join(dir, "index.html"), "utf8");
    for (const label of [
      "古着・古布",
      "小型家電製品",
      "びん・かん・スプレー缶",
      "容器包装プラスチック",
      "新聞・雑誌・雑がみ・段ボール",
      "ペットボトル",
      "燃やせるごみ",
      "破砕ごみ類",
      "有害ごみ",
    ])
      assert.ok(page.includes(label));
    assert.ok(page.includes(profile.sourceUrl));
    assert.match(page, /現在、購読できる地区はありません/);
    assert.ok(
      !(await readdir(dir, { recursive: true })).some((file) =>
        file.endsWith(".ics"),
      ),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
