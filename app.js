const form = document.querySelector("#playlist-form");
const dateInput = document.querySelector("#playlist-date");
const venueInput = document.querySelector("#playlist-venue");
const sectionSelect = document.querySelector("#section-select");
const customSectionWrap = document.querySelector("#custom-section-wrap");
const customSectionInput = document.querySelector("#custom-section");
const danceLinesInput = document.querySelector("#dance-lines");
const playlistImageInput = document.querySelector("#playlist-image");
const readImageBtn = document.querySelector("#read-image-btn");
const ocrStatusEl = document.querySelector("#ocr-status");
const addLinesBtn = document.querySelector("#add-lines-btn");
const clearCurrentBtn = document.querySelector("#clear-current");
const recalcBtn = document.querySelector("#recalc-btn");

const statsTopNInput = document.querySelector("#stats-top-n");
const statsSectionTopNInput = document.querySelector("#stats-section-top-n");
const statsRankModeSelect = document.querySelector("#stats-rank-mode");
const statsMinNightsInput = document.querySelector("#stats-min-nights");
const statsBeginnerFilterSelect = document.querySelector("#stats-beginner-filter");
const statsSectionsFilterEl = document.querySelector("#stats-sections-filter");

const currentSectionsEl = document.querySelector("#current-sections");
const emptyCurrentEl = document.querySelector("#empty-current");
const summaryCardsEl = document.querySelector("#summary-cards");
const topDancesTitleEl = document.querySelector("#top-dances-title");
const topDancesEl = document.querySelector("#top-dances");
const sectionTopDancesTitleEl = document.querySelector("#section-top-dances-title");
const sectionTopDancesEl = document.querySelector("#section-top-dances");
const savedPlaylistsEl = document.querySelector("#saved-playlists");

let currentSections = [];
let playlists = loadPlaylists();
let danceMeta = loadDanceMeta();
let imageReadInProgress = false;
let statsSectionFiltersInitialized = false;
const statsFilters = {
  topN: 10,
  sectionTopN: 5,
  rankMode: "plays",
  minNights: 1,
  beginnerFilter: "all",
  includedSections: new Set(getAllSectionNames(playlists)),
};

init();

function init() {
  dateInput.value = new Date().toISOString().slice(0, 10);
  wireEvents();
  syncStatsSectionFilterOptions();
  renderCurrentSections();
  renderSavedPlaylists();
  renderStats();
}

function wireEvents() {
  sectionSelect.addEventListener("change", () => {
    const custom = sectionSelect.value === "Custom";
    customSectionWrap.classList.toggle("hidden", !custom);
    if (!custom) customSectionInput.value = "";
  });

  addLinesBtn.addEventListener("click", addSectionBlockToCurrentNight);
  readImageBtn.addEventListener("click", importFromImage);
  clearCurrentBtn.addEventListener("click", () => {
    currentSections = [];
    renderCurrentSections();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    saveCurrentNight();
  });

  recalcBtn.addEventListener("click", renderStats);
  statsTopNInput.addEventListener("change", onStatsFilterChange);
  statsSectionTopNInput.addEventListener("change", onStatsFilterChange);
  statsRankModeSelect.addEventListener("change", onStatsFilterChange);
  statsMinNightsInput.addEventListener("change", onStatsFilterChange);
  statsBeginnerFilterSelect.addEventListener("change", onStatsFilterChange);
  statsSectionsFilterEl.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== "checkbox") return;
    if (target.checked) statsFilters.includedSections.add(target.value);
    if (!target.checked) statsFilters.includedSections.delete(target.value);
    renderStats();
  });
}

function addSectionBlockToCurrentNight() {
  const sectionName = resolveSection();
  if (!sectionName) {
    alert("Please enter a custom section name.");
    return;
  }

  const dances = parseDanceLines(danceLinesInput.value)
    .filter((name) => !shouldIgnoreDance(name, sectionName))
    .map((name) => ({ id: createId(), name }));

  if (dances.length === 0) {
    alert("Add at least one valid dance name.");
    return;
  }

  const existing = currentSections.find((section) => normalizeKey(section.name) === normalizeKey(sectionName));
  if (existing) existing.dances.push(...dances);
  if (!existing) currentSections.push({ id: createId(), name: sectionName, dances });

  danceLinesInput.value = "";
  renderCurrentSections();
}

