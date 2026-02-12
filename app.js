const STORAGE_KEY = "iscsp_tasks_state_v1";

const STATUS_META = {
  todo: { label: "To do", className: "status-todo" },
  in_progress: { label: "In progress", className: "status-in-progress" },
  unresolved: { label: "Unresolved", className: "status-unresolved" },
  resolved: { label: "Resolved", className: "status-resolved" },
};

const STATUS_RANK = {
  todo: 0,
  in_progress: 1,
  unresolved: 2,
  resolved: 3,
};

const appElements = {
  app: document.getElementById("app"),
  authMessage: document.getElementById("authMessage"),
  userLabel: document.getElementById("userLabel"),
  loginBtn: document.getElementById("loginBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  tabButtons: Array.from(document.querySelectorAll(".tab-btn")),
  tasksTab: document.getElementById("tasksTab"),
  listsTab: document.getElementById("listsTab"),
  taskCreateForm: document.getElementById("taskCreateForm"),
  taskTitleInput: document.getElementById("taskTitleInput"),
  taskNoteInput: document.getElementById("taskNoteInput"),
  taskFilterSelect: document.getElementById("taskFilterSelect"),
  taskSortSelect: document.getElementById("taskSortSelect"),
  taskList: document.getElementById("taskList"),
  listCreateForm: document.getElementById("listCreateForm"),
  listNameInput: document.getElementById("listNameInput"),
  itemFilterSelect: document.getElementById("itemFilterSelect"),
  listsContainer: document.getElementById("listsContainer"),
};

let state = loadState();
let keycloakClient = null;
let refreshTimer = null;

setupEventHandlers();
renderAll();
initAuth();

function getInitialState() {
  return {
    activeTab: "tasks",
    taskFilter: "all",
    taskSort: "newest",
    itemFilter: "all",
    tasks: [],
    lists: [],
  };
}

function loadState() {
  const fallback = getInitialState();
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      ...fallback,
      ...parsed,
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      lists: Array.isArray(parsed.lists) ? parsed.lists : [],
    };
  } catch {
    return fallback;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setupEventHandlers() {
  appElements.tabButtons.forEach((button) => {
    button.addEventListener("click", () => setActiveTab(button.dataset.tab));
  });

  appElements.taskCreateForm.addEventListener("submit", handleTaskCreate);
  appElements.taskFilterSelect.addEventListener("change", () => {
    state.taskFilter = appElements.taskFilterSelect.value;
    saveState();
    renderTasks();
  });
  appElements.taskSortSelect.addEventListener("change", () => {
    state.taskSort = appElements.taskSortSelect.value;
    saveState();
    renderTasks();
  });

  appElements.taskList.addEventListener("click", handleTaskListClick);
  appElements.taskList.addEventListener("change", handleTaskListChange);
  appElements.taskList.addEventListener("input", handleTaskListInput);

  appElements.listCreateForm.addEventListener("submit", handleListCreate);
  appElements.itemFilterSelect.addEventListener("change", () => {
    state.itemFilter = appElements.itemFilterSelect.value;
    saveState();
    renderLists();
  });

  appElements.listsContainer.addEventListener("submit", handleListContainerSubmit);
  appElements.listsContainer.addEventListener("click", handleListContainerClick);
  appElements.listsContainer.addEventListener("change", handleListContainerChange);
  appElements.listsContainer.addEventListener("input", handleListContainerInput);
}

function renderAll() {
  setActiveTab(state.activeTab, false);
  appElements.taskFilterSelect.value = state.taskFilter;
  appElements.taskSortSelect.value = state.taskSort;
  appElements.itemFilterSelect.value = state.itemFilter;
  renderTasks();
  renderLists();
}

function setActiveTab(tab, persist = true) {
  state.activeTab = tab === "lists" ? "lists" : "tasks";
  appElements.tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === state.activeTab);
  });

  appElements.tasksTab.hidden = state.activeTab !== "tasks";
  appElements.listsTab.hidden = state.activeTab !== "lists";

  if (persist) {
    saveState();
  }
}

