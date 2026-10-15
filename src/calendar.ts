import { createHash } from "node:crypto";

export interface Area {
  prefecture: { id: string; name: string };
  municipality: { id: string; name: string };
  district: { id: string; name: string };
}
export interface Schedule extends Area {
  kind: "official" | "fixture";
  categories: Record<string, string>;
  instructions: string;
  source: { url: string; start: string; end: string };
  verification: { status: "verified"; reviewedAt: string; note: string };
  redistribution: {
    status: "permitted" | "pending";
    termsUrl: string;
    reviewedAt: string;
    note: string;
  };
  days: { date: string; categories: string[] }[];
}
export interface PendingArea extends Area {
  sourceUrl: string;
  termsUrl: string;
  checkedAt: string;
  reason: string;
}
export function validText(value: unknown): asserts value is string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: External text must not contain forbidden control characters.
  const forbidden = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
  if (typeof value !== "string" || !value.trim() || forbidden.test(value)) {
    throw new Error("Missing or invalid text");
  }
}
export function slug(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length > 80 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
  ) {
    throw new Error(`Invalid identifier/slug: ${String(value)}`);
  }
}
export function date(value: unknown): string {
  if (typeof value !== "string" || !/^20\d{2}-\d{2}-\d{2}$/.test(value))
    throw new Error(`Invalid date: ${String(value)}`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    throw new Error(`Invalid date: ${value}`);
  return value;
}
function nextDay(value: string): string {
  const parsed = new Date(`${value}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}
export function httpsUrl(value: unknown): asserts value is string {
  validText(value);
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    /[\s\\]/u.test(value)
  )
    throw new Error("Expected safe HTTPS URL");
}
export function validateArea(input: Area): void {
  for (const part of [
    input?.prefecture,
    input?.municipality,
    input?.district,
  ]) {
    slug(part?.id);
    validText(part?.name);
  }
  // These namespaces are reserved for the static website.
  if (
    ["assets", "index", "404", "catalog", "_headers"].includes(
      input.municipality.id,
    )
  )
    throw new Error("Reserved municipality ID");
}
export function calendarPath(area: Area): string {
  validateArea(area);
  return `/${area.municipality.id}/${area.district.id}.ics`;
}
export function validate(input: unknown): asserts input is Schedule {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Expected schedule object");
  const data = input as Schedule;
  validateArea(data);
  if (!["official", "fixture"].includes(data.kind))
    throw new Error("Expected explicit data kind");
  if (
    !data.categories ||
    typeof data.categories !== "object" ||
    Array.isArray(data.categories) ||
    !Object.keys(data.categories).length
  ) {
    throw new Error("Missing category definitions");
  }
  for (const [id, label] of Object.entries(data.categories)) {
    slug(id);
    validText(label);
  }
  validText(data.instructions);
  const start = date(data.source?.start),
    end = date(data.source?.end);
  if (start > end) throw new Error("Reversed coverage period");
  httpsUrl(data.source?.url);
  if (data.verification?.status !== "verified")
    throw new Error("Schedule has not been verified");
  date(data.verification.reviewedAt);
  validText(data.verification.note);
  if (!["permitted", "pending"].includes(data.redistribution?.status))
    throw new Error("Missing redistribution review");
  httpsUrl(data.redistribution.termsUrl);
  date(data.redistribution.reviewedAt);
  validText(data.redistribution.note);
  if (!Array.isArray(data.days) || !data.days.length)
    throw new Error("Empty schedule");
  const seen = new Set<string>();
  let events = 0;
  for (const day of data.days) {
    const value = date(day?.date);
    if (value < start || value > end || seen.has(value))
      throw new Error(`Duplicate/conflicting or out-of-period date: ${value}`);
    seen.add(value);
    if (!Array.isArray(day.categories))
      throw new Error(`Missing categories: ${value}`);
    const unique = new Set<string>();
    for (const category of day.categories) {
      if (
        typeof category !== "string" ||
        !Object.hasOwn(data.categories, category) ||
        unique.has(category)
      )
        throw new Error(`Unknown or duplicate category: ${String(category)}`);
      unique.add(category);
      events++;
    }
  }
  for (let value = start; value <= end; value = nextDay(value)) {
    if (!seen.has(value))
      throw new Error(`Missing date: ${value} (use [] for no collection)`);
  }
  if (!events) throw new Error("Schedule contains no collection events");
}
export function validatePending(
  input: unknown,
): asserts input is PendingArea[] {
  if (!Array.isArray(input)) throw new Error("Expected pending areas array");
  const paths = new Set<string>();
  for (const area of input as PendingArea[]) {
    validateArea(area);
    httpsUrl(area.sourceUrl);
    httpsUrl(area.termsUrl);
    date(area.checkedAt);
    validText(area.reason);
    const path = calendarPath(area);
    if (paths.has(path)) throw new Error(`Conflicting pending area: ${path}`);
    paths.add(path);
  }
}
export function validateIdentities(areas: Area[]): void {
  const identities = new Map<string, string>();
  for (const data of areas) {
    validateArea(data);
    const identity = [
      [`prefecture/${data.prefecture.id}`, data.prefecture.name],
      [
        `municipality/${data.municipality.id}`,
        `${data.prefecture.id}/${data.municipality.name}`,
      ],
      [`district${calendarPath(data)}`, data.district.name],
    ];
    for (const [key, name] of identity) {
      if (identities.has(key) && identities.get(key) !== name)
        throw new Error(`Conflicting identity: ${key}`);
      identities.set(key, name);
    }
  }
}
/** Validate identifiers across every year and municipality before writing any files. */
export function groupSchedules(inputs: unknown[]): Map<string, Schedule[]> {
  if (!Array.isArray(inputs)) throw new Error("Expected schedules array");
  const schedules = inputs.map((input) => {
    validate(input);
    return input;
  });
  validateIdentities(schedules);
  const groups = new Map<string, Schedule[]>();
  for (const data of schedules) {
    const key = calendarPath(data);
    const group = groups.get(key) ?? [];
    if (
      group.some(
        (previous) =>
          previous.source.start <= data.source.end &&
          data.source.start <= previous.source.end,
      )
    ) {
      throw new Error(`Overlapping coverage: ${key}`);
    }
    group.push(data);
    groups.set(key, group);
  }
  return new Map(
    [...groups]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, group]) => [
        path,
        group.sort((a, b) => a.source.start.localeCompare(b.source.start)),
      ]),
  );
}
function escapeText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,");
}
function fold(line: string): string {
  let output = "",
    width = 0;
  for (const char of line) {
    const bytes = Buffer.byteLength(char);
    if (width + bytes > 75) {
      output += "\r\n ";
      width = 1;
    }
    output += char;
    width += bytes;
  }
  return output;
}
/** DTSTAMP comes from verification metadata so unchanged data rebuilds byte-for-byte. */
export function generate(inputs: unknown[]): string {
  const groups = groupSchedules(inputs);
  if (groups.size !== 1)
    throw new Error("Generate exactly one district at a time");
  const schedules = [...groups.values()][0];
  const first = schedules?.[0];
  if (!first) throw new Error("Empty district schedule");
  const coverage = schedules
    .map((data) => `${data.source.start}〜${data.source.end}`)
    .join("、");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Gomiwake//Garbage Calendar//JA",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeText(`${first.municipality.name} ${first.district.name} ごみ収集`)}`,
    "X-WR-TIMEZONE:Asia/Tokyo",
    `X-WR-CALDESC:${escapeText(`確認済み収録期間: ${coverage}。収録期間外の予定は未掲載です。`)}`,
  ];
  for (const data of schedules) {
    const stamp = `${data.verification.reviewedAt.replaceAll("-", "")}T000000Z`;
    for (const day of [...data.days].sort((a, b) =>
      a.date.localeCompare(b.date),
    )) {
      for (const category of [...day.categories].sort()) {
        const uid = createHash("sha256")
          .update(
            `${data.municipality.id}/${data.district.id}/${day.date}/${category}`,
          )
          .digest("hex");
        lines.push(
          "BEGIN:VEVENT",
          `UID:${uid}@calendar.motoish.dev`,
          `DTSTAMP:${stamp}`,
          `LAST-MODIFIED:${stamp}`,
          `DTSTART;VALUE=DATE:${day.date.replaceAll("-", "")}`,
          `DTEND;VALUE=DATE:${nextDay(day.date).replaceAll("-", "")}`,
          `SUMMARY:${escapeText(data.categories[category])}`,
          `DESCRIPTION:${escapeText(`出典: ${data.source.url}\n確認日: ${data.verification.reviewedAt}`)}`,
          "TRANSP:TRANSPARENT",
          "END:VEVENT",
        );
      }
    }
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
