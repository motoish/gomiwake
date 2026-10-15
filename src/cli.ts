import { createCatalog, loadData } from "./site.ts";
try {
  if (process.argv.length !== 3 || process.argv[2] !== "validate")
    throw new Error("Usage: bun src/cli.ts validate");
  const { schedules, pending } = await loadData();
  const catalog = createCatalog(schedules);
  console.log(
    `${schedules.length} verified schedule files; ${catalog.length} publishable districts; ${pending.length} pending areas`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
