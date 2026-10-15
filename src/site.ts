import {
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type Area,
  generate,
  groupSchedules,
  type PendingArea,
  type Schedule,
  validatePending,
  validateIdentities,
} from "./calendar.ts";

import {
  type CategoryProfile,
  validateCategoryProfiles,
} from "./categories.ts";

export interface CatalogEntry extends Area {
  path: string;
  coverage: {
    start: string;
    end: string;
    verifiedAt: string;
    sourceUrl: string;
    termsUrl: string;
  }[];
}
export const origin = "https://calendar.motoish.dev";
export function createCatalog(inputs: unknown[]): CatalogEntry[] {
  const groups = groupSchedules(inputs);
  for (const group of groups.values()) {
    if (group.some((data) => data.kind !== "official"))
      throw new Error("Fixture data is forbidden in production builds");
  }
  const entries: CatalogEntry[] = [];
  for (const [path, group] of groups) {
    const published = group.filter(
      (data) => data.redistribution.status === "permitted",
    );
    if (!published.length) continue;
    const first = published[0];
    entries.push({
      prefecture: first.prefecture,
      municipality: first.municipality,
      district: {
        ...first.district,
        reading: published.find((data) => data.district.reading)?.district
          .reading,
      },
      path,
      coverage: published.map((data) => ({
        start: data.source.start,
        end: data.source.end,
        verifiedAt: data.verification.reviewedAt,
        sourceUrl: data.source.url,
        termsUrl: data.redistribution.termsUrl,
      })),
    });
  }
  return entries;
}
function html(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
const kanaGroups = [
  { id: "a", label: "あ行", initials: "あいうえお" },
  { id: "ka", label: "か・き", initials: "かき" },
  { id: "ku", label: "く・け・こ", initials: "くけこ" },
  { id: "sa", label: "さ行", initials: "さしすせそ" },
  { id: "ta", label: "た行・な行", initials: "たちつてとなにぬねの" },
  { id: "ha", label: "は行", initials: "はひふへほ" },
  { id: "ma", label: "ま行", initials: "まみむめも" },
  { id: "ya", label: "や行・わ行", initials: "やゆよわゐゑを" },
  { id: "ra", label: "ら行", initials: "らりるれろ" },
  { id: "other", label: "その他", initials: "" },
];
function districtGroup(entry: CatalogEntry): string {
  const initial = (entry.district.reading ?? "")
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/[ァ-ヶ]/gu, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0x60),
    )
    .slice(0, 1);
  return (
    kanaGroups.find((group) => initial && group.initials.includes(initial))
      ?.id ?? "other"
  );
}
function districtItem(entry: CatalogEntry): string {
  const url = `${origin}${entry.path}`;
  return `<li class="district"><span data-district-name>${html(entry.district.name)}</span><button type="button" class="copy-calendar" data-calendar-url="${html(url)}" aria-label="${html(`${entry.district.name}の照会URLをコピー`)}" hidden>${html(entry.district.name)}</button><span data-copy-status role="status" aria-live="polite"></span><details class="district-links"><summary>リンク・収録期間・出典</summary><label>照会URL<input type="url" readonly value="${html(url)}"></label><a href="${html(url)}">ICSファイルを開く</a> · <a href="${origin.replace("https:", "webcal:")}${entry.path}">Apple Calendarで照会</a><p>確認済み収録期間</p>${entry.coverage.map((period) => `<p>${period.start}〜${period.end} · 確認日 ${period.verifiedAt} · <a href="${html(period.sourceUrl)}">公式出典</a> · <a href="${html(period.termsUrl)}">利用条件</a></p>`).join("")}</details></li>`;
}
function districtDirectory(catalog: CatalogEntry[]): string {
  if (!catalog.length) return "<p>現在、購読できる地区はありません。</p>";
  const municipalities = new Map<string, CatalogEntry[]>();
  for (const entry of catalog) {
    const entries = municipalities.get(entry.municipality.id) ?? [];
    entries.push(entry);
    municipalities.set(entry.municipality.id, entries);
  }
  const collator = new Intl.Collator("ja", { numeric: true });
  return [...municipalities]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([municipalityId, entries]) => {
      const first = entries[0];
      const name = `${first.prefecture.name} ${first.municipality.name}`;
      const groups = kanaGroups
        .map((group) => ({
          ...group,
          entries: entries
            .filter((entry) => districtGroup(entry) === group.id)
            .sort(
              (a, b) =>
                collator.compare(
                  a.district.reading ?? a.district.name,
                  b.district.reading ?? b.district.name,
                ) || a.path.localeCompare(b.path),
            ),
          anchor: `areas-${municipalityId}-${group.id}`,
        }))
        .filter((group) => group.entries.length);
      const index = groups
        .map(
          (group) => `<li><a href="#${group.anchor}">${group.label}</a></li>`,
        )
        .join("");
      return `<article class="municipality"><h3>${html(name)}</h3><nav aria-label="${html(`${name}の地区索引`)}"><ul class="kana-index">${index}</ul></nav>${groups.map((group) => `<section class="district-group" aria-labelledby="${group.anchor}"><h4 id="${group.anchor}">${group.label}</h4><ul class="district-list">${group.entries.map(districtItem).join("")}</ul></section>`).join("")}</article>`;
    })
    .join("");
}
export async function loadData(
  root = new URL("../data/", import.meta.url),
): Promise<{
  schedules: Schedule[];
  pending: PendingArea[];
  categoryProfiles: CategoryProfile[];
}> {
  const dataRoot = new URL("schedules/", root);
  const files = await readdir(dataRoot, { recursive: true });
  const schedules: unknown[] = [];
  for (const file of files.filter((file) => file.endsWith(".json")).sort()) {
    try {
      schedules.push(
        JSON.parse(await readFile(join(fileURLToPath(dataRoot), file), "utf8")),
      );
    } catch (error) {
      throw new Error(`Invalid schedule JSON: ${file}`, { cause: error });
    }
  }
  createCatalog(schedules);
  const pending: unknown = JSON.parse(
    await readFile(new URL("pending.json", root), "utf8"),
  );
  validatePending(pending);
  validateIdentities([...(schedules as Schedule[]), ...pending]);
  const categoriesRoot = new URL("categories/", root);
  const categoryProfiles: unknown[] = [];
  for (const file of (await readdir(categoriesRoot))
    .filter((file) => file.endsWith(".json"))
    .sort()) {
    categoryProfiles.push(
      JSON.parse(
        await readFile(join(fileURLToPath(categoriesRoot), file), "utf8"),
      ),
    );
  }
  validateCategoryProfiles(categoryProfiles);
  if (
    [...(schedules as Schedule[]), ...pending].some(
      (area) =>
        area.prefecture.id !== "saitama" ||
        area.municipality.id !== "tokorozawa",
    ) ||
    categoryProfiles.some((profile) => profile.municipality.id !== "tokorozawa")
  )
    throw new Error("Only Saitama/Tokorozawa data is supported");
  return { schedules: schedules as Schedule[], pending, categoryProfiles };
}
export async function buildSite(
  inputs: unknown[],
  pendingInput: unknown,
  output = "dist",
  categoryProfilesInput: unknown = [],
): Promise<void> {
  const catalog = createCatalog(inputs);
  validateCategoryProfiles(categoryProfilesInput);
  validatePending(pendingInput);
  validateIdentities([...(inputs as Schedule[]), ...pendingInput]);
  const groups = groupSchedules(inputs);
  const template = await readFile(
    new URL("./web/index.html", import.meta.url),
    "utf8",
  );
  const supported = districtDirectory(catalog);
  const classifications = [...categoryProfilesInput]
    .sort((a, b) => a.municipality.id.localeCompare(b.municipality.id))
    .map(
      (profile) =>
        `<article class="classification"><div class="classification-heading"><h3>${html(profile.municipality.name)}</h3><a href="${html(profile.sourceUrl)}">公式の分け方・出し方</a></div><ul class="category-list">${Object.values(
          profile.categories,
        )
          .map((label) => `<li>${html(label)}</li>`)
          .join(
            "",
          )}</ul><p class="hint">分類名の確認日: ${profile.reviewedAt}。収集日は地区ごとの公式日程をご確認ください。</p></article>`,
    )
    .join("");
  const categorySection = classifications
    ? `<section class="section" aria-labelledby="categories-title"><div class="section-heading"><h2 id="categories-title">ごみの分類</h2></div>${classifications}</section>`
    : "";
  // Validate and render everything before touching the previous successful output.
  const page = template
    .replace("%%SUPPORTED%%", () => supported)
    .replace("%%CATEGORIES%%", () => categorySection);
  const destination = resolve(output);
  const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  if (
    destination === projectRoot ||
    !/^(dist|gomiwake-build-)/.test(basename(destination))
  ) {
    throw new Error("Output must be dist or a gomiwake-build-* test directory");
  }
  const staging = join(
    dirname(destination),
    `.dist-${process.pid}-${Date.now()}`,
  );
  try {
    await cp(new URL("../public/", import.meta.url), staging, {
      recursive: true,
    });
    await writeFile(join(staging, "index.html"), page);
    for (const [path, group] of groups) {
      const allowed = group.filter(
        (data) => data.redistribution.status === "permitted",
      );
      if (!allowed.length) continue;
      const file = join(staging, path.slice(1));
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, generate(allowed), "utf8");
    }
    await rm(destination, { recursive: true, force: true });
    await rename(staging, destination);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