async function importFromImage() {
  if (imageReadInProgress) return;

  const file = playlistImageInput.files?.[0];
  if (!file) {
    setOcrStatus("Choose a photo first.");
    return;
  }

  if (!window.Tesseract?.recognize) {
    setOcrStatus("OCR library failed to load. Refresh and try again.");
    return;
  }

  imageReadInProgress = true;
  readImageBtn.disabled = true;
  setOcrStatus("Reading photo...");

  try {
    const result = await window.Tesseract.recognize(file, "eng", {
      logger: (msg) => {
        if (msg.status === "recognizing text" && typeof msg.progress === "number") {
          setOcrStatus(`Reading photo... ${Math.round(msg.progress * 100)}%`);
        }
      },
    });

    const parsedEntries = parseEntriesFromOcr(result?.data?.text || "");
    if (parsedEntries.length === 0) {
      setOcrStatus("No dance names found. Try a clearer, closer photo.");
      return;
    }

    parsedEntries.forEach((entry) => {
      const existing = currentSections.find((section) => normalizeKey(section.name) === normalizeKey(entry.section));
      const dance = { id: createId(), name: entry.name };
      if (existing) existing.dances.push(dance);
      if (!existing) currentSections.push({ id: createId(), name: entry.section, dances: [dance] });
    });

    renderCurrentSections();
    setOcrStatus(`Added ${parsedEntries.length} dances from photo.`);
    playlistImageInput.value = "";
  } catch {
    setOcrStatus("Could not read this image. Try another photo.");
  } finally {
    imageReadInProgress = false;
    readImageBtn.disabled = false;
  }
}

function parseEntriesFromOcr(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const entries = [];
  let section = "After Lesson 3";

  lines.forEach((line) => {
    const normalized = line.toLowerCase();
    const inlineLesson = line.match(/^lesson\s*([123])\s*[:\-]\s*(.+)$/i);
    if (inlineLesson) {
      section = `After Lesson ${inlineLesson[1]}`;
      const dance = cleanDanceName(inlineLesson[2]);
      if (isDanceCandidate(dance) && !shouldIgnoreDance(dance, section)) entries.push({ section, name: dance });
      return;
    }

    if (/warm\s*up/.test(normalized)) return (section = "Warm Up");
    if (/lesson\s*1\b/.test(normalized)) return (section = "After Lesson 1");
    if (/lesson\s*2\b/.test(normalized)) return (section = "After Lesson 2");
    if (/lesson\s*3\b/.test(normalized)) return (section = "After Lesson 3");
    if (/swing\b/.test(normalized)) return (section = "Swing Block");
    if (isMetaNoise(normalized)) return;

    const dance = cleanDanceName(line);
    if (!isDanceCandidate(dance) || shouldIgnoreDance(dance, section)) return;
    entries.push({ section, name: dance });
  });

  return entries;
}

function saveCurrentNight() {
  if (!dateInput.value) {
    alert("Please choose a date.");
    return;
  }

  const cleaned = sanitizeSections(currentSections);
  if (cleaned.length === 0) {
    alert("Please add at least one section block before saving.");
    return;
  }

  const playlist = {
    id: createId(),
    date: dateInput.value,
    venue: venueInput.value.trim(),
    sections: cleaned,
  };

  playlists = [playlist, ...playlists].sort((a, b) => b.date.localeCompare(a.date));
  savePlaylists(playlists);
  syncStatsSectionFilterOptions();

  currentSections = [];
  venueInput.value = "";
  renderCurrentSections();
  renderSavedPlaylists();
  renderStats();
}

function renderCurrentSections() {
  currentSectionsEl.innerHTML = "";
  if (currentSections.length === 0) {
    emptyCurrentEl.classList.remove("hidden");
    return;
  }

  emptyCurrentEl.classList.add("hidden");
  currentSections.forEach((section) => currentSectionsEl.appendChild(renderSectionEditorCard(section, true)));
}

