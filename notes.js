const noteForm = document.querySelector("#note-form");
const noteDanceNameInput = document.querySelector("#note-dance-name");
const noteStatusSelect = document.querySelector("#note-status");
const notesSearchInput = document.querySelector("#notes-search");
const notesSuggestionsEl = document.querySelector("#notes-dance-suggestions");
const notesKnowWellEl = document.querySelector("#notes-know-well");
const notesNeedPracticeEl = document.querySelector("#notes-need-practice");
const notesWantToLearnEl = document.querySelector("#notes-want-to-learn");

const LANE_CONFIG = {
  know_well: notesKnowWellEl,
  need_practice: notesNeedPracticeEl,
  want_to_learn: notesWantToLearnEl,
};

let notes = loadDanceNotes();
let playlists = loadPlaylists();

initNotesPage();

function initNotesPage() {
  wireLaneDnD();

  noteForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = cleanDanceName(noteDanceNameInput.value);
    const status = normalizeStatus(noteStatusSelect.value);
    if (!name) return;

    const key = normalizeKey(name);
    const existing = notes.find((note) => normalizeKey(note.name) === key);

    if (existing) {
      existing.name = name;
      existing.status = status;
    } else {
      notes.unshift({ id: createId(), name, status });
    }

    saveDanceNotes(notes);
    noteDanceNameInput.value = "";
    renderNotes();
  });

  notesSearchInput.addEventListener("input", renderNotes);
  populateSuggestions();
  renderNotes();
}

function wireLaneDnD() {
  Object.entries(LANE_CONFIG).forEach(([status, lane]) => {
    lane.dataset.status = status;

    lane.addEventListener("dragover", (event) => {
      event.preventDefault();
      lane.classList.add("drag-over");
    });

    lane.addEventListener("dragleave", () => {
      lane.classList.remove("drag-over");
    });

    lane.addEventListener("drop", (event) => {
      event.preventDefault();
      lane.classList.remove("drag-over");
      const noteId = event.dataTransfer?.getData("text/note-id");
      if (!noteId) return;
      const note = notes.find((item) => item.id === noteId);
      if (!note) return;
      note.status = status;
      saveDanceNotes(notes);
      renderNotes();
    });
  });
}

function populateSuggestions() {
  const fromPlaylists = playlists
    .flatMap((night) => night.sections)
    .flatMap((section) => section.dances)
    .map((dance) => dance.name);

  const fromNotes = notes.map((note) => note.name);
  const merged = [...new Set([...fromPlaylists, ...fromNotes].map((name) => cleanDanceName(name)).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b),
  );

  notesSuggestionsEl.innerHTML = "";
  merged.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    notesSuggestionsEl.appendChild(option);
  });
}

function renderNotes() {
  const query = notesSearchInput.value.trim().toLowerCase();
  const filtered = notes.filter((note) => note.name.toLowerCase().includes(query)).sort((a, b) => a.name.localeCompare(b.name));

  Object.values(LANE_CONFIG).forEach((lane) => {
    lane.innerHTML = "";
  });

  if (filtered.length === 0) {
    Object.values(LANE_CONFIG).forEach((lane) => {
      lane.innerHTML = `<p class="muted">No matching dances.</p>`;
    });
    return;
  }

  filtered.forEach((note) => {
    const status = normalizeStatus(note.status);
    const lane = LANE_CONFIG[status];
    if (!lane) return;

    const row = document.createElement("div");
    row.className = "compact-row";
    row.draggable = true;
    row.dataset.noteId = note.id;

    const title = document.createElement("p");
    title.className = "compact-row-title";
    title.textContent = note.name;

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "icon-delete";
    deleteBtn.title = "Delete note";
    deleteBtn.setAttribute("aria-label", `Delete ${note.name}`);
    deleteBtn.textContent = "✕";

    row.addEventListener("dragstart", (event) => {
      event.dataTransfer?.setData("text/note-id", note.id);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      row.classList.add("dragging");
    });

    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      Object.values(LANE_CONFIG).forEach((container) => container.classList.remove("drag-over"));
    });

    deleteBtn.addEventListener("click", () => {
      notes = notes.filter((n) => n.id !== note.id);
      saveDanceNotes(notes);
      renderNotes();
      populateSuggestions();
    });

    row.append(title, deleteBtn);
    lane.appendChild(row);
  });

  fillLaneEmpties();
}

function fillLaneEmpties() {
  if (!notesKnowWellEl.firstChild) notesKnowWellEl.innerHTML = `<p class="muted">No dances here yet.</p>`;
  if (!notesNeedPracticeEl.firstChild) notesNeedPracticeEl.innerHTML = `<p class="muted">No dances here yet.</p>`;
  if (!notesWantToLearnEl.firstChild) notesWantToLearnEl.innerHTML = `<p class="muted">No dances here yet.</p>`;
}

function normalizeStatus(value) {
  if (value === "know_well") return "know_well";
  if (value === "need_practice") return "need_practice";
  return "want_to_learn";
}
