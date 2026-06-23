const STORAGE_KEY = "weeklyPlayersApp.v1";
const CLOUD_RECORD_KEY = "PBBosses";
const APP_NAME = "Pickleball Boss Ladies";
const DEFAULT_LOCATION = "East County Pickleball Courts";
const palette = ["#55786c", "#1f6f78", "#c85d4a", "#a77823", "#426b9e", "#6b5b95"];
const supabaseConfig = window.PB_BOSSES_SUPABASE || {};
const cloudSyncEnabled =
  supabaseConfig.url &&
  supabaseConfig.anonKey &&
  !supabaseConfig.url.includes("PASTE_") &&
  !supabaseConfig.anonKey.includes("PASTE_");

const today = new Date();
const initialWednesday = getUpcomingWednesdayIso(today);

const starterState = {
  week: {
    date: initialWednesday,
    location: DEFAULT_LOCATION,
    notes: "Bring water. Confirm by Thursday evening.",
  },
  weeks: {},
  players: [
    {
      id: crypto.randomUUID(),
      name: "Maya Chen",
      contact: "maya@example.com",
      level: "Advanced",
      status: "active",
      notes: "Prefers doubles. Strong server.",
      response: "confirmed",
    },
    {
      id: crypto.randomUUID(),
      name: "Elena Brooks",
      contact: "555-0148",
      level: "Intermediate",
      status: "active",
      notes: "Can arrive early to help set up.",
      response: "maybe",
    },
    {
      id: crypto.randomUUID(),
      name: "Priya Shah",
      contact: "priya@example.com",
      level: "Intermediate",
      status: "active",
      notes: "Often brings a guest player.",
      response: "confirmed",
    },
    {
      id: crypto.randomUUID(),
      name: "Nora Davis",
      contact: "555-0192",
      level: "Beginner",
      status: "inactive",
      notes: "Traveling this month.",
      response: "out",
    },
  ],
};

let state = loadState();
let activeFilter = "all";
let searchTerm = "";
let activeView = "weekly";
let cloudSaveTimer;

const elements = {
  weekDate: document.querySelector("#weekDate"),
  weekLocation: document.querySelector("#weekLocation"),
  weekNotes: document.querySelector("#weekNotes"),
  newWeekButton: document.querySelector("#newWeekButton"),
  confirmedCount: document.querySelector("#confirmedCount"),
  maybeCount: document.querySelector("#maybeCount"),
  activeCount: document.querySelector("#activeCount"),
  weekList: document.querySelector("#weekList"),
  searchInput: document.querySelector("#searchInput"),
  syncStatus: document.querySelector("#syncStatus"),
  exportButton: document.querySelector("#exportButton"),
  addPlayerButton: document.querySelector("#addPlayerButton"),
  rosterAddPlayerButton: document.querySelector("#rosterAddPlayerButton"),
  playerBoard: document.querySelector("#playerBoard"),
  rosterList: document.querySelector("#rosterList"),
  playerDialog: document.querySelector("#playerDialog"),
  playerForm: document.querySelector("#playerForm"),
  dialogTitle: document.querySelector("#dialogTitle"),
  playerId: document.querySelector("#playerId"),
  playerName: document.querySelector("#playerName"),
  playerContact: document.querySelector("#playerContact"),
  playerLevel: document.querySelector("#playerLevel"),
  playerStatus: document.querySelector("#playerStatus"),
  playerNotes: document.querySelector("#playerNotes"),
  deletePlayerButton: document.querySelector("#deletePlayerButton"),
};

function toIsoDate(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function getUpcomingWednesdayIso(fromDate) {
  const date = new Date(fromDate);
  const day = date.getDay();
  const daysUntilWednesday = (3 - day + 7) % 7;
  date.setDate(date.getDate() + daysUntilWednesday);
  return toIsoDate(date);
}

function normalizeWednesdayIso(isoDate) {
  const date = new Date(`${isoDate || initialWednesday}T12:00:00`);
  if (Number.isNaN(date.getTime())) return initialWednesday;
  return getUpcomingWednesdayIso(date);
}

function getWednesdayDates(count = 8) {
  const dates = [];
  const start = new Date(`${getUpcomingWednesdayIso(today)}T12:00:00`);

  for (let index = 0; index < count; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index * 7);
    dates.push(toIsoDate(date));
  }

  if (state?.week?.date && !dates.includes(state.week.date)) {
    dates.unshift(state.week.date);
  }

  return dates;
}