function renderSavedPlaylists() {
  savedPlaylistsEl.innerHTML = "";
  if (playlists.length === 0) {
    savedPlaylistsEl.innerHTML = `<p class="muted">No saved playlists yet.</p>`;
    return;
  }

  playlists.forEach((playlist) => {
    const card = document.createElement("article");
    card.className = "history-item";

    const header = document.createElement("div");
    header.className = "history-main";
    header.innerHTML = `
      <p class="history-date">${escapeHtml(formatDate(playlist.date))}</p>
      <p class="history-venue">${escapeHtml(playlist.venue || "No venue entered")}</p>
      <p class="history-count">${countDances(playlist.sections)} dances in ${playlist.sections.length} section blocks</p>
    `;

    const actions = document.createElement("div");
    actions.className = "history-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "secondary";
    editBtn.textContent = "Edit Playlist";

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "danger";
    deleteBtn.textContent = "Delete";

    actions.append(editBtn, deleteBtn);

    const details = document.createElement("details");
    details.innerHTML = `<summary>View dances</summary>`;
    details.appendChild(renderSectionGroups(playlist.sections));

    const editor = buildPlaylistEditor(playlist);

    editBtn.addEventListener("click", () => {
      editor.classList.toggle("hidden");
    });

    deleteBtn.addEventListener("click", () => {
      playlists = playlists.filter((p) => p.id !== playlist.id);
      savePlaylists(playlists);
      syncStatsSectionFilterOptions();
      renderSavedPlaylists();
      renderStats();
    });

    card.append(header, actions, details, editor);
    savedPlaylistsEl.appendChild(card);
  });
}

function buildPlaylistEditor(playlist) {
  const editor = document.createElement("div");
  editor.className = "hidden playlist-editor";

  const dateLabel = document.createElement("label");
  dateLabel.textContent = "Date";
  const dateInputEdit = document.createElement("input");
  dateInputEdit.type = "date";
  dateInputEdit.value = playlist.date;
  dateLabel.appendChild(dateInputEdit);

  const venueLabel = document.createElement("label");
  venueLabel.textContent = "Venue / Event";
  const venueInputEdit = document.createElement("input");
  venueInputEdit.type = "text";
  venueInputEdit.value = playlist.venue;
  venueLabel.appendChild(venueInputEdit);

  const topGrid = document.createElement("div");
  topGrid.className = "field-grid";
  topGrid.append(dateLabel, venueLabel);

  const sectionsWrap = document.createElement("div");
  sectionsWrap.className = "edit-sections-wrap";

  let draft = deepCopySections(playlist.sections);

  const renderDraft = () => {
    sectionsWrap.innerHTML = "";
    draft.forEach((section) => {
      const block = document.createElement("div");
      block.className = "edit-block";

      const picker = createSectionPicker(section.name);
      picker.container.classList.add("section-picker-inline");

      const textarea = document.createElement("textarea");
      textarea.rows = 5;
      textarea.value = section.dances.map((d) => d.name).join("\n");

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "danger";
      removeBtn.textContent = "Remove Section";

      picker.select.addEventListener("change", () => {
        picker.syncCustomVisibility();
        section.name = picker.getValue();
      });
      picker.customInput.addEventListener("input", () => {
        section.name = picker.getValue();
      });
      textarea.addEventListener("input", () => {
        section.dances = parseDanceLines(textarea.value).map((name) => ({ id: createId(), name }));
      });
      removeBtn.addEventListener("click", () => {
        draft = draft.filter((s) => s.id !== section.id);
        renderDraft();
      });

      block.append(picker.container, textarea, removeBtn);
      sectionsWrap.appendChild(block);
    });
  };

  const addSectionBtn = document.createElement("button");
  addSectionBtn.type = "button";
  addSectionBtn.className = "secondary";
  addSectionBtn.textContent = "Add Section";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.textContent = "Save Changes";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "secondary";
  cancelBtn.textContent = "Cancel";

  addSectionBtn.addEventListener("click", () => {
    draft.push({ id: createId(), name: "Warm Up", dances: [] });
    renderDraft();
  });

  cancelBtn.addEventListener("click", () => {
    editor.classList.add("hidden");
  });

  saveBtn.addEventListener("click", () => {
    if (!dateInputEdit.value) return alert("Playlist date is required.");
    const cleaned = sanitizeSections(draft);
    if (cleaned.length === 0) return alert("Playlist must have at least one section with dances.");

    playlist.date = dateInputEdit.value;
    playlist.venue = venueInputEdit.value.trim();
    playlist.sections = cleaned;
    playlists.sort((a, b) => b.date.localeCompare(a.date));

    savePlaylists(playlists);
    syncStatsSectionFilterOptions();
    renderSavedPlaylists();
    renderStats();
  });

  const actions = document.createElement("div");
  actions.className = "history-actions";
  actions.append(addSectionBtn, saveBtn, cancelBtn);

  editor.append(topGrid, sectionsWrap, actions);
  renderDraft();
  return editor;
}

