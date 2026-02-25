const PLAYLISTS_KEY = "bootscootstats.playlists.v2";
const LEGACY_PLAYLISTS_KEY = "bootscootstats.playlists.v1";
const DANCE_META_KEY = "bootscootstats.danceMeta.v1";
const DANCE_NOTES_KEY = "bootscootstats.danceNotes.v1";
const SECTION_PRESETS = ["Warm Up", "After Lesson 1", "After Lesson 2", "After Lesson 3"];

function createId() {
  return crypto.randomUUID();
}

function normalizeKey(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cleanDanceName(raw) {
  return String(raw || "").replace(/^\d+[.)]\s*/, "").replace(/\[(.*?)\]/g, "").trim();
}

function shouldIgnoreDance(name, section) {
  return `${name} ${section}`.toLowerCase().includes("swing");
}

function parseDanceLines(text) {
  return String(text || "")
    .split("\n")
    .map((line) => cleanDanceName(line))
    .filter(Boolean);
}

function sanitizeSections(sections) {
  return (Array.isArray(sections) ? sections : [])
    .map((section) => {
      const name = normalizeSectionName(section.name);
      const dances = (Array.isArray(section.dances) ? section.dances : [])
        .map((dance) => String(dance.name || "").trim())
        .filter(Boolean)
        .filter((danceName) => !shouldIgnoreDance(danceName, name))
        .map((danceName) => ({ id: createId(), name: danceName }));
      return { id: createId(), name, dances };
    })
    .filter((section) => section.name && section.dances.length > 0);
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadPlaylists() {
  const v2 = loadJson(PLAYLISTS_KEY, null);
  if (Array.isArray(v2)) {
    return v2
      .map((night) => ({
        id: night.id || createId(),
        date: night.date,
        venue: String(night.venue || ""),
        sections: sanitizeSections(night.sections),
      }))
      .filter((night) => night.date && night.sections.length > 0);
  }

  const v1 = loadJson(LEGACY_PLAYLISTS_KEY, []);
  if (!Array.isArray(v1)) return [];

  const migrated = v1
    .map((night) => {
      const grouped = new Map();
      (Array.isArray(night.dances) ? night.dances : []).forEach((dance) => {
        const section = normalizeSectionName(dance.section || "After Lesson 3");
        const name = String(dance.name || "").trim();
        if (!name || shouldIgnoreDance(name, section)) return;
        const key = normalizeKey(section);
        if (!grouped.has(key)) grouped.set(key, { id: createId(), name: section, dances: [] });
        grouped.get(key).dances.push({ id: createId(), name });
      });
      return {
        id: night.id || createId(),
        date: night.date,
        venue: String(night.venue || ""),
        sections: sanitizeSections(Array.from(grouped.values())),
      };
    })
    .filter((night) => night.date && night.sections.length > 0);

  savePlaylists(migrated);
  return migrated;
}

function savePlaylists(playlists) {
  saveJson(PLAYLISTS_KEY, playlists);
}

function loadDanceMeta() {
  return loadJson(DANCE_META_KEY, {});
}

function saveDanceMeta(meta) {
  saveJson(DANCE_META_KEY, meta || {});
}

function loadDanceNotes() {
  const notes = loadJson(DANCE_NOTES_KEY, []);
  return Array.isArray(notes) ? notes : [];
}

function saveDanceNotes(notes) {
  saveJson(DANCE_NOTES_KEY, Array.isArray(notes) ? notes : []);
}

function getAllSectionNames(playlists) {
  const dynamic = playlists.flatMap((night) => night.sections.map((section) => section.name.trim())).filter(Boolean);
  return [...new Set([...SECTION_PRESETS, ...dynamic])].sort(
    (a, b) => toSectionLevel(a) - toSectionLevel(b) || a.localeCompare(b),
  );
}

function normalizeSectionName(value) {
  const name = String(value || "").trim();
  if (!name) return "After Lesson 3";
  if (normalizeKey(name) === "open dancing") return "After Lesson 3";
  return name;
}

function toSectionLevel(section) {
  const normalized = String(section || "").toLowerCase();
  if (normalized.includes("warm")) return 1;
  if (normalized.includes("lesson 1")) return 2;
  if (normalized.includes("lesson 2")) return 3;
  if (normalized.includes("lesson 3")) return 4;
  return 5;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(value) {
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