function formatDateLabel(isoDate) {
  const date = new Date(`${isoDate}T12:00:00`);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "numeric",
    day: "numeric",
  }).format(date);
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return hydrateState(structuredClone(starterState));

  try {
    const parsed = JSON.parse(saved);
    return hydrateState({
      week: { ...starterState.week, ...parsed.week },
      weeks: parsed.weeks && typeof parsed.weeks === "object" ? parsed.weeks : {},
      players: Array.isArray(parsed.players) ? parsed.players : starterState.players,
    });
  } catch {
    return hydrateState(structuredClone(starterState));
  }
}

function hydrateState(nextState) {
  const weekDate = normalizeWednesdayIso(nextState.week?.date);
  nextState.week = { ...starterState.week, ...nextState.week, date: weekDate };
  nextState.weeks = nextState.weeks && typeof nextState.weeks === "object" ? nextState.weeks : {};

  if (!nextState.week.location || nextState.week.location === "Community center") {
    nextState.week.location = DEFAULT_LOCATION;
  }

  if (!nextState.weeks[weekDate]) {
    nextState.weeks[weekDate] = {
      location: nextState.week.location,
      notes: nextState.week.notes,
      responses: {},
    };
  }

  for (const week of Object.values(nextState.weeks)) {
    if (!week.location || week.location === "Community center") {
      week.location = DEFAULT_LOCATION;
    }
  }

  for (const player of nextState.players) {
    if (!nextState.weeks[weekDate].responses[player.id]) {
      nextState.weeks[weekDate].responses[player.id] = player.response || "maybe";
    }
  }

  return nextState;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  queueCloudSave();
}

function setSyncStatus(message, tone = "neutral") {
  elements.syncStatus.textContent = message;
  elements.syncStatus.dataset.tone = tone;
}

