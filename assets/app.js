console.log("APP VERSION", "v7-modular-structure");

import { ensureAnonAuth } from "./firebase.js";
import { $, sleep } from "./utils.js";
import * as store from "./store.js";
import * as gate from "./auth-gate.js";
import * as logic from "./logic.js";
import * as ui from "./ui.js";

let state = logic.defaultState();

// status helpers
function setLoginStatus(msg) { $("loginStatus").textContent = msg; }
function setConn(msg) { $("connStatus").textContent = msg; }
function setSaving(msg="") { $("saveStatus").textContent = msg; }
function setAdminStatus(msg="") { $("adminStatus").textContent = msg; }

function showApp() {
  $("loginOverlay").style.display = "none";
  $("appRoot").style.display = "block";
}

let isAdmin = sessionStorage.getItem("isAdmin") === "1";
function applyAdminUi() {
  $("adminBadge").textContent = isAdmin ? "🛡 Admin" : "";
  $("importBtn").disabled = !isAdmin;
  $("resetBtn").disabled = !isAdmin;
  $("undoBtn").disabled = !isAdmin;
  $("adminUnlockBtn").style.display = isAdmin ? "none" : "inline-block";
  $("adminLockBtn").style.display = isAdmin ? "inline-block" : "none";
}

function openAdminOverlay() {
  $("adminOverlay").style.display = "grid";
  $("adminPasswordInput").value = "";
  setAdminStatus("");
}
function closeAdminOverlay() {
  $("adminOverlay").style.display = "none";
}

async function unlockAdmin(pass) {
  setAdminStatus("Prüfe…");
  const ok = await gate.checkAdminPassword(pass);
  if (!ok) return setAdminStatus("❌ Falsches Passwort");
  isAdmin = true;
  sessionStorage.setItem("isAdmin", "1");
  applyAdminUi();
  closeAdminOverlay();
}

function lockAdmin() {
  isAdmin = false;
  sessionStorage.removeItem("isAdmin");
  applyAdminUi();
}

// expose overlay funcs globally for onclick
window.openAdminOverlay = openAdminOverlay;
window.closeAdminOverlay = closeAdminOverlay;
window.lockAdmin = lockAdmin;

// app actions (global for onclick in rendered table)
window.addPerson = async function () {
  const input = $("newName");
  state = logic.addPerson(state, input.value);
  input.value = "";
  await persist();
};

window.toggleTitle = async function (id) { state = logic.toggleTitle(state, id); await persist(); };
window.toggleBlocked = async function (id) { state = logic.toggleBlocked(state, id); await persist(); };
window.giveMVP = async function (id) { state = logic.giveMVP(state, id); await persist(); };
window.removePerson = async function (id) { state = logic.removePerson(state, id); await persist(); };

window.saveEvent = async function () {
  const placements = ui.readPlacements();
  state = logic.saveEvent(state, placements);
  await persist();
};

window.calculateMVP = function () {
  ui.setMvpResult(logic.calculateNextMVP(state));
};

window.setCooldown = async function (v) {
  state = logic.setCooldown(state, v);
  await persist();
};

// backup / admin actions
window.exportBackup = async function () {
  const snap = await (await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js"))
    .then(() => null); // no-op; kept for compatibility
  // Export from our current state (already synced)
  const { downloadJson } = await import("./utils.js");
  downloadJson("hellcats-backup.json", state);
};

window.resetAll = async function () {
  if (!isAdmin) return alert("Admin erforderlich");
  await store.writeUndoSnapshot("reset");
  state = logic.defaultState();
  await store.overwriteState(state);
};

window.undoLast = async function () {
  if (!isAdmin) return alert("Admin erforderlich");
  const undo = await store.restoreUndo();
  if (!undo) return alert("Kein Undo vorhanden");
  await store.overwriteState(undo);
};

async function persist() {
  setSaving("💾 Speichert…");
  await store.saveState(state);
  setSaving("✅ Gespeichert");
  await sleep(600);
  setSaving("");
}

// import button (admin)
$("importBtn").addEventListener("click", async () => {
  if (!isAdmin) return alert("Admin erforderlich");
  const f = $("importFile").files?.[0];
  if (!f) return alert("Bitte JSON-Datei auswählen");
  const { readJsonFile } = await import("./utils.js");
  const data = await readJsonFile(f);
  await store.writeUndoSnapshot("import");
  await store.overwriteState(data);
});

$("adminForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  await unlockAdmin($("adminPasswordInput").value);
});

// bootstrap
applyAdminUi();
setConn("🔌 Verbinde…");
setLoginStatus("Verbinde…");

await ensureAnonAuth();
setLoginStatus("Bitte Passwort eingeben.");

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const ok = await gate.checkPasswordGate($("passwordInput").value);
  if (!ok) return setLoginStatus("❌ Falsches Passwort");

  showApp();
  setConn("🟢 Online");

  await store.ensureStateDoc();
  store.subscribeState((incoming) => {
    state = { ...logic.defaultState(), ...incoming };
    ui.render(state);
  });
});