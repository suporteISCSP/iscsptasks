const STORAGE_KEY = "iscsp_tasks_state_v1";
const FIREBASE_SDK_VERSION = "10.13.2";
const SHARED_STATE_COLLECTION = "shared";
const SHARED_STATE_DOCUMENT = "globalState";

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
  authStatusText: document.getElementById("authStatusText"),
  authForm: document.getElementById("authForm"),
  authEmailInput: document.getElementById("authEmailInput"),
  authPasswordInput: document.getElementById("authPasswordInput"),
  authLoginBtn: document.getElementById("authLoginBtn"),
  authRegisterBtn: document.getElementById("authRegisterBtn"),
  userLabel: document.getElementById("userLabel"),
  syncStatus: document.getElementById("syncStatus"),
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
let firebaseAuth = null;
let firebaseAuthApi = null;
let firebaseAuthReady = false;
let firestoreDb = null;
let firestoreApi = null;
let sharedStateDocRef = null;
let sharedStateUnsubscribe = null;
let sharedSyncReady = false;
let sharedWriteTimer = null;
let lastSharedStateString = "";
let firstSnapshotLoaded = false;

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

function normalizeState(candidate) {
  const source = candidate && typeof candidate === "object" ? candidate : {};

  return {
    ...getInitialState(),
    activeTab: source.activeTab === "lists" ? "lists" : "tasks",
    taskFilter: normalizeTaskFilter(source.taskFilter),
    taskSort: normalizeTaskSort(source.taskSort),
    itemFilter: normalizeItemFilter(source.itemFilter),
    tasks: normalizeTasks(source.tasks),
    lists: normalizeLists(source.lists),
  };
}

function normalizeTaskFilter(value) {
  const allowed = ["all", "todo", "in_progress", "unresolved", "resolved"];
  return allowed.includes(value) ? value : "all";
}

function normalizeTaskSort(value) {
  const allowed = ["newest", "oldest", "title", "status"];
  return allowed.includes(value) ? value : "newest";
}

function normalizeItemFilter(value) {
  const allowed = ["all", "checked", "unchecked"];
  return allowed.includes(value) ? value : "all";
}

function normalizeTasks(tasks) {
  if (!Array.isArray(tasks)) {
    return [];
  }

  return tasks
    .map((task) => ({
      id: typeof task?.id === "string" ? task.id : uid(),
      title: typeof task?.title === "string" ? task.title : "",
      note: typeof task?.note === "string" ? task.note : "",
      status: STATUS_META[task?.status] ? task.status : "todo",
      createdAt: Number.isFinite(Number(task?.createdAt)) ? Number(task.createdAt) : Date.now(),
      updatedAt: Number.isFinite(Number(task?.updatedAt)) ? Number(task.updatedAt) : Date.now(),
    }))
    .filter((task) => task.title.trim().length > 0);
}

function normalizeLists(lists) {
  if (!Array.isArray(lists)) {
    return [];
  }

  return lists
    .map((list) => ({
      id: typeof list?.id === "string" ? list.id : uid(),
      name: typeof list?.name === "string" ? list.name : "",
      createdAt: Number.isFinite(Number(list?.createdAt)) ? Number(list.createdAt) : Date.now(),
      items: normalizeItems(list?.items),
    }))
    .filter((list) => list.name.trim().length > 0);
}

function normalizeItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => ({
      id: typeof item?.id === "string" ? item.id : uid(),
      label: typeof item?.label === "string" ? item.label : "",
      note: typeof item?.note === "string" ? item.note : "",
      checked: Boolean(item?.checked),
      createdAt: Number.isFinite(Number(item?.createdAt)) ? Number(item.createdAt) : Date.now(),
    }))
    .filter((item) => item.label.trim().length > 0);
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return getInitialState();
  }

  try {
    const parsed = JSON.parse(raw);
    return normalizeState(parsed);
  } catch {
    return getInitialState();
  }
}

function saveState() {
  state = normalizeState(state);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  queueSharedStateWrite();
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

  appElements.authForm.addEventListener("submit", handleAuthSignIn);
  appElements.authRegisterBtn.addEventListener("click", handleAuthRegister);
  appElements.logoutBtn.addEventListener("click", handleAuthSignOut);
}

