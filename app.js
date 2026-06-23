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
      id: createId(),
      name: "Maya Chen",
      contact: "(555) 013-0198",
      level: "Advanced",
      status: "active",
      notes: "Prefers doubles. Strong server.",
      response: "confirmed",
    },
    {
      id: createId(),
      name: "Elena Brooks",
      contact: "(555) 014-8000",
      level: "Intermediate",
      status: "active",
      notes: "Can arrive early to help set up.",
      response: "maybe",
    },
    {
      id: createId(),
      name: "Priya Shah",
      contact: "(555) 016-4421",
      level: "Intermediate",
      status: "active",
      notes: "Often brings a guest player.",
      response: "confirmed",
    },
    {
      id: createId(),
      name: "Nora Davis",
      contact: "(555) 019-2000",
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

  if (state && state.week && state.week.date && !dates.includes(state.week.date)) {
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

function formatPhoneNumber(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length < 4) return `(${digits}`;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function phoneDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function createId() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return `player-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return hydrateState(createStarterState());

  try {
    const parsed = JSON.parse(saved);
    return hydrateState({
      week: { ...starterState.week, ...parsed.week },
      weeks: parsed.weeks && typeof parsed.weeks === "object" ? parsed.weeks : {},
      players: Array.isArray(parsed.players) ? parsed.players : createStarterState().players,
    });
  } catch {
    return hydrateState(createStarterState());
  }
}

function createStarterState() {
  if (typeof structuredClone === "function") return structuredClone(starterState);
  return JSON.parse(JSON.stringify(starterState));
}

function hydrateState(nextState) {
  nextState = nextState && typeof nextState === "object" ? nextState : createStarterState();
  nextState.players = Array.isArray(nextState.players) ? nextState.players : [];

  const weekDate = normalizeWednesdayIso(nextState.week && nextState.week.date);
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
      removedIds: [],
    };
  }

  for (const week of Object.values(nextState.weeks)) {
    week.responses = week.responses && typeof week.responses === "object" ? week.responses : {};
    week.removedIds = Array.isArray(week.removedIds) ? week.removedIds : [];
    if (!week.location || week.location === "Community center") {
      week.location = DEFAULT_LOCATION;
    }
  }

  for (const player of nextState.players) {
    player.contact = formatPhoneNumber(player.contact);
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
    if (rows[0] && rows[0].data) {
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
      removedIds: [],
    };
  }

  state.weeks[isoDate].removedIds = Array.isArray(state.weeks[isoDate].removedIds)
    ? state.weeks[isoDate].removedIds
    : [];

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

function isPlayerInWeek(player, isoDate = state.week.date) {
  const week = ensureWeek(isoDate);
  return !week.removedIds.includes(player.id);
}

function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => (part[0] ? part[0].toUpperCase() : ""))
    .join("");
}

function playerColor(player) {
  const total = [...player.name].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return palette[total % palette.length];
}

function filteredPlayers() {
  return state.players
    .filter((player) => isPlayerInWeek(player))
    .filter((player) => {
      const response = getPlayerResponse(player);
      if (activeFilter === "inactive") return player.status === "inactive";
      if (activeFilter !== "all" && response !== activeFilter) return false;
      if (activeFilter !== "inactive" && player.status === "inactive") return activeFilter === "all";
      return true;
    })
    .filter((player) => {
      const haystack = `${player.name} ${player.contact} ${phoneDigits(player.contact)} ${player.level} ${player.notes}`.toLowerCase();
      return haystack.includes(searchTerm) || phoneDigits(player.contact).includes(phoneDigits(searchTerm));
    })
    .sort((a, b) => {
      const order = { confirmed: 0, maybe: 1, out: 2 };
      const firstOrder = order[getPlayerResponse(a)] === undefined ? 3 : order[getPlayerResponse(a)];
      const secondOrder = order[getPlayerResponse(b)] === undefined ? 3 : order[getPlayerResponse(b)];
      return (
        firstOrder - secondOrder ||
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
    (player) => isPlayerInWeek(player) && player.status === "active" && getPlayerResponse(player) === "confirmed",
  ).length;
  const maybe = state.players.filter(
    (player) => isPlayerInWeek(player) && player.status === "active" && getPlayerResponse(player) === "maybe",
  ).length;
  const active = state.players.filter((player) => isPlayerInWeek(player) && player.status === "active").length;

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
    empty.append(
      document.createTextNode(
        state.players.length === 0
          ? "No players yet. Add your first player."
          : "No players scheduled for this week or filter.",
      ),
      createEmptyAction(),
    );
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
  contact.textContent = player.contact || "No phone number added";
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

  const weekActions = document.createElement("div");
  weekActions.className = "week-actions";
  const removeButton = document.createElement("button");
  removeButton.className = "secondary-button";
  removeButton.type = "button";
  removeButton.textContent = "Remove from Week";
  removeButton.addEventListener("click", () => removeFromWeek(player.id));
  weekActions.append(removeButton);

  card.append(top, statusRow, details, weekActions);
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
      const haystack = `${player.name} ${player.contact} ${phoneDigits(player.contact)} ${player.level} ${player.status} ${player.notes}`.toLowerCase();
      return haystack.includes(searchTerm) || phoneDigits(player.contact).includes(phoneDigits(searchTerm));
    })
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  elements.rosterList.innerHTML = "";

  if (players.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.append(
      document.createTextNode(
        state.players.length === 0 ? "No players yet. Add your first player." : "No players match this roster search.",
      ),
      createEmptyAction(),
    );
    elements.rosterList.append(empty);
    return;
  }

  for (const player of players) {
    elements.rosterList.append(createRosterRow(player));
  }
}

function createEmptyAction() {
  const wrap = document.createElement("div");
  wrap.className = "empty-actions";

  const addButton = document.createElement("button");
  addButton.className = "primary-button";
  addButton.type = "button";
  addButton.textContent = "Add Player";
  addButton.addEventListener("click", () => openPlayerDialog());

  const resetButton = document.createElement("button");
  resetButton.className = "secondary-button";
  resetButton.type = "button";
  resetButton.textContent = "Load Sample Roster";
  resetButton.addEventListener("click", resetSampleRoster);

  wrap.append(addButton, resetButton);
  return wrap;
}

function resetSampleRoster() {
  state = hydrateState(createStarterState());
  saveState();
  render();
}

function createRosterRow(player) {
  const row = document.createElement("article");
  row.className = "roster-player";

  const main = document.createElement("div");
  main.className = "roster-player-main";
  main.append(
    createRosterCell("Name", player.name),
    createRosterCell("Phone", player.contact || "No phone number added"),
    createRosterCell("Level", player.level),
    createRosterCell("Status", player.status === "active" ? "Active" : "Inactive"),
    createRosterCell("This Week", isPlayerInWeek(player) ? "Included" : "Removed"),
  );

  const actions = document.createElement("div");
  actions.className = "roster-actions";

  const weekButton = document.createElement("button");
  weekButton.className = "secondary-button";
  weekButton.type = "button";
  weekButton.textContent = isPlayerInWeek(player) ? "Remove This Week" : "Add This Week";
  weekButton.addEventListener("click", () => {
    if (isPlayerInWeek(player)) {
      removeFromWeek(player.id);
    } else {
      addToWeek(player.id);
    }
  });

  const editButton = document.createElement("button");
  editButton.className = "secondary-button";
  editButton.type = "button";
  editButton.textContent = "Edit";
  editButton.addEventListener("click", () => openPlayerDialog(player.id));

  actions.append(weekButton, editButton);
  row.append(main, actions);

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
    const weekPlayers = state.players.filter((player) => isPlayerInWeek(player, isoDate));

    if (weekPlayers.length === 0) {
      const empty = document.createElement("span");
      empty.className = "week-roster-empty";
      empty.textContent = "No players";
      roster.append(empty);
    } else {
      roster.append(...weekPlayers.map((player) => createWeekRosterName(player, isoDate)));
    }

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

function removeFromWeek(id) {
  const week = selectedWeek();
  if (!week.removedIds.includes(id)) {
    week.removedIds.push(id);
  }
  saveState();
  render();
}

function addToWeek(id) {
  const week = selectedWeek();
  week.removedIds = week.removedIds.filter((playerId) => playerId !== id);
  if (!week.responses[id]) {
    week.responses[id] = "maybe";
  }
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
  elements.playerId.value = player ? player.id : "";
  elements.dialogTitle.textContent = player ? "Edit Player" : "Add Player";
  elements.deletePlayerButton.hidden = !player;

  elements.playerName.value = player ? player.name : "";
  elements.playerContact.value = player ? formatPhoneNumber(player.contact) : "";
  elements.playerLevel.value = player ? player.level : "Intermediate";
  elements.playerStatus.value = player ? player.status : "active";
  elements.playerNotes.value = player ? player.notes : "";

  openDialog(elements.playerDialog);
  elements.playerName.focus();
}

function openDialog(dialog) {
  if (dialog.showModal) {
    dialog.showModal();
    return;
  }

  dialog.setAttribute("open", "");
}

function closeDialog(dialog) {
  if (dialog.close) {
    dialog.close();
    return;
  }

  dialog.removeAttribute("open");
}

function upsertPlayer() {
  const id = elements.playerId.value || createId();
  const current = state.players.find((player) => player.id === id);
  const formattedPhone = formatPhoneNumber(elements.playerContact.value);

  if (formattedPhone && phoneDigits(formattedPhone).length !== 10) {
    alert("Enter a 10-digit phone number.");
    return;
  }

  const nextPlayer = {
    id,
    name: elements.playerName.value.trim(),
    contact: formattedPhone,
    level: elements.playerLevel.value,
    status: elements.playerStatus.value,
    notes: elements.playerNotes.value.trim(),
    response: current ? current.response : "maybe",
  };

  if (!nextPlayer.name) return;

  state.players = current
    ? state.players.map((player) => (player.id === id ? nextPlayer : player))
    : [...state.players, nextPlayer];

  selectedWeek().responses[id] = nextPlayer.response;

  for (const week of Object.values(state.weeks)) {
    week.responses = week.responses && typeof week.responses === "object" ? week.responses : {};
    week.removedIds = Array.isArray(week.removedIds) ? week.removedIds.filter((playerId) => playerId !== id) : [];
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
    week.removedIds = Array.isArray(week.removedIds) ? week.removedIds.filter((playerId) => playerId !== id) : [];
  }
  saveState();
  closeDialog(elements.playerDialog);
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
      .filter((player) => isPlayerInWeek(player) && player.status === "active" && getPlayerResponse(player) === "confirmed")
      .map((player) => `- ${player.name}${player.contact ? ` (${player.contact})` : ""}`),
    "",
    "Maybe:",
    ...state.players
      .filter((player) => isPlayerInWeek(player) && player.status === "active" && getPlayerResponse(player) === "maybe")
      .map((player) => `- ${player.name}${player.contact ? ` (${player.contact})` : ""}`),
    "",
    "Out:",
    ...state.players
      .filter((player) => isPlayerInWeek(player) && getPlayerResponse(player) === "out")
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
  week.removedIds = [];
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

elements.playerContact.addEventListener("input", (event) => {
  event.target.value = formatPhoneNumber(event.target.value);
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
  if (event.submitter && event.submitter.value === "cancel") return;
  event.preventDefault();
  upsertPlayer();
  closeDialog(elements.playerDialog);
});

try {
  render();
  loadCloudState();
} catch (error) {
  console.error(error);
  if (elements.playerBoard) {
    elements.playerBoard.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "The roster could not load. Refresh the page or clear this site's browser data.";
    elements.playerBoard.append(empty);
  }
}