function handleTaskCreate(event) {
  event.preventDefault();
  const title = appElements.taskTitleInput.value.trim();
  const note = appElements.taskNoteInput.value.trim();

  if (!title) {
    return;
  }

  state.tasks.unshift({
    id: uid(),
    title,
    note,
    status: "todo",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  saveState();
  appElements.taskCreateForm.reset();
  renderTasks();
}

function handleTaskListClick(event) {
  const target = event.target;

  if (target.matches(".task-delete-btn")) {
    const taskId = target.dataset.taskId;
    state.tasks = state.tasks.filter((task) => task.id !== taskId);
    saveState();
    renderTasks();
  }
}

function handleTaskListChange(event) {
  const target = event.target;

  if (target.matches(".task-status-select")) {
    const taskId = target.dataset.taskId;
    updateTask(taskId, { status: target.value, updatedAt: Date.now() });
  }
}

function handleTaskListInput(event) {
  const target = event.target;

  if (target.matches(".task-note-input")) {
    const taskId = target.dataset.taskId;
    const task = state.tasks.find((entry) => entry.id === taskId);
    if (!task) {
      return;
    }

    task.note = target.value;
    task.updatedAt = Date.now();
    saveState();
  }
}

function updateTask(taskId, patch) {
  const task = state.tasks.find((entry) => entry.id === taskId);
  if (!task) {
    return;
  }

  Object.assign(task, patch);
  saveState();
  renderTasks();
}

function renderTasks() {
  let tasks = [...state.tasks];
  if (state.taskFilter !== "all") {
    tasks = tasks.filter((task) => task.status === state.taskFilter);
  }

  tasks.sort((a, b) => {
    switch (state.taskSort) {
      case "oldest":
        return a.createdAt - b.createdAt;
      case "title":
        return a.title.localeCompare(b.title);
      case "status":
        return STATUS_RANK[a.status] - STATUS_RANK[b.status];
      case "newest":
      default:
        return b.createdAt - a.createdAt;
    }
  });

  if (tasks.length === 0) {
    appElements.taskList.innerHTML = `<p class="empty-state">No tasks for this filter.</p>`;
    return;
  }

  appElements.taskList.innerHTML = tasks
    .map((task) => {
      const meta = STATUS_META[task.status] || STATUS_META.todo;
      const created = new Date(task.createdAt).toLocaleString();
      return `
        <article class="task-card">
          <div class="task-head">
            <h3>${escapeHtml(task.title)}</h3>
            <span class="status-pill ${meta.className}">${meta.label}</span>
          </div>

          <div class="task-controls">
            <label class="field compact">
              <span>Status</span>
              <select class="task-status-select" data-task-id="${task.id}">
                ${renderStatusOptions(task.status)}
              </select>
            </label>
            <button class="btn btn-ghost task-delete-btn" data-task-id="${task.id}" type="button">
              Delete
            </button>
          </div>

          <label class="field">
            <span>Note</span>
            <textarea
              class="task-note-input"
              data-task-id="${task.id}"
              rows="3"
              placeholder="Add details..."
            >${escapeHtml(task.note || "")}</textarea>
          </label>

          <p class="task-time">Created: ${escapeHtml(created)}</p>
        </article>
      `;
    })
    .join("");
}

function renderStatusOptions(selected) {
  return Object.entries(STATUS_META)
    .map(([value, meta]) => {
      const isSelected = value === selected ? "selected" : "";
      return `<option value="${value}" ${isSelected}>${meta.label}</option>`;
    })
    .join("");
}

function handleListCreate(event) {
  event.preventDefault();
  const name = appElements.listNameInput.value.trim();
  if (!name) {
    return;
  }

  state.lists.unshift({
    id: uid(),
    name,
    items: [],
    createdAt: Date.now(),
  });

  saveState();
  appElements.listCreateForm.reset();
  renderLists();
}

function handleListContainerSubmit(event) {
  if (!event.target.matches(".item-create-form")) {
    return;
  }

  event.preventDefault();
  const listId = event.target.dataset.listId;
  const input = event.target.querySelector(".item-name-input");
  const value = input ? input.value.trim() : "";
  if (!value) {
    return;
  }

  const list = state.lists.find((entry) => entry.id === listId);
  if (!list) {
    return;
  }

  list.items.push({
    id: uid(),
    label: value,
    note: "",
    checked: false,
    createdAt: Date.now(),
  });

  saveState();
  event.target.reset();
  renderLists();
}

function handleListContainerClick(event) {
  const target = event.target;
  if (target.matches(".list-delete-btn")) {
    const listId = target.dataset.listId;
    state.lists = state.lists.filter((entry) => entry.id !== listId);
    saveState();
    renderLists();
    return;
  }

  if (target.matches(".item-delete-btn")) {
    const listId = target.dataset.listId;
    const itemId = target.dataset.itemId;
    const list = state.lists.find((entry) => entry.id === listId);
    if (!list) {
      return;
    }

    list.items = list.items.filter((item) => item.id !== itemId);
    saveState();
    renderLists();
  }
}

function handleListContainerChange(event) {
  const target = event.target;

  if (target.matches(".item-check")) {
    const item = findItem(target.dataset.listId, target.dataset.itemId);
    if (!item) {
      return;
    }
    item.checked = target.checked;
    saveState();
    renderLists();
    return;
  }

  if (target.matches(".item-label-input")) {
    const item = findItem(target.dataset.listId, target.dataset.itemId);
    if (!item) {
      return;
    }

    const nextLabel = target.value.trim();
    item.label = nextLabel || item.label;
    saveState();
    renderLists();
  }
}

function handleListContainerInput(event) {
  const target = event.target;

  if (target.matches(".item-note-input")) {
    const item = findItem(target.dataset.listId, target.dataset.itemId);
    if (!item) {
      return;
    }

    item.note = target.value;
    saveState();
  }
}

function findItem(listId, itemId) {
  const list = state.lists.find((entry) => entry.id === listId);
  if (!list) {
    return null;
  }
  return list.items.find((item) => item.id === itemId) || null;
}

function renderLists() {
  if (state.lists.length === 0) {
    appElements.listsContainer.innerHTML = `<p class="empty-state">No lists yet.</p>`;
    return;
  }

  appElements.listsContainer.innerHTML = state.lists
    .map((list) => {
      const visibleItems = list.items.filter((item) => {
        if (state.itemFilter === "checked") {
          return item.checked;
        }
        if (state.itemFilter === "unchecked") {
          return !item.checked;
        }
        return true;
      });

      return `
        <article class="list-card">
          <div class="list-head">
            <h3>${escapeHtml(list.name)}</h3>
            <button class="btn btn-ghost list-delete-btn" data-list-id="${list.id}" type="button">
              Delete List
            </button>
          </div>

          <form class="item-create-form inline-form" data-list-id="${list.id}">
            <input class="item-name-input" type="text" placeholder="Add item..." required />
            <button class="btn btn-primary" type="submit">Add Item</button>
          </form>

          <div class="item-list">
            ${
              visibleItems.length === 0
                ? `<p class="empty-state">No items for this filter.</p>`
                : visibleItems
                    .map(
                      (item) => `
                <div class="item-row ${item.checked ? "checked" : ""}">
                  <input
                    class="item-check"
                    type="checkbox"
                    data-list-id="${list.id}"
                    data-item-id="${item.id}"
                    ${item.checked ? "checked" : ""}
                  />
                  <input
                    class="item-label-input"
                    type="text"
                    data-list-id="${list.id}"
                    data-item-id="${item.id}"
                    value="${escapeHtml(item.label)}"
                  />
                  <input
                    class="item-note-input"
                    type="text"
                    data-list-id="${list.id}"
                    data-item-id="${item.id}"
                    value="${escapeHtml(item.note)}"
                    placeholder="Note"
                  />
                  <button
                    class="btn btn-ghost item-delete-btn"
                    type="button"
                    data-list-id="${list.id}"
                    data-item-id="${item.id}"
                  >
                    Delete
                  </button>
                </div>
              `,
                    )
                    .join("")
            }
          </div>
        </article>
      `;
    })
    .join("");
}

function uid() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function initAuth() {
  const config = window.KEYCLOAK_CONFIG;
  if (!config) {
    appElements.loginBtn.disabled = true;
    setSignedOutState(
      "Missing keycloak-config.js. Copy keycloak-config.sample.js to keycloak-config.js and fill your realm/client values.",
    );
    return;
  }

  const looksLikePlaceholderConfig =
    String(config.url || "").includes("your-keycloak-domain") ||
    String(config.realm || "") === "your-realm" ||
    String(config.clientId || "") === "your-client-id";

  if (looksLikePlaceholderConfig) {
    appElements.loginBtn.disabled = true;
    setSignedOutState(
      "Update keycloak-config.js with your real Keycloak URL, realm, and clientId.",
    );
    return;
  }

  if (typeof window.Keycloak !== "function") {
    appElements.loginBtn.disabled = true;
    setSignedOutState("Keycloak library could not be loaded.");
    return;
  }

  keycloakClient = new window.Keycloak(config);
  appElements.loginBtn.addEventListener("click", () => {
    keycloakClient.login({ redirectUri: window.location.href });
  });
  appElements.logoutBtn.addEventListener("click", () => {
    keycloakClient.logout({
      redirectUri: `${window.location.origin}${window.location.pathname}`,
    });
  });

  try {
    const authenticated = await keycloakClient.init({
      onLoad: "check-sso",
      pkceMethod: "S256",
      checkLoginIframe: false,
    });

    if (!authenticated) {
      setSignedOutState("You are signed out. Login to access Tasks and Lists.");
      return;
    }

    setSignedInState();
    startTokenRefresh();
  } catch (error) {
    console.error("Keycloak init failed:", error);
    appElements.loginBtn.disabled = true;
    setSignedOutState("Failed to initialize Keycloak. Confirm your configuration.");
  }
}

function setSignedOutState(message) {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }

  appElements.app.hidden = true;
  appElements.authMessage.hidden = false;
  appElements.authMessage.textContent = message;
  appElements.userLabel.textContent = "";
  appElements.loginBtn.hidden = false;
  appElements.logoutBtn.hidden = true;
}

function setSignedInState() {
  const parsed = keycloakClient?.tokenParsed || {};
  const username =
    parsed.preferred_username || parsed.name || parsed.given_name || "Authenticated user";

  appElements.app.hidden = false;
  appElements.authMessage.hidden = true;
  appElements.userLabel.textContent = username;
  appElements.loginBtn.hidden = true;
  appElements.logoutBtn.hidden = false;
}

function startTokenRefresh() {
  refreshTimer = setInterval(async () => {
    if (!keycloakClient) {
      return;
    }

    try {
      await keycloakClient.updateToken(45);
    } catch {
      setSignedOutState("Session expired. Login again to continue.");
    }
  }, 30000);
}
