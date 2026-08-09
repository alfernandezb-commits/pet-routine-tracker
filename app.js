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
const cancelEditButton = document.getElementById("cancel-edit");

const firebaseConfig = window.FIREBASE_CONFIG || {};

if (!firebaseConfig.projectId) {
  setStatus("Add your Firebase config in index.html before using the app.");
  throw new Error("Missing Firebase config: projectId");
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const tasksCollection = collection(db, "tasks");
const resetStateRef = doc(db, "meta", "dailyReset");

let cachedTasks = [];
let isResetting = false;

function setStatus(message) {
  statusMessage.textContent = message || "";
}

function getTodayKey() {
  return new Date().toISOString().split("T")[0];
}

function showView(view) {
  const showDashboard = view === "dashboard";

  dashboardView.classList.toggle("hidden", !showDashboard);
  manageView.classList.toggle("hidden", showDashboard);
  dashboardToggle.classList.toggle("active", showDashboard);
  manageToggle.classList.toggle("active", !showDashboard);
}

function resetFormState() {
  taskForm.reset();
  taskIdInput.value = "";
  cancelEditButton.classList.add("hidden");
}

function formatTime(time) {
  if (!time) return "--:--";
  return time;
}

function renderTasks(tasks) {
  cachedTasks = tasks;

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

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(task.completed);
    checkbox.setAttribute("aria-label", `Mark ${task.name} complete`);
    checkbox.addEventListener("change", async () => {
      try {
        await updateDoc(doc(db, "tasks", task.id), {
          completed: checkbox.checked,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        setStatus(`Could not update task: ${error.message}`);
      }
    });

    const labelWrap = document.createElement("div");
    const name = document.createElement("div");
    name.className = "task-name";
    name.textContent = task.name;

    const time = document.createElement("div");
    time.className = "task-time";
    time.textContent = formatTime(task.scheduledTime);

    labelWrap.append(name, time);
    taskMain.append(checkbox, labelWrap);
    item.append(taskMain);

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

    const text = document.createElement("div");
    const name = document.createElement("div");
    name.className = "task-name";
    name.textContent = task.name;

    const time = document.createElement("div");
    time.className = "task-time";
    time.textContent = formatTime(task.scheduledTime);

    text.append(name, time);
    info.append(text);

    const actions = document.createElement("div");
    actions.className = "task-actions";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", () => {
      taskIdInput.value = task.id;
      taskNameInput.value = task.name;
      taskTimeInput.value = task.scheduledTime;
      cancelEditButton.classList.remove("hidden");
      showView("manage");
      taskNameInput.focus();
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.className = "danger";
    deleteButton.addEventListener("click", async () => {
      const confirmed = window.confirm(`Delete task \"${task.name}\"?`);
      if (!confirmed) return;

      try {
        await deleteDoc(doc(db, "tasks", task.id));
        if (taskIdInput.value === task.id) {
          resetFormState();
        }
      } catch (error) {
        setStatus(`Could not delete task: ${error.message}`);
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
  const existingTaskId = taskIdInput.value;

  if (!name || !scheduledTime) {
    setStatus("Task name and time are required.");
    return;
  }

  const payload = {
    name,
    scheduledTime,
    updatedAt: serverTimestamp(),
  };

  try {
    if (existingTaskId) {
      await updateDoc(doc(db, "tasks", existingTaskId), payload);
      setStatus("Task updated.");
    } else {
      await addDoc(tasksCollection, {
        ...payload,
        completed: false,
        createdAt: serverTimestamp(),
      });
      setStatus("Task added.");
    }

    resetFormState();
  } catch (error) {
    setStatus(`Could not save task: ${error.message}`);
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
    const lastResetDate = resetDoc.exists() ? resetDoc.data().lastResetDate : null;

    if (!lastResetDate || lastResetDate < today) {
      await resetAllTasksForToday();
      setStatus("Tasks reset for today.");
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
    setStatus(`Could not run daily reset: ${error.message}`);
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
      setStatus(`Realtime sync failed: ${error.message}`);
    },
  );

  onSnapshot(resetStateRef, () => {
    ensureDailyReset();
  });
}

function attachEventListeners() {
  dashboardToggle.addEventListener("click", () => showView("dashboard"));
  manageToggle.addEventListener("click", () => showView("manage"));

  taskForm.addEventListener("submit", handleTaskSubmit);
  cancelEditButton.addEventListener("click", resetFormState);
}

function bootstrap() {
  attachEventListeners();
  ensureDailyReset();
  startRealtimeSync();
  renderTasks(cachedTasks);
}

bootstrap();
