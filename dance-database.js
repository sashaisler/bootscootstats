const dbSearchInput = document.querySelector("#db-search");
const dbSectionFilter = document.querySelector("#db-section-filter");
const dbBeginnerFilter = document.querySelector("#db-beginner-filter");
const dbMinPlaysInput = document.querySelector("#db-min-plays");
const dbResultsEl = document.querySelector("#db-results");

let playlists = loadPlaylists();
let danceMeta = loadDanceMeta();

initDatabasePage();

function initDatabasePage() {
  populateSectionFilter();
  wireDbEvents();
  renderDatabase();
}

function wireDbEvents() {
  dbSearchInput.addEventListener("input", renderDatabase);
  dbSectionFilter.addEventListener("change", renderDatabase);
  dbBeginnerFilter.addEventListener("change", renderDatabase);
  dbMinPlaysInput.addEventListener("change", renderDatabase);
}

function populateSectionFilter() {
  const sections = getAllSectionNames(playlists);
  sections.forEach((section) => {
    const option = document.createElement("option");
    option.value = section;
    option.textContent = section;
    dbSectionFilter.appendChild(option);
  });
}

function buildDanceRows() {
  const byDance = new Map();

  playlists.forEach((night) => {
    night.sections.forEach((section) => {
      section.dances.forEach((dance) => {
        if (shouldIgnoreDance(dance.name, section.name)) return;

        const key = normalizeKey(dance.name);
        if (!byDance.has(key)) {
          byDance.set(key, {
            key,
            name: dance.name,
            plays: 0,
            nights: new Set(),
            sections: new Map(),
          });
        }

        const row = byDance.get(key);
        row.plays += 1;
        row.nights.add(night.id);
        row.sections.set(section.name, (row.sections.get(section.name) || 0) + 1);
      });
    });
  });

  return Array.from(byDance.values()).map((row) => ({
    ...row,
    nightsPlayed: row.nights.size,
    sectionList: Array.from(row.sections.entries()).sort(
      (a, b) => toSectionLevel(a[0]) - toSectionLevel(b[0]) || a[0].localeCompare(b[0]),
    ),
    beginner: Boolean(danceMeta[row.key]?.beginner),
  }));
}

function renderDatabase() {
  danceMeta = loadDanceMeta();
  const query = dbSearchInput.value.trim().toLowerCase();
  const sectionFilter = dbSectionFilter.value;
  const beginnerFilter = dbBeginnerFilter.value;
  const minPlays = Math.max(1, Number(dbMinPlaysInput.value) || 1);

  const rows = buildDanceRows()
    .filter((row) => row.name.toLowerCase().includes(query))
    .filter((row) => row.plays >= minPlays)
    .filter((row) => {
      if (sectionFilter === "all") return true;
      return row.sectionList.some(([sectionName]) => normalizeKey(sectionName) === normalizeKey(sectionFilter));
    })
    .filter((row) => {
      if (beginnerFilter === "beginner_only") return row.beginner;
      if (beginnerFilter === "exclude_beginner") return !row.beginner;
      return true;
    })
    .sort((a, b) => b.plays - a.plays || a.name.localeCompare(b.name));

  dbResultsEl.innerHTML = "";
  if (rows.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="4" class="muted">No dances match these filters.</td>`;
    dbResultsEl.appendChild(tr);
    return;
  }

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.className = "db-row";

    const beginnerLabel = document.createElement("label");
    beginnerLabel.className = "db-beginner-toggle";
    const beginnerCheckbox = document.createElement("input");
    beginnerCheckbox.type = "checkbox";
    beginnerCheckbox.checked = row.beginner;
    const beginnerText = document.createElement("span");
    beginnerText.textContent = "Beginner";
    beginnerLabel.append(beginnerCheckbox, beginnerText);

    beginnerCheckbox.addEventListener("change", () => {
      const next = { ...danceMeta };
      next[row.key] = {
        name: row.name,
        beginner: beginnerCheckbox.checked,
      };
      danceMeta = next;
      saveDanceMeta(danceMeta);
      renderDatabase();
    });

    const sectionText = row.sectionList.map(([name, count]) => `${name} (${count})`).join(", ");
    tr.innerHTML = `
      <td>${escapeHtml(row.name)}</td>
      <td>${row.plays}</td>
      <td>${escapeHtml(sectionText)}</td>
      <td></td>
    `;
    tr.children[3].appendChild(beginnerLabel);
    dbResultsEl.appendChild(tr);
  });
}
