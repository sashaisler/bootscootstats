(function initDataTools() {
  const exportBtn = document.querySelector("#export-data-btn");
  const importBtn = document.querySelector("#import-data-btn");
  const importInput = document.querySelector("#import-data-file");
  const statusEl = document.querySelector("#data-tools-status");

  if (!exportBtn || !importBtn || !importInput || !statusEl) return;

  exportBtn.addEventListener("click", () => {
    try {
      const payload = exportAppData();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      anchor.href = url;
      anchor.download = `bootscootstats-backup-${stamp}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      statusEl.textContent = "Backup exported.";
    } catch {
      statusEl.textContent = "Could not export data.";
    }
  });

  importBtn.addEventListener("click", () => {
    importInput.click();
  });

  importInput.addEventListener("change", async () => {
    const file = importInput.files && importInput.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      importAppData(payload);
      statusEl.textContent = "Backup imported. Reloading...";
      window.setTimeout(() => {
        location.reload();
      }, 300);
    } catch {
      statusEl.textContent = "Could not import that file.";
    } finally {
      importInput.value = "";
    }
  });
})();
