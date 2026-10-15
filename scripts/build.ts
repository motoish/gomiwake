import { buildSite, createCatalog, loadData } from "../src/site.ts";
const { schedules, pending, categoryProfiles } = await loadData();
await buildSite(schedules, pending, "dist", categoryProfiles);
console.log(
  `Built dist/: ${createCatalog(schedules).length} published calendars. Pending data and fixtures are excluded.`,
);
