import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

// ---------- Icons ----------
// Each task type maps to a small inline SVG so the icon always matches the
// current theme color (via currentColor) with no extra image requests.
const TYPE_ICONS = {
  pill: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="9" width="18" height="6" rx="3" transform="rotate(-45 12 12)"/><line x1="12" y1="5.5" x2="12" y2="18.5" transform="rotate(-45 12 12)"/></svg>',
  syrup:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3h4v3.2c1.4.9 2.5 2.4 2.5 4.3v8a2.5 2.5 0 0 1-2.5 2.5h-4A2.5 2.5 0 0 1 7.5 18.5v-8c0-1.9 1.1-3.4 2.5-4.3V3z"/><line x1="9" y1="3" x2="15" y2="3"/><line x1="7.5" y1="13" x2="16.5" y2="13"/></svg>',
  food: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="9" rx="8" ry="3"/><path d="M4 9v3c0 3.5 3.6 6 8 6s8-2.5 8-6V9"/><circle cx="9" cy="8.6" r="0.6" fill="currentColor" stroke="none"/><circle cx="12" cy="7.8" r="0.6" fill="currentColor" stroke="none"/><circle cx="15" cy="8.6" r="0.6" fill="currentColor" stroke="none"/></svg>',
};
const DEFAULT_TYPE = "pill";

function iconMarkup(type) {
  return TYPE_ICONS[type] || TYPE_ICONS[DEFAULT_TYPE];
}

// ---------- Elements ----------
const themeToggle = document.getElementById("theme-toggle");
const configBanner = document.getElementById("config-banner");

const dashboardView = document.getElementById("dashboard-view");
const manageView = document.getElementById("manage-view");
const dashboardToggle = document.getElementById("show-dashboard");
const manageToggle = document.getElementById("show-manage");

const dashboardTaskList = document.getElementById("dashboard-task-list");
const manageTaskList = document.getElementById("manage-task-list");
const dashboardEmpty = document.getElementById("dashboard-empty");
const manageEmpty = document.getElementById("manage-empty");
const statusMessage = document.getElementById("status-message");

const taskForm = document.getElementById("task-form");
const taskIdInput = document.getElementById("task-id");
const taskNameInput = document.getElementById("task-name");
const taskTimeInput = document.getElementById("task-time");
const taskTypeInput = document.getElementById("task-type");
const typeOptionButtons = Array.from(document.querySelectorAll(".type-option"));
const cancelEditButton = document.getElementById("cancel-edit");

// ---------- Theme (works with or without Firebase) ----------
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  themeToggle.setAttribute(
    "aria-label",
    theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro",
  );
}

function initTheme() {
  const stored = localStorage.getItem("petRoutineTheme");
  const prefersDark =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(stored || (prefersDark ? "dark" : "light"));
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
  localStorage.setItem("petRoutineTheme", next);
}

// ---------- View switching (works with or without Firebase) ----------
function showView(view) {
  const showDashboard = view === "dashboard";

  dashboardView.classList.toggle("hidden", !showDashboard);
  manageView.classList.toggle("hidden", showDashboard);
  dashboardToggle.classList.toggle("active", showDashboard);
  manageToggle.classList.toggle("active", !showDashboard);
}

// ---------- Type picker (works with or without Firebase) ----------
function setSelectedType(type) {
  taskTypeInput.value = type;
  typeOptionButtons.forEach((button) => {
    const isSelected = button.dataset.type === type;
    button.classList.toggle("selected", isSelected);
    button.setAttribute("aria-checked", String(isSelected));
  });
}

function attachTypePicker() {
  typeOptionButtons.forEach((button) => {
    button.addEventListener("click", () =>
      setSelectedType(button.dataset.type),
    );
  });
  setSelectedType(DEFAULT_TYPE);
}

function setStatus(message) {
  statusMessage.textContent = message || "";
}

function resetFormState() {
  taskForm.reset();
  taskIdInput.value = "";
  setSelectedType(DEFAULT_TYPE);
  cancelEditButton.classList.add("hidden");
}

function formatTime(time) {
  if (!time) return "--:--";
  return time;
}

// ---------- UI wiring that never depends on Firebase ----------
function attachBaseEventListeners() {
  themeToggle.addEventListener("click", toggleTheme);
  dashboardToggle.addEventListener("click", () => showView("dashboard"));
  manageToggle.addEventListener("click", () => showView("manage"));
  cancelEditButton.addEventListener("click", resetFormState);
  attachTypePicker();
}

initTheme();
attachBaseEventListeners();

// ---------- Firebase-backed data layer ----------
const firebaseConfig = window.FIREBASE_CONFIG || {};

if (!firebaseConfig.projectId) {
  configBanner.classList.remove("hidden");
  setStatus(
    "Conectá Firebase para poder guardar y sincronizar los remedios (ver README.md).",
  );

  // The form still gets a listener so the person sees a clear message instead
  // of a silently broken button.
  taskForm.addEventListener("submit", (event) => {
    event.preventDefault();
    setStatus(
      "Todavía no se puede guardar: falta configurar Firebase (ver README.md).",
    );
  });
} else {
  runApp(firebaseConfig);
}

