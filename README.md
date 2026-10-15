# Gomiwake

**Tokorozawa garbage collection days, in the calendar you already use.**

Gomiwake turns verified district collection schedules for Tokorozawa, Saitama into read-only iCalendar subscriptions. A small Japanese website lists published calendars for Apple Calendar, Google Calendar, and other calendar apps, with Issue and PR links for contributing Tokorozawa districts. Other municipalities are out of scope.

所沢市のごみの日を、いつものカレンダーに。公開済みの地区別収集日程を照会できます。所沢市内の地区追加はIssueやPRからご提案ください。アプリの追加・ログイン・住所の入力は不要です。

[Usage](#usage--使い方) · [Development](#development) · [Contributing](CONTRIBUTING.md) · [Deployment](#cloudflare-pages)

## Development

Requires **Bun 1.4.3 or newer**. The package manager and runtime are Bun; the tested version is pinned in `package.json`. No runtime packages are needed; development dependencies are TypeScript, Node type definitions, and Biome.

```sh
bun install --frozen-lockfile
bun run check  # format, lint, types, tests, data validation, static build
bun run dev    # preview the built dist/ at http://127.0.0.1:4173
```

Run `bun run build` before previewing changes. `bun run format` formats source files; `bun run validate` checks production data; `bun run generate` is an alias for the full static build. Output is always `dist/`, including the website, `_headers`, a real `404.html`, and eligible calendars. No fixture-preview or permission-bypass mode exists in the production CLI.

## Features

- Static HTML and CSS with a small clipboard script; TypeScript for validation and build tools.
- Tokorozawa districts grouped by kana, with one-click copying of subscription URLs and manual links as a fallback.
- Nine separately modeled Tokorozawa categories, including clothing, small appliances, crushed waste, and hazardous waste.
- Explicit collection dates with holiday exceptions, multiple categories per day, and Japanese all-day events.
- Stable district URLs and event UIDs across annual updates; deterministic builds.
- No database, authentication, runtime generation, analytics, or location tracking.
- Build-time checks for complete dates, categories, identifiers, verification, and publication eligibility.

## Areas & data status

**No production calendars are published yet.** Areas under review are private and are not listed on the website. Only approved, intentionally published districts appear as available.

The [official collection-calendar pages](https://www.city.tokorozawa.saitama.jp/kurashi/gomi/nittei/) provide district schedules as PDFs. Official CSV, JSON, or iCalendar data was not found in the municipal collection-calendar pages checked on October 15, 2026. Neither the city's [copyright policy](https://www.city.tokorozawa.saitama.jp/aboutweb/copyrightpolicy.html) nor its [open-data information](https://www.city.tokorozawa.saitama.jp/shiseijoho/data/opendata20190517.html) establishes that this calendar is licensed for redistribution. Applicability remains unconfirmed; this is a publication hold, not a conclusion about legal rights in individual facts.

Real schedule records awaiting permission remain outside version control in `.local/`. Official PDFs and images are not included. Private area names, source links, and review notes also belong in ignored `.local/` files; keep the public `data/pending.json` empty. Pending metadata is never included in static output. Synthetic schedules live under `test/fixtures/` and are rejected by production builds. Adding a verified, permission-cleared schedule under `data/schedules/` enables that district automatically. Category labels in `data/categories/` are displayed separately; they contain no districts or collection dates and do not imply that a subscription is available.

## Usage / 使い方

After deployment, browse published Tokorozawa districts by kana on **https://calendar.motoish.dev**. Click a district name to copy its HTTPS subscription URL, then paste it into your calendar app. If copying is unavailable, open リンク・収録期間・出典 to copy the URL manually. Request a Tokorozawa district through an Issue or contribute verified data through a PR. This domain is the intended deployment target, not a confirmed live service.

年度を含まないURLを照会するため、新年度も同じURLを使えます。以下は未公開のURL形式の例です。

```text
https://calendar.motoish.dev/tokorozawa/example-district.ics
webcal://calendar.motoish.dev/tokorozawa/example-district.ics
```

- **Apple Calendar:** 対応エリアの「Apple Calendarで照会」を選び、アプリ内で追加します。Macでは「ファイル → 新規照会カレンダー」にHTTPS URLを入力できます。iPhoneでは「カレンダー → カレンダーを追加 → 照会カレンダーを追加」を使います。[Appleの手順](https://support.apple.com/guide/calendar/icl1022/mac)
- **Google Calendar:** パソコンで「他のカレンダー」の「＋ → URLで追加」を開き、HTTPS URLを入力します。[Googleの手順](https://support.google.com/calendar/answer/37100?hl=ja)

ファイルの単発読み込みではなく、URLで照会してください。反映は各カレンダーアプリの取得間隔によります。リンクを開くだけでは購読は完了しません。カレンダーアプリ内で照会を追加してください。

## Contributing schedules

See [CONTRIBUTING.md](CONTRIBUTING.md) for the schema and review checklist. Production data is limited to Tokorozawa districts and the city's category definitions. The loader rejects schedules, pending areas, and category profiles for other municipalities. Confirm both schedule accuracy and redistribution terms before adding actual collection dates to the public repository.

Each yearly file declares its exact coverage and lists every day, including empty collection days. Separate files for the same district combine into one calendar; overlapping coverage is rejected. Verified history can remain, gaps and future periods stay empty, and corrections replace records rather than adding another copy. Change the verification date when correcting data. Keep municipality, district, and category IDs stable so existing event UIDs survive display-name changes.

CI runs on pull requests, pushes to `main`, and manual dispatch. It installs from the lockfile, runs all checks and a second timezone test, and uploads `dist/` as an artifact. There are no scheduled runs, automatic commits, or deployment credentials.

## Cloudflare Pages

Create resources manually after reviewing the output:

| Setting | Value |
| --- | --- |
| Repository | `motoish/gomiwake` (public, once you choose to publish it) |
| Framework preset | None |
| Production branch | `main` |
| Build command | `bun install --frozen-lockfile && bun run build` |
| Build output directory | `dist` |
| Bun version | `1.4.3` (`BUN_VERSION=1.4.3`) |
| Dependency installation | `SKIP_DEPENDENCY_INSTALL=1`; build command installs with Bun |
| Application secrets | None |
| Custom domain | `calendar.motoish.dev` |

Set `BUN_VERSION=1.4.3` and `SKIP_DEPENDENCY_INSTALL=1` for production and preview builds so dependency installation uses the explicit Bun command above. See the [Pages build image settings](https://developers.cloudflare.com/pages/configuration/build-image/).

Use [Pages Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/) for builds on push. Under **Custom domains**, add `calendar.motoish.dev` and follow [Cloudflare's DNS instructions](https://developers.cloudflare.com/pages/configuration/custom-domains/). Keep the existing `motoish.dev` site separate. No cloud resources or remote repositories are created by this project.

`_headers` serves `.ics` as `text/calendar; charset=utf-8` with a one-hour cache lifetime and revalidation. Once a district is approved and deployed, check its URL with `curl -i`: expect HTTP 200, the calendar content type, and `BEGIN:VCALENDAR`, then test an actual subscription. Unpublished paths must return 404, not the site's HTML with HTTP 200. The public domain, Cloudflare header behavior, and calendar-client subscriptions have not yet been tested on a deployed service.

## License & accuracy

Original source code and synthetic test fixtures are [MIT licensed](LICENSE). Municipal data, if later added, retains its documented source terms and is not automatically relicensed as MIT. Reproduce collection facts only where the applicable terms permit it; do not copy PDF layouts or artwork.

Gomiwake is independent and is **not an official municipal service**. Confirm important collection details with your municipality and collection-point notices. Report errors using the [schedule issue form](https://github.com/motoish/gomiwake/issues/new?template=schedule.yml); include the date, category, and official source, but no street address or personal information.
