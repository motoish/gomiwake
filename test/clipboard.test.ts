import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { setImmediate } from "node:timers/promises";

// Run the shipped script; only browser DOM and OS clipboard boundaries are supplied.
async function page(clipboard?: {
  writeText: (text: string) => Promise<void>;
}) {
  const rows = ["first", "second"].map((id) => {
    const status = { textContent: "" };
    const name = { hidden: false };
    const details = { open: false };
    const input = {
      value: `https://calendar.motoish.dev/sample-city/${id}.ics`,
      focused: false,
      selected: false,
      focus() {
        this.focused = true;
      },
      select() {
        this.selected = true;
      },
    };
    const fields: Record<string, unknown> = {
      "[data-copy-status]": status,
      "[data-district-name]": name,
      input: input,
      details: details,
    };
    const button = Object.assign(new EventTarget(), {
      dataset: { calendarUrl: input.value },
      hidden: true,
      disabled: false,
      closest: (selector: string) =>
        selector === ".district"
          ? { querySelector: (field: string) => fields[field] }
          : null,
    });
    return { button, status, name, details, input };
  });
  runInNewContext(
    await readFile(new URL("../public/calendar.js", import.meta.url), "utf8"),
    {
      document: {
        querySelectorAll: (selector: string) =>
          selector === "[data-calendar-url]"
            ? rows.map((row) => row.button)
            : [],
      },
      navigator: { clipboard },
    },
  );
  return rows;
}

test("each district click copies its HTTPS subscription URL and reports success only after completion", async () => {
  const copied: string[] = [];
  let complete: (() => void) | undefined;
  const rows = await page({
    writeText: (text) =>
      new Promise<void>((resolve) => {
        copied.push(text);
        complete = resolve;
      }),
  });
  for (const [index, expected] of [
    "https://calendar.motoish.dev/sample-city/first.ics",
    "https://calendar.motoish.dev/sample-city/second.ics",
  ].entries()) {
    const row = rows[index]!;
    assert.equal(row.button.hidden, false);
    assert.equal(row.name.hidden, true);
    row.button.dispatchEvent(new Event("click"));
    assert.equal(copied[index], expected);
    assert.equal(row.button.disabled, true);
    assert.equal(row.status.textContent, "");
    complete!();
    await setImmediate();
    assert.match(row.status.textContent, /コピーしました/);
    assert.equal(row.button.disabled, false);
    assert.equal(row.details.open, false);
  }
});

for (const mode of ["denied", "unavailable"]) {
  test(`clipboard ${mode} reveals and selects the manual URL without claiming success`, async () => {
    const [row] = await page(
      mode === "denied"
        ? {
            writeText: async () => {
              throw new Error("NotAllowedError");
            },
          }
        : undefined,
    );
    row!.button.dispatchEvent(new Event("click"));
    await setImmediate();
    assert.equal(row!.details.open, true);
    assert.equal(row!.input.focused, true);
    assert.equal(row!.input.selected, true);
    assert.match(row!.status.textContent, /手動でコピー/);
    assert.doesNotMatch(row!.status.textContent, /コピーしました/);
    assert.equal(
      row!.input.value,
      "https://calendar.motoish.dev/sample-city/first.ics",
    );
    assert.equal(row!.button.disabled, false);
  });
}