function runApp(config) {
  const app = initializeApp(config);
  const db = getFirestore(app);
  const tasksCollection = collection(db, "tasks");
  const resetStateRef = doc(db, "meta", "dailyReset");

  let isResetting = false;

  function getTodayKey() {
    return new Date().toISOString().split("T")[0];
  }

  function renderTasks(tasks) {
    renderDashboardList(tasks);
    renderManageList(tasks);

    const hasTasks = tasks.length > 0;
    dashboardEmpty.classList.toggle("hidden", hasTasks);
    manageEmpty.classList.toggle("hidden", hasTasks);
  }

  function renderDashboardList(tasks) {
    dashboardTaskList.innerHTML = "";

    tasks.forEach((task) => {
      const item = document.createElement("li");
      item.className = `task-item ${task.completed ? "task-completed" : ""}`;

      const taskMain = document.createElement("div");
      taskMain.className = "task-main";

      const iconBadge = document.createElement("span");
      iconBadge.className = "task-icon-badge";
      iconBadge.innerHTML = iconMarkup(task.type);

      const labelWrap = document.createElement("div");
      labelWrap.className = "task-text";
      const name = document.createElement("div");
      name.className = "task-name";
      name.textContent = task.name;

      const time = document.createElement("div");
      time.className = "task-time";
      time.textContent = formatTime(task.scheduledTime);

      labelWrap.append(name, time);
      taskMain.append(iconBadge, labelWrap);

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = `task-toggle ${task.completed ? "done" : ""}`;
      toggle.textContent = task.completed ? "Hecho ✓" : "Marcar hecho";
      toggle.addEventListener("click", async () => {
        toggle.disabled = true;
        try {
          await updateDoc(doc(db, "tasks", task.id), {
            completed: !task.completed,
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          setStatus(`No se pudo actualizar: ${error.message}`);
        } finally {
          toggle.disabled = false;
        }
      });

      item.append(taskMain, toggle);
      dashboardTaskList.append(item);
    });
  }

  function renderManageList(tasks) {
    manageTaskList.innerHTML = "";

    tasks.forEach((task) => {
      const item = document.createElement("li");
      item.className = "task-item";

      const info = document.createElement("div");
      info.className = "task-main";

      const iconBadge = document.createElement("span");
      iconBadge.className = "task-icon-badge";
      iconBadge.innerHTML = iconMarkup(task.type);

      const text = document.createElement("div");
      text.className = "task-text";
      const name = document.createElement("div");
      name.className = "task-name";
      name.textContent = task.name;

      const time = document.createElement("div");
      time.className = "task-time";
      time.textContent = formatTime(task.scheduledTime);

      text.append(name, time);
      info.append(iconBadge, text);

      const actions = document.createElement("div");
      actions.className = "task-actions";

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.textContent = "Editar";
      editButton.addEventListener("click", () => {
        taskIdInput.value = task.id;
        taskNameInput.value = task.name;
        taskTimeInput.value = task.scheduledTime;
        setSelectedType(task.type || DEFAULT_TYPE);
        cancelEditButton.classList.remove("hidden");
        showView("manage");
        taskNameInput.focus();
      });

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.textContent = "Borrar";
      deleteButton.className = "danger";
      deleteButton.addEventListener("click", async () => {
        const confirmed = window.confirm(`¿Borrar "${task.name}"?`);
        if (!confirmed) return;

        try {
          await deleteDoc(doc(db, "tasks", task.id));
          if (taskIdInput.value === task.id) {
            resetFormState();
          }
        } catch (error) {
          setStatus(`No se pudo borrar: ${error.message}`);
        }
      });

      actions.append(editButton, deleteButton);
      item.append(info, actions);
      manageTaskList.append(item);
    });
  }

  async function handleTaskSubmit(event) {
    event.preventDefault();

    const name = taskNameInput.value.trim();
    const scheduledTime = taskTimeInput.value;
    const type = taskTypeInput.value || DEFAULT_TYPE;
    const existingTaskId = taskIdInput.value;

    if (!name || !scheduledTime) {
      setStatus("Falta el nombre o el horario.");
      return;
    }

    const payload = {
      name,
      scheduledTime,
      type,
      updatedAt: serverTimestamp(),
    };

    try {
      if (existingTaskId) {
        await updateDoc(doc(db, "tasks", existingTaskId), payload);
        setStatus("Guardado.");
      } else {
        await addDoc(tasksCollection, {
          ...payload,
          completed: false,
          createdAt: serverTimestamp(),
        });
        setStatus("Agregado.");
      }

      resetFormState();
    } catch (error) {
      setStatus(`No se pudo guardar: ${error.message}`);
    }
  }

  async function resetAllTasksForToday() {
    const snapshot = await getDocs(tasksCollection);
    const batch = writeBatch(db);

    snapshot.forEach((taskDoc) => {
      batch.update(taskDoc.ref, {
        completed: false,
        updatedAt: serverTimestamp(),
      });
    });

    batch.set(
      resetStateRef,
      {
        lastResetDate: getTodayKey(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    await batch.commit();
  }

  async function ensureDailyReset() {
    if (isResetting) return;

    isResetting = true;

    try {
      const today = getTodayKey();
      const resetDoc = await getDoc(resetStateRef);
      const lastResetDate = resetDoc.exists()
        ? resetDoc.data().lastResetDate
        : null;

      if (!lastResetDate || lastResetDate < today) {
        await resetAllTasksForToday();
        return;
      }

      await setDoc(
        resetStateRef,
        {
          lastResetDate,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    } catch (error) {
      setStatus(`No se pudo reiniciar el día: ${error.message}`);
    } finally {
      isResetting = false;
    }
  }

  function startRealtimeSync() {
    const tasksQuery = query(tasksCollection, orderBy("scheduledTime", "asc"));

    onSnapshot(
      tasksQuery,
      (snapshot) => {
        const tasks = snapshot.docs.map((taskDoc) => ({
          id: taskDoc.id,
          ...taskDoc.data(),
        }));

        renderTasks(tasks);
      },
      (error) => {
        setStatus(`Falló la sincronización: ${error.message}`);
      },
    );

    onSnapshot(resetStateRef, () => {
      ensureDailyReset();
    });
  }

  taskForm.addEventListener("submit", handleTaskSubmit);

  setStatus("");
  ensureDailyReset();
  startRealtimeSync();
}

