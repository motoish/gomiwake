# Contributing

Small, source-backed contributions are welcome. Run `bun install --frozen-lockfile` and `bun run check` before submitting changes. Use `bun run format` to format source. Keep this project static and dependency-light.

## Add a municipality or district

1. Find the official schedule and investigate official structured data first. Do not infer weekly rules or parse PDF calendars automatically.
2. Verify that redistribution is permitted for **this dataset**. Record the terms URL, review date, and evidence. A municipality's participation in an open-data portal alone is insufficient.
3. If permission is unclear, keep all research, including area names, source links, and review notes, under ignored `.local/`. Keep the public `data/pending.json` empty. Do not add actual collection dates, official PDFs, or screenshots to the public repository. Unpublished district details can reveal contributors’ home areas and must not appear in documentation or URL examples.
4. Once terms and dates are confirmed, add a JSON file under `data/schedules/{municipality}/{district}-{year}.json`. The build discovers all JSON files in this directory recursively. Never copy a test fixture into production.
5. Compare every date and collection category against the official source, including year-end closures, holidays, and blank cells. Record no-collection days with `categories: []` so missing dates can be detected. A second reviewer is encouraged.
6. Run all checks and inspect the generated calendar, website attribution, coverage, and stable path. Provide source URLs and the verification method in your contribution.

Use the following shape. This is deliberately incomplete metadata, not publishable schedule data:

```json
{
  "kind": "official",
  "prefecture": { "id": "prefecture-id", "name": "都道府県名" },
  "municipality": { "id": "municipality-id", "name": "自治体名" },
  "district": {
    "id": "district-id",
    "name": "収集地区名",
    "reading": "しゅうしゅうちくめい"
  },
  "categories": { "burnable": "🔥 自治体が定める正式区分名" },
  "instructions": "自治体が定めるごみ出し時刻など",
  "source": {
    "url": "https://official.example/schedule",
    "start": "2026-04-01",
    "end": "2027-03-31"
  },
  "verification": {
    "status": "verified",
    "reviewedAt": "2026-10-15",
    "note": "全日・全区分を照合した方法と対象資料"
  },
  "redistribution": {
    "status": "permitted",
    "termsUrl": "https://official.example/terms",
    "reviewedAt": "2026-10-15",
    "note": "このデータに適用されるライセンスや許諾の根拠"
  },
  "days": []
}
```

The empty `days` array above must be replaced with the entire declared period. Each record has `date: "YYYY-MM-DD"` and `categories: ["category-id"]`. An empty category list is valid only for a verified no-collection day. Every nonempty list can include several distinct categories. Labels must match official Japanese category names; optional emoji may precede them.

`district.reading` is the district's verified reading in hiragana or katakana (no spaces or punctuation). It is optional for existing data; without it, the district appears under その他. The website groups published districts by municipality and reading, following Tokorozawa's kana index. Add the same reading to annual files for the same district; conflicting readings are rejected. Clicking a district name copies its stable HTTPS subscription URL. Manual links remain available when JavaScript or clipboard access is unavailable.

### Tokorozawa categories

`data/categories/tokorozawa.json` defines the nine official category labels (classification metadata only; no collection dates):

| ID | Japanese label |
| --- | --- |
| `clothing` | 古着・古布 |
| `appliances` | 小型家電製品 |
| `containers` | びん・かん・スプレー缶 |
| `plastic` | 容器包装プラスチック |
| `paper` | 新聞・雑誌・雑がみ・段ボール |
| `pet` | ペットボトル |
| `burnable` | 燃やせるごみ |
| `crushed` | 破砕ごみ類 |
| `hazardous` | 有害ごみ |

Copy the applicable definitions into the schedule's `categories` map. Keep clothing and small appliances separate, and crushed waste and hazardous waste separate, even when the official calendar collects them together. Put both IDs on that date to generate distinct events. Never infer dates from the category list. New municipality category profiles can be added under `data/categories/`; include `municipality`, `sourceUrl`, `reviewedAt`, and `categories` as in the existing profile.

IDs use lowercase ASCII letters, numbers, and single hyphens, without leading/trailing hyphens (maximum 80 characters). Municipality IDs are globally unique because they form public paths; district IDs are unique within a municipality. The build rejects conflicting names/parents, overlapping periods, duplicate events/dates, unknown categories, unsafe URLs, invalid dates, missing coverage, and unverified schedules. Type declarations and runtime checks live in `src/calendar.ts`.

## Annual updates and corrections

Add the next verified year as a separate file with the same municipality and district IDs. Do not put a year in public district IDs. Retain previous verified files if useful; missing periods are never extrapolated. `dist/{municipality}/{district}.ics` combines only verified, permission-cleared periods and lists each period separately on the website.

For a correction, edit the original day's category list and update `verification.reviewedAt` and its note. Keep IDs stable for the same collection category. Label changes preserve UIDs; a date/category change intentionally removes the old event and adds the new event. Calendar clients reconcile the complete feed on refresh. Rebuilds are deterministic because `DTSTAMP` and `LAST-MODIFIED` use the verification date, not the build clock.

`redistribution.status: "pending"` excludes the file from output, but actual dates with unresolved rights should still remain outside the public repository. Any `kind: "fixture"` record causes a production build failure. Do not add bypass flags. Permission metadata is reviewed evidence, not an automatic legal determination.

## Report problems

Use the GitHub issue forms for new municipalities, incorrect schedules, or bugs. For incorrect dates, link the official source and specify the district, date, expected category, and observed category. Do not include home addresses or location data.