function renderSectionEditorCard(section) {
  const card = document.createElement("article");
  card.className = "section-card";

  const title = document.createElement("p");
  title.className = "section-title";
  title.textContent = section.name;

  const meta = document.createElement("p");
  meta.className = "section-meta";
  meta.textContent = `${section.dances.length} dance${section.dances.length === 1 ? "" : "s"}`;

  const list = document.createElement("ul");
  list.className = "mini-dance-list";
  section.dances.forEach((dance) => {
    const li = document.createElement("li");
    li.textContent = dance.name;
    list.appendChild(li);
  });

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "secondary";
  editBtn.textContent = "Edit Block";

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "danger";
  removeBtn.textContent = "Remove Block";

  const actions = document.createElement("div");
  actions.className = "history-actions";
  actions.append(editBtn, removeBtn);

  const editor = document.createElement("div");
  editor.className = "hidden section-editor";

  const picker = createSectionPicker(section.name);
  picker.container.classList.add("section-picker-inline");

  const textarea = document.createElement("textarea");
  textarea.rows = 5;
  textarea.value = section.dances.map((dance) => dance.name).join("\n");

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.textContent = "Apply Block Changes";

  picker.select.addEventListener("change", () => picker.syncCustomVisibility());

  editBtn.addEventListener("click", () => {
    const refreshed = createSectionPicker(section.name);
    picker.select.value = refreshed.select.value;
    picker.customInput.value = refreshed.customInput.value;
    picker.syncCustomVisibility();
    textarea.value = section.dances.map((dance) => dance.name).join("\n");
    editor.classList.toggle("hidden");
  });

  saveBtn.addEventListener("click", () => {
    const newName = picker.getValue();
    if (!newName) return alert("Section name cannot be empty.");

    const dances = parseDanceLines(textarea.value)
      .filter((name) => !shouldIgnoreDance(name, newName))
      .map((name) => ({ id: createId(), name }));

    if (dances.length === 0) return alert("Section needs at least one valid dance.");

    section.name = newName;
    section.dances = dances;
    renderCurrentSections();
  });

  removeBtn.addEventListener("click", () => {
    currentSections = currentSections.filter((s) => s.id !== section.id);
    renderCurrentSections();
  });

  editor.append(picker.container, textarea, saveBtn);
  card.append(title, meta, list, actions, editor);
  return card;
}

function renderSectionGroups(sections) {
  const wrap = document.createElement("div");
  wrap.className = "grouped-sections";

  sections.forEach((section) => {
    const card = document.createElement("article");
    card.className = "section-card compact";
    card.innerHTML = `<p class="section-title">${escapeHtml(section.name)}</p>`;
    const list = document.createElement("ul");
    list.className = "mini-dance-list";
    section.dances.forEach((dance) => {
      const li = document.createElement("li");
      li.textContent = dance.name;
      list.appendChild(li);
    });
    card.appendChild(list);
    wrap.appendChild(card);
  });

  return wrap;
}

function onStatsFilterChange() {
  statsFilters.topN = clampNumber(statsTopNInput.value, 1, 50, 10);
  statsFilters.sectionTopN = clampNumber(statsSectionTopNInput.value, 1, 20, 5);
  statsFilters.minNights = clampNumber(statsMinNightsInput.value, 1, 99, 1);
  statsFilters.rankMode = statsRankModeSelect.value === "nights" ? "nights" : "plays";
  statsFilters.beginnerFilter = ["all", "beginner_only", "exclude_beginner"].includes(statsBeginnerFilterSelect.value)
    ? statsBeginnerFilterSelect.value
    : "all";

  statsTopNInput.value = String(statsFilters.topN);
  statsSectionTopNInput.value = String(statsFilters.sectionTopN);
  statsMinNightsInput.value = String(statsFilters.minNights);
  statsRankModeSelect.value = statsFilters.rankMode;
  statsBeginnerFilterSelect.value = statsFilters.beginnerFilter;
  renderStats();
}

function syncStatsSectionFilterOptions() {
  const sections = getAllSectionNames(playlists);
  if (sections.length === 0) {
    statsSectionsFilterEl.innerHTML = `<p class="muted">Add playlists to filter by section.</p>`;
    return;
  }

  const validKeys = new Set(sections.map((section) => normalizeKey(section)));
  statsFilters.includedSections = new Set(
    Array.from(statsFilters.includedSections).filter((name) => validKeys.has(normalizeKey(name))),
  );

  if (!statsSectionFiltersInitialized && statsFilters.includedSections.size === 0) {
    sections.forEach((section) => statsFilters.includedSections.add(section));
  }
  statsSectionFiltersInitialized = true;

  statsSectionsFilterEl.innerHTML = "";
  sections.forEach((section) => {
    const label = document.createElement("label");
    label.className = "stats-section-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = section;
    checkbox.checked = statsFilters.includedSections.has(section);
    const text = document.createElement("span");
    text.textContent = section;
    label.append(checkbox, text);
    statsSectionsFilterEl.appendChild(label);
  });
}

