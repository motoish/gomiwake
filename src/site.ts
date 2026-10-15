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
      district: first.district,
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
  const supported = catalog.length
    ? catalog
        .map(
          (entry) =>
            `<li><strong>${html(`${entry.prefecture.name} ${entry.municipality.name} ${entry.district.name}`)}</strong><span>確認済み収録期間</span>${entry.coverage.map((period) => `<span>${period.start}〜${period.end} · 確認日 ${period.verifiedAt} · <a href="${html(period.sourceUrl)}">公式出典</a> · <a href="${html(period.termsUrl)}">利用条件</a></span>`).join("")}<a href="${origin}${entry.path}">${origin}${entry.path}</a><a href="${origin.replace("https:", "webcal:")}${entry.path}">Apple Calendarで照会</a></li>`,
        )
        .join("")
    : "<li>現在、購読できる地区はありません。</li>";
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