async function handleAuthSignIn(event) {
  event.preventDefault();
  if (!firebaseAuthReady || !firebaseAuth || !firebaseAuthApi) {
    setSignedOutState("Firebase is still loading. Please wait a moment.", false);
    return;
  }

  const email = appElements.authEmailInput.value.trim();
  const password = appElements.authPasswordInput.value;
  if (!email || !password) {
    setSignedOutState("Enter email and password.", true);
    return;
  }

  setAuthFormBusy(true);
  try {
    await firebaseAuthApi.signInWithEmailAndPassword(firebaseAuth, email, password);
  } catch (error) {
    setSignedOutState(formatFirebaseAuthError(error), true);
  } finally {
    setAuthFormBusy(false);
  }
}

async function handleAuthRegister() {
  if (!firebaseAuthReady || !firebaseAuth || !firebaseAuthApi) {
    setSignedOutState("Firebase is still loading. Please wait a moment.", false);
    return;
  }

  const email = appElements.authEmailInput.value.trim();
  const password = appElements.authPasswordInput.value;
  if (!email || !password) {
    setSignedOutState("Enter email and password to create an account.", true);
    return;
  }

  setAuthFormBusy(true);
  try {
    await firebaseAuthApi.createUserWithEmailAndPassword(firebaseAuth, email, password);
  } catch (error) {
    setSignedOutState(formatFirebaseAuthError(error), true);
  } finally {
    setAuthFormBusy(false);
  }
}

async function handleAuthSignOut() {
  if (!firebaseAuthReady || !firebaseAuth || !firebaseAuthApi) {
    return;
  }

  stopSharedStateSync();

  try {
    await firebaseAuthApi.signOut(firebaseAuth);
  } catch (error) {
    setSignedOutState(formatFirebaseAuthError(error), true);
  }
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
    return;
  }

  if (target.matches(".task-title-input")) {
    const taskId = target.dataset.taskId;
    const task = state.tasks.find((entry) => entry.id === taskId);
    if (!task) {
      return;
    }

    const nextTitle = target.value.trim();
    if (!nextTitle) {
      target.value = task.title;
      return;
    }

    if (task.title === nextTitle) {
      return;
    }

    task.title = nextTitle;
    task.updatedAt = Date.now();
    saveState();
  }
}

function handleTaskListInput(event) {
  const target = event.target;

  if (target.matches(".task-title-input")) {
    const taskId = target.dataset.taskId;
    const task = state.tasks.find((entry) => entry.id === taskId);
    if (!task) {
      return;
    }

    const nextTitle = target.value.trim();
    if (!nextTitle) {
      return;
    }

    task.title = nextTitle;
    task.updatedAt = Date.now();
    saveState();
    return;
  }

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
            <input
              class="task-title-input"
              data-task-id="${task.id}"
              type="text"
              value="${escapeHtml(task.title)}"
              aria-label="Task title"
            />
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

  if (target.matches(".list-title-input")) {
    const listId = target.dataset.listId;
    const list = state.lists.find((entry) => entry.id === listId);
    if (!list) {
      return;
    }

    const nextName = target.value.trim();
    if (!nextName) {
      target.value = list.name;
      return;
    }

    if (list.name === nextName) {
      return;
    }

    list.name = nextName;
    saveState();
    return;
  }

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

  if (target.matches(".item-label-input, .item-title-input")) {
    const item = findItem(target.dataset.listId, target.dataset.itemId);
    if (!item) {
      return;
    }

    const nextLabel = target.value.trim();
    if (!nextLabel) {
      target.value = item.label;
      return;
    }

    if (item.label === nextLabel) {
      return;
    }

    item.label = nextLabel;
    saveState();
  }
}

