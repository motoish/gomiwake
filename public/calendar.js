for (const button of document.querySelectorAll("[data-calendar-url]")) {
  const district = button.closest(".district");
  const status = district?.querySelector("[data-copy-status]");
  const name = district?.querySelector("[data-district-name]");
  const input = district?.querySelector("input");
  const details = district?.querySelector("details");
  if (!status || !name || !input || !details) continue;

  button.hidden = false;
  name.hidden = true;
  button.addEventListener("click", async () => {
    button.disabled = true;
    status.textContent = "";
    try {
      await navigator.clipboard.writeText(button.dataset.calendarUrl);
      status.textContent =
        "照会URLをコピーしました。カレンダーアプリに貼り付けてください。";
    } catch {
      details.open = true;
      input.focus();
      input.select();
      status.textContent =
        "コピーできませんでした。下のURLを手動でコピーしてください。";
    } finally {
      button.disabled = false;
    }
  });
}