function cloudHeaders() {
  return {
    apikey: supabaseConfig.anonKey,
    Authorization: `Bearer ${supabaseConfig.anonKey}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };
}

function cloudUrl(query = "") {
  return `${supabaseConfig.url.replace(/\/$/, "")}/rest/v1/app_state${query}`;
}

async function loadCloudState() {
  if (!cloudSyncEnabled) {
    setSyncStatus("Local mode");
    return;
  }

  setSyncStatus("Syncing...");

  try {
    const response = await fetch(cloudUrl(`?key=eq.${encodeURIComponent(CLOUD_RECORD_KEY)}&select=data`), {
      headers: cloudHeaders(),
    });

    if (!response.ok) throw new Error("Could not load shared roster.");

    const rows = await response.json();
    if (rows[0]?.data) {
      state = hydrateState(rows[0].data);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      setSyncStatus("Synced");
      render();
      return;
    }

    await saveCloudState();
    setSyncStatus("Shared roster created");
  } catch (error) {
    console.warn(error);
    setSyncStatus("Offline changes saved here", "warning");
  }
}

function queueCloudSave() {
  if (!cloudSyncEnabled) return;
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(() => {
    saveCloudState();
  }, 450);
}

async function saveCloudState() {
  if (!cloudSyncEnabled) return;

  try {
    setSyncStatus("Saving...");
    const response = await fetch(cloudUrl("?on_conflict=key"), {
      method: "POST",
      headers: {
        ...cloudHeaders(),
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        key: CLOUD_RECORD_KEY,
        data: state,
        updated_at: new Date().toISOString(),
      }),
    });

    if (!response.ok) throw new Error("Could not save shared roster.");
    setSyncStatus("Synced");
  } catch (error) {
    console.warn(error);
    setSyncStatus("Offline changes saved here", "warning");
  }
}

function ensureWeek(isoDate) {
  if (!state.weeks[isoDate]) {
    state.weeks[isoDate] = {
      location: state.week.location || "",
      notes: "",
      responses: {},
    };
  }

  for (const player of state.players) {
    if (!state.weeks[isoDate].responses[player.id]) {
      state.weeks[isoDate].responses[player.id] = player.status === "active" ? "maybe" : "out";
    }
  }

  return state.weeks[isoDate];
}

function selectedWeek() {
  return ensureWeek(state.week.date);
}

function getPlayerResponse(player, isoDate = state.week.date) {
  const week = ensureWeek(isoDate);
  return week.responses[player.id] || (player.status === "active" ? "maybe" : "out");
}

function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function playerColor(player) {
  const total = [...player.name].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return palette[total % palette.length];
}

function filteredPlayers() {
  return state.players
    .filter((player) => {
      const response = getPlayerResponse(player);
      if (activeFilter === "inactive") return player.status === "inactive";
      if (activeFilter !== "all" && response !== activeFilter) return false;
      if (activeFilter !== "inactive" && player.status === "inactive") return activeFilter === "all";
      return true;
    })
    .filter((player) => {
      const haystack = `${player.name} ${player.contact} ${player.level} ${player.notes}`.toLowerCase();
      return haystack.includes(searchTerm);
    })
    .sort((a, b) => {
      const order = { confirmed: 0, maybe: 1, out: 2 };
      return (
        (order[getPlayerResponse(a)] ?? 3) - (order[getPlayerResponse(b)] ?? 3) ||
        a.name.localeCompare(b.name)
      );
    });
}

function render() {
  const week = selectedWeek();
  elements.weekDate.value = state.week.date;
  elements.weekLocation.value = week.location;
  elements.weekNotes.value = week.notes;

  const confirmed = state.players.filter(
    (player) => player.status === "active" && getPlayerResponse(player) === "confirmed",
  ).length;
  const maybe = state.players.filter(
    (player) => player.status === "active" && getPlayerResponse(player) === "maybe",
  ).length;
  const active = state.players.filter((player) => player.status === "active").length;

  elements.confirmedCount.textContent = confirmed;
  elements.maybeCount.textContent = maybe;
  elements.activeCount.textContent = active;

  renderWeekDashboard();
  renderView();
  renderRoster();

  const players = filteredPlayers();
  elements.playerBoard.innerHTML = "";

  if (players.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No players match this view.";
    elements.playerBoard.append(empty);
    return;
  }

  for (const player of players) {
    elements.playerBoard.append(createPlayerCard(player));
  }
}

function createPlayerCard(player) {
  const card = document.createElement("article");
  card.className = `player-card ${player.status === "inactive" ? "is-inactive" : ""}`;
  const response = getPlayerResponse(player);

  const top = document.createElement("div");
  top.className = "player-top";

  const nameWrap = document.createElement("div");
  nameWrap.className = "player-name-wrap";

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.style.background = playerColor(player);
  avatar.textContent = initials(player.name);

  const nameBlock = document.createElement("div");
  const name = document.createElement("div");
  name.className = "player-name";
  name.textContent = player.name;
  const contact = document.createElement("div");
  contact.className = "meta";
  contact.textContent = player.contact || "No contact added";
  nameBlock.append(name, contact);
  nameWrap.append(avatar, nameBlock);

  const editButton = document.createElement("button");
  editButton.className = "icon-button";
  editButton.type = "button";
  editButton.title = "Edit player";
  editButton.setAttribute("aria-label", `Edit ${player.name}`);
  editButton.textContent = "⋯";
  editButton.addEventListener("click", () => openPlayerDialog(player.id));

  top.append(nameWrap, editButton);

  const statusRow = document.createElement("div");
  statusRow.className = "status-row";
  for (const response of ["confirmed", "maybe", "out"]) {
    const button = document.createElement("button");
    button.className = `status-button ${getPlayerResponse(player) === response ? "is-selected" : ""}`;
    button.type = "button";
    button.dataset.response = response;
    button.textContent = response[0].toUpperCase() + response.slice(1);
    button.addEventListener("click", () => updateResponse(player.id, response));
    statusRow.append(button);
  }

  const details = document.createElement("div");
  details.className = "details";
  const tags = document.createElement("div");
  tags.className = "tags";
  tags.append(createTag(player.level), createTag(player.status === "active" ? "Active" : "Inactive"));
  const notes = document.createElement("p");
  notes.textContent = player.notes || "No notes yet.";
  details.append(tags, notes);

  card.append(top, statusRow, details);
  return card;
}

function renderView() {
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === activeView);
  });

  document.querySelectorAll(".view-panel").forEach((panel) => {
    const shouldShow =
      (activeView === "weekly" && panel.id === "weeklyView") ||
      (activeView === "roster" && panel.id === "rosterView");
    panel.classList.toggle("is-active", shouldShow);
  });
}

function renderRoster() {
  const players = state.players
    .filter((player) => {
      const haystack = `${player.name} ${player.contact} ${player.level} ${player.status} ${player.notes}`.toLowerCase();
      return haystack.includes(searchTerm);
    })
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  elements.rosterList.innerHTML = "";

  if (players.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No players match this roster search.";
    elements.rosterList.append(empty);
    return;
  }

  for (const player of players) {
    elements.rosterList.append(createRosterRow(player));
  }
}

function createRosterRow(player) {
  const row = document.createElement("article");
  row.className = "roster-player";

  const main = document.createElement("div");
  main.className = "roster-player-main";
  main.append(
    createRosterCell("Name", player.name),
    createRosterCell("Contact", player.contact || "No contact added"),
    createRosterCell("Level", player.level),
    createRosterCell("Status", player.status === "active" ? "Active" : "Inactive"),
  );

  const editButton = document.createElement("button");
  editButton.className = "secondary-button";
  editButton.type = "button";
  editButton.textContent = "Edit";
  editButton.addEventListener("click", () => openPlayerDialog(player.id));

  row.append(main, editButton);

  if (player.notes) {
    const notes = document.createElement("p");
    notes.className = "roster-notes";
    notes.textContent = player.notes;
    row.append(notes);
  }

  return row;
}

function createRosterCell(label, value) {
  const cell = document.createElement("div");
  cell.className = "roster-cell";

  const labelElement = document.createElement("span");
  labelElement.className = "roster-label";
  labelElement.textContent = label;

  const valueElement = document.createElement("span");
  valueElement.className = "roster-value";
  valueElement.textContent = value;

  cell.append(labelElement, valueElement);
  return cell;
}

function renderWeekDashboard() {
  elements.weekList.innerHTML = "";

  for (const isoDate of getWednesdayDates()) {
    ensureWeek(isoDate);
    const weekButton = document.createElement("button");
    weekButton.className = `week-card ${isoDate === state.week.date ? "is-selected" : ""}`;
    weekButton.type = "button";
    weekButton.setAttribute("aria-label", `Show roster for ${formatDateLabel(isoDate)}`);
    weekButton.addEventListener("click", () => selectWeek(isoDate));

    const dateLine = document.createElement("span");
    dateLine.className = "week-card-date";
    dateLine.textContent = formatDateLabel(isoDate);

    const roster = document.createElement("span");
    roster.className = "week-card-roster";
    roster.append(...state.players.map((player) => createWeekRosterName(player, isoDate)));

    weekButton.append(dateLine, roster);
    elements.weekList.append(weekButton);
  }
}

function createWeekRosterName(player, isoDate) {
  const name = document.createElement("span");
  name.className = `week-roster-name is-${getPlayerResponse(player, isoDate)}`;
  name.textContent = player.name;
  return name;
}

function createTag(text) {
  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = text;
  return tag;
}

function updateResponse(id, response) {
  selectedWeek().responses[id] = response;
  saveState();
  render();
}

function selectWeek(isoDate) {
  const week = ensureWeek(isoDate);
  state.week = {
    date: isoDate,
    location: week.location,
    notes: week.notes,
  };
  saveState();
  render();
}

function openPlayerDialog(id) {
  const player = state.players.find((item) => item.id === id);
  elements.playerForm.reset();
  elements.playerId.value = player?.id ?? "";
  elements.dialogTitle.textContent = player ? "Edit Player" : "Add Player";
  elements.deletePlayerButton.hidden = !player;

  elements.playerName.value = player?.name ?? "";
  elements.playerContact.value = player?.contact ?? "";
  elements.playerLevel.value = player?.level ?? "Intermediate";
  elements.playerStatus.value = player?.status ?? "active";
  elements.playerNotes.value = player?.notes ?? "";

  elements.playerDialog.showModal();
  elements.playerName.focus();
}

function upsertPlayer() {
  const id = elements.playerId.value || crypto.randomUUID();
  const current = state.players.find((player) => player.id === id);
  const nextPlayer = {
    id,
    name: elements.playerName.value.trim(),
    contact: elements.playerContact.value.trim(),
    level: elements.playerLevel.value,
    status: elements.playerStatus.value,
    notes: elements.playerNotes.value.trim(),
    response: current?.response ?? "maybe",
  };

  if (!nextPlayer.name) return;

  state.players = current
    ? state.players.map((player) => (player.id === id ? nextPlayer : player))
    : [...state.players, nextPlayer];

  for (const [isoDate, week] of Object.entries(state.weeks)) {
    if (!week.responses[id]) {
      week.responses[id] = nextPlayer.status === "active" ? "maybe" : "out";
    }
  }

  saveState();
  render();
}

function deleteCurrentPlayer() {
  const id = elements.playerId.value;
  if (!id) return;

  const player = state.players.find((item) => item.id === id);
  if (!player) return;

  const shouldDelete = confirm(`Delete ${player.name} from the roster?`);
  if (!shouldDelete) return;

  state.players = state.players.filter((item) => item.id !== id);
  for (const week of Object.values(state.weeks)) {
    delete week.responses[id];
  }
  saveState();
  elements.playerDialog.close();
  render();
}

function exportSummary() {
  const week = selectedWeek();
  const lines = [
    `${APP_NAME} - ${state.week.date}`,
    week.location ? `Location: ${week.location}` : "",
    week.notes ? `Notes: ${week.notes}` : "",
    "",
    "Confirmed:",
    ...state.players
      .filter((player) => player.status === "active" && getPlayerResponse(player) === "confirmed")
      .map((player) => `- ${player.name}${player.contact ? ` (${player.contact})` : ""}`),
    "",
    "Maybe:",
    ...state.players
      .filter((player) => player.status === "active" && getPlayerResponse(player) === "maybe")
      .map((player) => `- ${player.name}${player.contact ? ` (${player.contact})` : ""}`),
    "",
    "Out:",
    ...state.players
      .filter((player) => getPlayerResponse(player) === "out")
      .map((player) => `- ${player.name}`),
  ].filter((line, index, all) => line || all[index - 1] !== "");

  navigator.clipboard
    .writeText(lines.join("\n"))
    .then(() => {
      elements.exportButton.textContent = "Copied";
      setTimeout(() => {
        elements.exportButton.textContent = "Export";
      }, 1400);
    })
    .catch(() => {
      alert(lines.join("\n"));
    });
}

function startNewWeek() {
  const nextDate = getUpcomingWednesdayIso(today);
  const week = ensureWeek(nextDate);
  week.notes = "";
  for (const player of state.players) {
    week.responses[player.id] = player.status === "active" ? "maybe" : "out";
  }
  state.week = { date: nextDate, location: week.location, notes: week.notes };
  saveState();
  render();
}

elements.weekDate.addEventListener("change", (event) => {
  state.week.date = normalizeWednesdayIso(event.target.value);
  ensureWeek(state.week.date);
  saveState();
  render();
});

elements.weekLocation.addEventListener("input", (event) => {
  selectedWeek().location = event.target.value;
  state.week.location = event.target.value;
  saveState();
});

elements.weekNotes.addEventListener("input", (event) => {
  selectedWeek().notes = event.target.value;
  state.week.notes = event.target.value;
  saveState();
});

elements.newWeekButton.addEventListener("click", startNewWeek);
elements.addPlayerButton.addEventListener("click", () => openPlayerDialog());
elements.rosterAddPlayerButton.addEventListener("click", () => openPlayerDialog());
elements.deletePlayerButton.addEventListener("click", deleteCurrentPlayer);
elements.exportButton.addEventListener("click", exportSummary);

elements.searchInput.addEventListener("input", (event) => {
  searchTerm = event.target.value.trim().toLowerCase();
  render();
});

document.querySelectorAll(".filter-button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".filter-button").forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");
    activeFilter = button.dataset.filter;
    render();
  });
});

document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", () => {
    activeView = button.dataset.view;
    render();
  });
});

elements.playerForm.addEventListener("submit", (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  upsertPlayer();
  elements.playerDialog.close();
});

render();
loadCloudState();