function passesBeginnerFilter(danceName, filter) {
  const key = normalizeKey(danceName);
  const beginner = Boolean(danceMeta[key]?.beginner);
  if (filter === "beginner_only") return beginner;
  if (filter === "exclude_beginner") return !beginner;
  return true;
}

function computeStats(filters) {
  const includedSections = new Set(Array.from(filters.includedSections).map((name) => normalizeKey(name)));
  const danceMap = new Map();
  const bySectionMap = new Map();
  let totalEntries = 0;
  let includedNights = 0;

  playlists.forEach((night) => {
    const seenNight = new Set();
    let nightHasData = false;

    night.sections.forEach((section) => {
      if (!includedSections.has(normalizeKey(section.name))) return;

      const sectionKey = section.name.trim() || "After Lesson 3";
      if (!bySectionMap.has(sectionKey)) bySectionMap.set(sectionKey, new Map());
      const sectionDanceMap = bySectionMap.get(sectionKey);
      const sectionSeenNight = new Set();

      section.dances.forEach((dance) => {
        if (shouldIgnoreDance(dance.name, section.name)) return;
        if (!passesBeginnerFilter(dance.name, filters.beginnerFilter)) return;

        nightHasData = true;
        totalEntries += 1;

        const danceKey = normalizeKey(dance.name);
        if (!danceMap.has(danceKey)) {
          danceMap.set(danceKey, {
            name: dance.name,
            count: 0,
            nightsPlayed: 0,
          });
        }

        const item = danceMap.get(danceKey);
        item.count += 1;
        if (!seenNight.has(danceKey)) {
          item.nightsPlayed += 1;
          seenNight.add(danceKey);
        }

        if (!sectionDanceMap.has(danceKey)) {
          sectionDanceMap.set(danceKey, {
            name: dance.name,
            count: 0,
            nightsPlayed: 0,
          });
        }
        const sectionItem = sectionDanceMap.get(danceKey);
        sectionItem.count += 1;
        if (!sectionSeenNight.has(danceKey)) {
          sectionItem.nightsPlayed += 1;
          sectionSeenNight.add(danceKey);
        }
      });
    });

    if (nightHasData) includedNights += 1;
  });

  const rankings = Array.from(danceMap.values())
    .map((item) => ({
      ...item,
      appearanceRate: includedNights ? Math.round((item.nightsPlayed / includedNights) * 100) : 0,
    }))
    .filter((item) => item.nightsPlayed >= filters.minNights)
    .sort((a, b) => sortRankItems(a, b, filters.rankMode));

  const bySectionRankings = Array.from(bySectionMap.entries())
    .map(([section, map]) => ({
      section,
      dances: Array.from(map.values())
        .filter((item) => item.nightsPlayed >= filters.minNights)
        .sort((a, b) => sortRankItems(a, b, filters.rankMode)),
    }))
    .filter((item) => item.dances.length > 0)
    .sort((a, b) => toSectionLevel(a.section) - toSectionLevel(b.section) || a.section.localeCompare(b.section));

  return {
    totalNights: playlists.length,
    includedNights,
    totalEntries,
    uniqueDances: rankings.length,
    rankings,
    bySectionRankings,
  };
}