function handleListContainerInput(event) {
  const target = event.target;

  if (target.matches(".list-title-input")) {
    const listId = target.dataset.listId;
    const list = state.lists.find((entry) => entry.id === listId);
    if (!list) {
      return;
    }

    const nextName = target.value.trim();
    if (!nextName) {
      return;
    }

    list.name = nextName;
    saveState();
    return;
  }

  if (target.matches(".item-label-input, .item-title-input")) {
    const item = findItem(target.dataset.listId, target.dataset.itemId);
    if (!item) {
      return;
    }

    const nextLabel = target.value.trim();
    if (!nextLabel) {
      return;
    }

    item.label = nextLabel;
    saveState();
    return;
  }

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
            <input
              class="list-title-input"
              type="text"
              data-list-id="${list.id}"
              value="${escapeHtml(list.name)}"
              aria-label="List title"
            />
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
                    class="item-label-input item-title-input"
                    type="text"
                    data-list-id="${list.id}"
                    data-item-id="${item.id}"
                    value="${escapeHtml(item.label)}"
                    aria-label="Item title"
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
  setSignedOutState("Loading Firebase authentication...", false);

  const config = window.FIREBASE_CONFIG;
  if (!config) {
    setSignedOutState(
      "Missing firebase-config.js. Copy firebase-config.sample.js to firebase-config.js and fill your Firebase values.",
      false,
    );
    return;
  }

  const requiredConfigKeys = ["apiKey", "authDomain", "projectId", "appId"];
  const missingKey = requiredConfigKeys.find((key) => !String(config[key] || "").trim());
  if (missingKey) {
    setSignedOutState(`firebase-config.js is missing '${missingKey}'.`, false);
    return;
  }

  const looksLikePlaceholderConfig = requiredConfigKeys.some((key) =>
    String(config[key] || "").toLowerCase().includes("your-"),
  );
  if (looksLikePlaceholderConfig) {
    setSignedOutState("Update firebase-config.js with your real Firebase project values.", false);
    return;
  }

  try {
    const [
      { initializeApp },
      {
        getAuth,
        onAuthStateChanged,
        signInWithEmailAndPassword,
        createUserWithEmailAndPassword,
        signOut,
      },
      { getFirestore, doc, onSnapshot, setDoc, serverTimestamp },
    ] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-firestore.js`),
    ]);

    const firebaseApp = initializeApp(config);
    firebaseAuth = getAuth(firebaseApp);
    firestoreDb = getFirestore(firebaseApp);
    firebaseAuthApi = {
      signInWithEmailAndPassword,
      createUserWithEmailAndPassword,
      signOut,
    };
    firestoreApi = {
      doc,
      onSnapshot,
      setDoc,
      serverTimestamp,
    };
    sharedStateDocRef = firestoreApi.doc(
      firestoreDb,
      SHARED_STATE_COLLECTION,
      SHARED_STATE_DOCUMENT,
    );
    firebaseAuthReady = true;
    setAuthFormBusy(false);

    onAuthStateChanged(firebaseAuth, async (user) => {
      if (user) {
        const syncStarted = await startSharedStateSync();
        setSignedInState(user);
        appElements.authForm.reset();

        if (!syncStarted) {
          setSyncStatus("Sync offline", "warn");
        }
        return;
      }

      stopSharedStateSync();
      setSignedOutState("Sign in with your Firebase account to access Tasks and Lists.", true);
    });
  } catch (error) {
    console.error("Firebase auth initialization failed:", error);
    setSignedOutState("Failed to initialize Firebase authentication.", false);
  }
}

async function startSharedStateSync() {
  if (!firestoreApi || !sharedStateDocRef) {
    return false;
  }

  stopSharedStateSync();
  sharedSyncReady = true;
  lastSharedStateString = "";
  firstSnapshotLoaded = false;
  setSyncStatus("Sync connecting...", "warn");

  return new Promise((resolve) => {
    let resolved = false;

    sharedStateUnsubscribe = firestoreApi.onSnapshot(
      sharedStateDocRef,
      async (snapshot) => {
        if (!snapshot.exists()) {
          await writeSharedState(true);
        } else {
          const raw = snapshot.data()?.state;
          const remoteState = normalizeState(raw);
          const remoteStateString = JSON.stringify(remoteState);
          const currentStateString = JSON.stringify(normalizeState(state));
          if (remoteStateString !== currentStateString) {
            state = remoteState;
            lastSharedStateString = remoteStateString;
            localStorage.setItem(STORAGE_KEY, remoteStateString);
            renderAll();
          } else {
            lastSharedStateString = remoteStateString;
          }
        }

        setSyncStatus("Sync connected", "ok");
        firstSnapshotLoaded = true;

        if (!resolved) {
          resolved = true;
          resolve(true);
        }
      },
      (error) => {
        console.error("Shared state sync failed:", error);
        sharedSyncReady = false;
        const message = formatFirestoreError(error);
        setSyncStatus(message, "error");

        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      },
    );

    setTimeout(() => {
      if (resolved || firstSnapshotLoaded) {
        return;
      }
      setSyncStatus("Sync timeout", "warn");
      resolved = true;
      resolve(false);
    }, 10000);
  });
}

function stopSharedStateSync() {
  sharedSyncReady = false;
  firstSnapshotLoaded = false;
  lastSharedStateString = "";

  if (sharedWriteTimer) {
    clearTimeout(sharedWriteTimer);
    sharedWriteTimer = null;
  }

  if (typeof sharedStateUnsubscribe === "function") {
    sharedStateUnsubscribe();
    sharedStateUnsubscribe = null;
  }
}

function queueSharedStateWrite() {
  if (!sharedSyncReady || !firestoreApi || !sharedStateDocRef) {
    return;
  }

  if (sharedWriteTimer) {
    clearTimeout(sharedWriteTimer);
  }

  sharedWriteTimer = setTimeout(() => {
    writeSharedState();
  }, 350);
}

async function writeSharedState(force = false) {
  if (!sharedSyncReady || !firestoreApi || !sharedStateDocRef) {
    return;
  }

  const normalized = normalizeState(state);
  const payloadString = JSON.stringify(normalized);
  if (!force && payloadString === lastSharedStateString) {
    return;
  }

  state = normalized;
  lastSharedStateString = payloadString;

  try {
    await firestoreApi.setDoc(
      sharedStateDocRef,
      {
        state: normalized,
        updatedAt: firestoreApi.serverTimestamp(),
      },
      { merge: true },
    );
    setSyncStatus("Sync connected", "ok");
  } catch (error) {
    console.error("Failed to write shared state:", error);
    setSyncStatus(formatFirestoreError(error), "error");
  }
}

function setSignedOutState(message, showForm) {
  appElements.app.hidden = true;
  appElements.authMessage.hidden = false;
  appElements.authStatusText.textContent = message;
  appElements.authForm.hidden = !showForm;
  appElements.userLabel.textContent = "";
  setSyncStatus("", "");
  appElements.logoutBtn.hidden = true;
}

function setSignedInState(user) {
  appElements.app.hidden = false;
  appElements.authMessage.hidden = true;
  appElements.userLabel.textContent = user?.displayName || user?.email || "Authenticated user";
  if (!appElements.syncStatus.textContent) {
    setSyncStatus("Sync connecting...", "warn");
  }
  appElements.logoutBtn.hidden = false;
}

function setSyncStatus(message, tone) {
  if (!appElements.syncStatus) {
    return;
  }

  appElements.syncStatus.textContent = message;
  appElements.syncStatus.hidden = !message;
  appElements.syncStatus.classList.remove("ok", "warn", "error");
  if (tone === "ok" || tone === "warn" || tone === "error") {
    appElements.syncStatus.classList.add(tone);
  }
}

function setAuthFormBusy(isBusy) {
  appElements.authEmailInput.disabled = isBusy;
  appElements.authPasswordInput.disabled = isBusy;
  appElements.authLoginBtn.disabled = isBusy;
  appElements.authRegisterBtn.disabled = isBusy;
}

function formatFirebaseAuthError(error) {
  const code = String(error?.code || "");

  switch (code) {
    case "auth/invalid-email":
      return "Invalid email format.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Invalid email or password.";
    case "auth/email-already-in-use":
      return "This email is already in use.";
    case "auth/weak-password":
      return "Password is too weak (minimum 6 characters).";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait and try again.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again.";
    default:
      return "Authentication failed. Please try again.";
  }
}

function formatFirestoreError(error) {
  const code = String(error?.code || "");

  switch (code) {
    case "permission-denied":
      return "Sync denied (check Firestore rules)";
    case "unavailable":
      return "Sync unavailable";
    case "not-found":
      return "Sync path not found";
    default:
      return "Sync error";
  }
}
