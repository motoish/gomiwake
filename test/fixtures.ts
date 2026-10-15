import { readFileSync } from "node:fs";
import type { Schedule } from "../src/calendar.ts";
export function fixture(): Schedule {
  return JSON.parse(
    readFileSync(new URL("./fixtures/schedule.json", import.meta.url), "utf8"),
  ) as Schedule;
}