function renderStats() {
  danceMeta = loadDanceMeta();
  const stats = computeStats(statsFilters);
  const metricLabel = statsFilters.rankMode === "nights" ? "night(s)" : "time(s)";

  topDancesTitleEl.textContent = `Top ${statsFilters.topN} Most Frequently Played Overall`;
  sectionTopDancesTitleEl.textContent = `Most Frequently Played by Section (Top ${statsFilters.sectionTopN})`;

  summaryCardsEl.innerHTML = "";
  const cards = [
    ["Saved nights", String(stats.totalNights)],
    ["Included nights", String(stats.includedNights)],
    ["Total entries", String(stats.totalEntries)],
    ["Unique dances", String(stats.uniqueDances)],
  ];
  cards.forEach(([title, value]) => {
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `<p class="card-title">${title}</p><p class="card-value">${value}</p>`;
    summaryCardsEl.appendChild(card);
  });

  topDancesEl.innerHTML = "";
  if (stats.rankings.length === 0) {
    topDancesEl.innerHTML = `<li class="muted">No dances match these filters.</li>`;
  } else {
    const maxMetric = getRankMetric(stats.rankings[0], statsFilters.rankMode);
    stats.rankings.slice(0, statsFilters.topN).forEach((dance, idx) => {
      const li = document.createElement("li");
      const metric = getRankMetric(dance, statsFilters.rankMode);
      const pct = maxMetric ? Math.round((metric / maxMetric) * 100) : 0;
      li.innerHTML = `
        <div><strong>#${idx + 1} ${escapeHtml(dance.name)}</strong></div>
        <div class="muted">${metric} ${metricLabel}, ${dance.count} total plays, appearance rate ${dance.appearanceRate}%</div>
        <div class="bar-wrap"><div class="bar" style="width:${pct}%"></div></div>
      `;
      topDancesEl.appendChild(li);
    });
  }

  sectionTopDancesEl.innerHTML = "";
  if (statsFilters.includedSections.size === 0) {
    sectionTopDancesEl.innerHTML = `<p class="muted">Select at least one section.</p>`;
  } else if (stats.bySectionRankings.length === 0) {
    sectionTopDancesEl.innerHTML = `<p class="muted">No section stats for these filters.</p>`;
  } else {
    stats.bySectionRankings.forEach((section) => {
      const card = document.createElement("article");
      card.className = "section-card compact";
      const title = document.createElement("p");
      title.className = "section-title";
      title.textContent = section.section;
      const list = document.createElement("ol");
      list.className = "mini-dance-list";
      section.dances.slice(0, statsFilters.sectionTopN).forEach((dance) => {
        const li = document.createElement("li");
        li.textContent = `${dance.name} (${getRankMetric(dance, statsFilters.rankMode)} ${metricLabel})`;
        list.appendChild(li);
      });
      card.append(title, list);
      sectionTopDancesEl.appendChild(card);
    });
  }
}

function createSectionPicker(initialName) {
  const container = document.createElement("div");
  container.className = "section-picker";

  const select = document.createElement("select");
  SECTION_PRESETS.forEach((preset) => {
    const option = document.createElement("option");
    option.value = preset;
    option.textContent = preset;
    select.appendChild(option);
  });

  const customOpt = document.createElement("option");
  customOpt.value = "__custom__";
  customOpt.textContent = "Custom...";
  select.appendChild(customOpt);

  const customInput = document.createElement("input");
  customInput.type = "text";
  customInput.placeholder = "Custom section name";
  customInput.className = "hidden";

  const preset = SECTION_PRESETS.find((p) => normalizeKey(p) === normalizeKey(initialName || ""));
  if (preset) select.value = preset;
  if (!preset && initialName) {
    select.value = "__custom__";
    customInput.value = initialName;
    customInput.classList.remove("hidden");
  }
  if (!preset && !initialName) select.value = SECTION_PRESETS[0];

  const syncCustomVisibility = () => {
    customInput.classList.toggle("hidden", select.value !== "__custom__");
  };

  const getValue = () => (select.value === "__custom__" ? customInput.value.trim() : select.value);
  container.append(select, customInput);
  return { container, select, customInput, syncCustomVisibility, getValue };
}

function deepCopySections(sections) {
  return sections.map((section) => ({
    id: createId(),
    name: section.name,
    dances: section.dances.map((dance) => ({ id: createId(), name: dance.name })),
  }));
}

function countDances(sections) {
  return sections.reduce((sum, section) => sum + section.dances.length, 0);
}

function resolveSection() {
  if (sectionSelect.value !== "Custom") return sectionSelect.value;
  return customSectionInput.value.trim() || "";
}

function setOcrStatus(message) {
  ocrStatusEl.textContent = message;
}

function isMetaNoise(line) {
  return (
    /tonight'?s playlist/.test(line) ||
    /follow us/.test(line) ||
    /instagram/.test(line) ||
    /admission/.test(line) ||
    /commissioner/.test(line) ||
    /scan/.test(line) ||
    /qr/.test(line)
  );
}

function isDanceCandidate(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return false;
  if (trimmed.length < 2) return false;
  if (/^(warm up|lesson\s*[123])$/i.test(trimmed)) return false;
  if (/^[\W_]+$/.test(trimmed)) return false;
  return true;
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function getRankMetric(item, mode) {
  return mode === "nights" ? item.nightsPlayed : item.count;
}

function sortRankItems(a, b, mode) {
  return getRankMetric(b, mode) - getRankMetric(a, mode) || b.count - a.count || a.name.localeCompare(b.name);
}
