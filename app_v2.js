console.log("APP.JS VERSION", "v6-undo-admin");

// Firebase via CDN (GitHub Pages kompatibel)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/** Firebase Config (deins) */
const firebaseConfig = {
  apiKey: "AIzaSyAjWpYMV0xKUVqD2MdhmHdsv-CONgZ8iDM",
  authDomain: "zabini-mvp.firebaseapp.com",
  projectId: "zabini-mvp",
  storageBucket: "zabini-mvp.firebasestorage.app",
  messagingSenderId: "757946103220",
  appId: "1:757946103220:web:d56c1371db8c84aac7eee1"
};

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);

// UI: Login Gate
const loginOverlay = document.getElementById("loginOverlay");
const loginForm = document.getElementById("loginForm");
const passwordInput = document.getElementById("passwordInput");
const loginStatus = document.getElementById("loginStatus");
const appRoot = document.getElementById("appRoot");

// UI: Status Bar
const connStatus = document.getElementById("connStatus");
const saveStatus = document.getElementById("saveStatus");
const adminBadge = document.getElementById("adminBadge");

// UI: Import/Undo
const importFile = document.getElementById("importFile");
const importLabel = document.getElementById("importLabel");
const importBtn = document.getElementById("importBtn");
const resetBtn = document.getElementById("resetBtn");
const undoBtn = document.getElementById("undoBtn");

// UI: Admin overlay
const adminOverlay = document.getElementById("adminOverlay");
const adminForm = document.getElementById("adminForm");
const adminPasswordInput = document.getElementById("adminPasswordInput");
const adminStatus = document.getElementById("adminStatus");
const adminUnlockBtn = document.getElementById("adminUnlockBtn");
const adminLockBtn = document.getElementById("adminLockBtn");

function setLoginStatus(msg) {
  if (loginStatus) loginStatus.textContent = msg;
}

function showApp() {
  if (loginOverlay) loginOverlay.style.display = "none";
  if (appRoot) appRoot.style.display = "block";
}

function setConn(text) {
  if (connStatus) connStatus.textContent = text;
}

function setSaving(msg) {
  if (!saveStatus) return;
  saveStatus.textContent = msg || "";
}

function setAdminStatus(msg) {
  if (adminStatus) adminStatus.textContent = msg || "";
}

// Online/Offline events
window.addEventListener("online", () => setConn("🟢 Online"));
window.addEventListener("offline", () => setConn("🔴 Offline"));

// Firestore docs
const stateRef = doc(db, "state", "main");
const undoRef  = doc(db, "state", "undo");      // <-- Undo-Snapshot
const securityRef = doc(db, "config", "security");

// App state
let persons = [];
let events = [];
let mvpCooldown = 1;

const TITLE_PENALTY = 15;

// Admin session flag (nur im Browser)
let isAdmin = sessionStorage.getItem("isAdmin") === "1";

function applyAdminUi() {
  if (adminBadge) adminBadge.textContent = isAdmin ? "🛡 Admin" : "";
  if (importBtn) importBtn.disabled = !isAdmin;
  if (resetBtn) resetBtn.disabled = !isAdmin;
  if (undoBtn)  undoBtn.disabled  = !isAdmin;

  if (adminUnlockBtn) adminUnlockBtn.style.display = isAdmin ? "none" : "inline-block";
  if (adminLockBtn) adminLockBtn.style.display = isAdmin ? "inline-block" : "none";
}

applyAdminUi();

// Hash helper
async function sha256Hex(str) {
  const enc = new TextEncoder().encode(str);
  const hashBuf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function checkPasswordGate(plain) {
  const snap = await getDoc(securityRef);
  if (!snap.exists()) throw new Error("Firestore: config/security fehlt.");

  const sec = snap.data() || {};
  const hasHash = typeof sec.passwordHash === "string" && sec.passwordHash.length > 0;
  const hasPlain = typeof sec.password === "string" && sec.password.length > 0;

  if (!hasHash && !hasPlain) {
    throw new Error("config/security braucht passwordHash (empfohlen) oder password.");
  }

  if (hasHash) {
    const inputHash = await sha256Hex(plain);
    return inputHash === sec.passwordHash;
  }
  return plain === sec.password; // fallback
}

async function checkAdminPassword(plain) {
  const snap = await getDoc(securityRef);
  if (!snap.exists()) throw new Error("Firestore: config/security fehlt.");

  const sec = snap.data() || {};
  if (typeof sec.adminHash !== "string" || sec.adminHash.length === 0) {
    throw new Error("config/security braucht adminHash (string).");
  }

  const inputHash = await sha256Hex(plain);
  return inputHash === sec.adminHash;
}

async function ensureStateDoc() {
  const s = await getDoc(stateRef);
  if (!s.exists()) {
    await setDoc(stateRef, { persons: [], events: [], mvpCooldown: 1 });
  }
}

let unsubscribe = null;
async function startLiveSync() {
  await ensureStateDoc();

  if (unsubscribe) unsubscribe();

  unsubscribe = onSnapshot(
    stateRef,
    (snap) => {
      setConn(navigator.onLine ? "🟢 Online" : "🔴 Offline");
      const data = snap.data() || {};
      persons = Array.isArray(data.persons) ? data.persons : [];
      events = Array.isArray(data.events) ? data.events : [];
      mvpCooldown = typeof data.mvpCooldown === "number" ? data.mvpCooldown : 1;
      render();
    },
    (err) => {
      console.error(err);
      setConn("🔴 Sync-Fehler");
    }
  );
}

// Save (Debounce + Status)
let saving = false;
async function save() {
  if (saving) return;
  saving = true;
  setSaving("💾 Speichert…");

  try {
    await updateDoc(stateRef, { persons, events, mvpCooldown });
    setSaving("✅ Gespeichert");
    setTimeout(() => setSaving(""), 900);
  } catch (err) {
    console.error(err);
    setSaving("⚠️ Speichern fehlgeschlagen");
    setTimeout(() => setSaving(""), 2000);
  } finally {
    saving = false;
  }
}

/* =========================
   UNDO: Snapshot vor Import/Reset
   ========================= */

async function writeUndoSnapshot(actionLabel) {
  // holt aktuellen Stand (aus Firestore, nicht aus UI – sicherer)
  const snap = await getDoc(stateRef);
  const data = snap.data() || { persons: [], events: [], mvpCooldown: 1 };

  const undoPayload = {
    meta: {
      action: actionLabel,
      savedAt: new Date().toISOString()
    },
    state: {
      persons: Array.isArray(data.persons) ? data.persons : [],
      events: Array.isArray(data.events) ? data.events : [],
      mvpCooldown: typeof data.mvpCooldown === "number" ? data.mvpCooldown : 1
    }
  };

  await setDoc(undoRef, undoPayload);
}

async function undoLast() {
  if (!isAdmin) {
    alert("Admin-Mode erforderlich.");
    return;
  }

  const snap = await getDoc(undoRef);
  if (!snap.exists()) {
    alert("Kein Undo-Snapshot vorhanden (noch kein Import/Reset gemacht).");
    return;
  }

  const ok = confirm("Undo stellt den Stand vor dem letzten Import/Reset wieder her. Fortfahren?");
  if (!ok) return;

  try {
    setSaving("↩ Undo…");
    const data = snap.data() || {};
    const st = data.state || {};

    const nextPersons = Array.isArray(st.persons) ? st.persons : [];
    const nextEvents  = Array.isArray(st.events) ? st.events : [];
    const nextCooldown = typeof st.mvpCooldown === "number" ? st.mvpCooldown : 1;

    await setDoc(stateRef, { persons: nextPersons, events: nextEvents, mvpCooldown: nextCooldown });
    setSaving("✅ Undo fertig");
    setTimeout(() => setSaving(""), 1200);
  } catch (err) {
    console.error(err);
    setSaving("⚠️ Undo fehlgeschlagen");
    setTimeout(() => setSaving(""), 2000);
  }
}

/* =========================
   Backup / Restore / Reset
   ========================= */

function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function exportBackup() {
  setSaving("📦 Export…");
  try {
    const snap = await getDoc(stateRef);
    const data = snap.data() || { persons: [], events: [], mvpCooldown: 1 };

    const backup = {
      meta: { app: "hellcats-mvp", exportedAt: new Date().toISOString() },
      state: {
        persons: Array.isArray(data.persons) ? data.persons : [],
        events: Array.isArray(data.events) ? data.events : [],
        mvpCooldown: typeof data.mvpCooldown === "number" ? data.mvpCooldown : 1
      }
    };

    const fname = `hellcats-backup-${new Date().toISOString().slice(0,10)}.json`;
    downloadJson(fname, backup);
    setSaving("✅ Export fertig");
    setTimeout(() => setSaving(""), 1200);
  } catch (err) {
    console.error(err);
    setSaving("⚠️ Export fehlgeschlagen");
    setTimeout(() => setSaving(""), 2000);
  }
}

function triggerImport() {
  if (!isAdmin) {
    alert("Admin-Mode erforderlich.");
    return;
  }
  importFile?.click();
}

importFile?.addEventListener("change", async (e) => {
  if (!isAdmin) return;

  const file = e.target.files?.[0];
  if (!file) return;

  importLabel.textContent = file.name;

  const ok = confirm("Import überschreibt den aktuellen Stand in Firestore. (Undo wird automatisch erstellt) Fortfahren?");
  if (!ok) {
    importFile.value = "";
    return;
  }

  try {
    setSaving("⬆ Import… (Undo sichern)");
    await writeUndoSnapshot("import");

    const text = await file.text();
    const json = JSON.parse(text);
    const state = json.state ? json.state : json;

    const nextPersons = Array.isArray(state.persons) ? state.persons : [];
    const nextEvents  = Array.isArray(state.events) ? state.events : [];
    const nextCooldown = typeof state.mvpCooldown === "number" ? state.mvpCooldown : 1;

    await setDoc(stateRef, { persons: nextPersons, events: nextEvents, mvpCooldown: nextCooldown });

    setSaving("✅ Import fertig (Undo bereit)");
    setTimeout(() => setSaving(""), 1500);

    importFile.value = "";
  } catch (err) {
    console.error(err);
    setSaving("⚠️ Import fehlgeschlagen");
    setTimeout(() => setSaving(""), 2000);
  }
});

async function resetAll() {
  if (!isAdmin) {
    alert("Admin-Mode erforderlich.");
    return;
  }

  const ok = confirm("Wirklich ALLES resetten? (Undo wird automatisch erstellt)");
  if (!ok) return;

  try {
    setSaving("🗑 Reset… (Undo sichern)");
    await writeUndoSnapshot("reset");

    await setDoc(stateRef, { persons: [], events: [], mvpCooldown: 1 });

    setSaving("✅ Reset fertig (Undo bereit)");
    setTimeout(() => setSaving(""), 1500);
  } catch (err) {
    console.error(err);
    setSaving("⚠️ Reset fehlgeschlagen");
    setTimeout(() => setSaving(""), 2000);
  }
}

/* =========================
   Admin Overlay + Controls
   ========================= */

function openAdminOverlay() {
  setAdminStatus("");
  if (adminPasswordInput) adminPasswordInput.value = "";
  if (adminOverlay) adminOverlay.style.display = "grid";
  adminPasswordInput?.focus();
}

function closeAdminOverlay() {
  if (adminOverlay) adminOverlay.style.display = "none";
}

async function unlockAdmin(pass) {
  setAdminStatus("Prüfe…");
  try {
    const ok = await checkAdminPassword(pass);
    if (!ok) {
      setAdminStatus("❌ Falsches Admin-Passwort.");
      return;
    }

    isAdmin = true;
    sessionStorage.setItem("isAdmin", "1");
    applyAdminUi();
    setAdminStatus("✅ Admin aktiv.");
    setTimeout(() => closeAdminOverlay(), 450);
  } catch (err) {
    console.error(err);
    setAdminStatus("⚠️ " + (err?.message || "Fehler"));
  }
}

function lockAdmin() {
  isAdmin = false;
  sessionStorage.removeItem("isAdmin");
  applyAdminUi();
  alert("Admin-Mode deaktiviert.");
}

adminForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  await unlockAdmin(adminPasswordInput.value);
});

/* =========================
   MVP Logik (Storage = Firestore)
   ========================= */

function addPerson() {
  const input = document.getElementById("newName");
  const name = input.value.trim();
  if (!name) return;

  persons.push({
    id: crypto.randomUUID(),
    name,
    title: false,
    blocked: false,
    mvpCount: 0,
    cooldownLeft: 0,
    placements: []
  });

  input.value = "";
  save();
}

function toggleTitle(id) {
  const p = persons.find(p => p.id === id);
  if (!p) return;
  p.title = !p.title;
  save();
}

function toggleBlocked(id) {
  const p = persons.find(p => p.id === id);
  if (!p) return;
  p.blocked = !p.blocked;
  save();
}

function giveMVP(id) {
  persons.forEach(p => {
    if (p.cooldownLeft > 0) p.cooldownLeft--;
  });

  const p = persons.find(p => p.id === id);
  if (!p) return;
  p.mvpCount++;
  p.cooldownLeft = mvpCooldown;

  save();
}

function removePerson(id) {
  persons = persons.filter(p => p.id !== id);
  save();
}

function saveEvent() {
  const eventNr = events.length + 1;
  const placementsMap = new Map();

  for (let i = 1; i <= 10; i++) {
    const sel = document.getElementById("place" + i).value;
    if (!sel || placementsMap.has(sel)) continue;
    placementsMap.set(sel, i);
  }

  persons.forEach(p => {
    const place = placementsMap.get(p.id) ?? 15;
    p.placements.push({ event: eventNr, place });
  });

  events.push({ nr: eventNr });
  save();
  alert("Event " + eventNr + " saved");
}

function calculateMVP() {
  if (events.length === 0) {
    document.getElementById("mvpResult").innerText = "Not enough data (no events yet)";
    return;
  }

  let best = null;
  let bestScore = -Infinity;

  persons.forEach(p => {
    if (p.blocked) return;
    if (p.cooldownLeft > 0) return;
    if (!p.placements.length) return;

    const avgPlace =
      p.placements.reduce((sum, x) => sum + x.place, 0) /
      p.placements.length;

    let score = (20 - avgPlace) * 3 + (10 - p.mvpCount);
    if (p.title) score -= TITLE_PENALTY;

    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  });

  document.getElementById("mvpResult").innerText =
    best ? `Next MVP: ${best.name}` : "Not enough eligible persons";
}

function setCooldown(value) {
  mvpCooldown = Math.max(0, Number(value));
  save();
}

function render() {
  const personsBody = document.getElementById("persons");
  const top10Div = document.getElementById("top10");
  document.getElementById("cooldownInput").value = mvpCooldown;

  personsBody.innerHTML = persons.map(p => {
    const avg = p.placements.length
      ? (p.placements.reduce((s, x) => s + x.place, 0) / p.placements.length).toFixed(2)
      : "-";

    return `
      <tr>
        <td>${p.name} ${p.title ? "★" : ""} ${p.blocked ? "✖" : ""}</td>
        <td>${p.mvpCount}</td>
        <td>${avg}</td>
        <td>${p.cooldownLeft}</td>
        <td>
          <button onclick="toggleTitle('${p.id}')">Title</button>
          <button onclick="toggleBlocked('${p.id}')">${p.blocked ? "Unblock" : "Block"}</button>
          <button onclick="giveMVP('${p.id}')">MVP</button>
          <button onclick="removePerson('${p.id}')">✕</button>
        </td>
      </tr>
    `;
  }).join("");

  top10Div.innerHTML = "";
  for (let i = 1; i <= 10; i++) {
    top10Div.innerHTML += `
      <label>Place ${i}</label>
      <select id="place${i}">
        <option value="">---</option>
        ${persons.map(p => `<option value="${p.id}">${p.name}</option>`).join("")}
      </select>
    `;
  }
}

// onclick handlers (module scope)
window.addPerson = addPerson;
window.toggleTitle = toggleTitle;
window.toggleBlocked = toggleBlocked;
window.giveMVP = giveMVP;
window.removePerson = removePerson;
window.saveEvent = saveEvent;
window.calculateMVP = calculateMVP;
window.setCooldown = setCooldown;

// Backup handlers
window.exportBackup = exportBackup;
window.triggerImport = triggerImport;
window.resetAll = resetAll;

// Undo handler
window.undoLast = undoLast;

// Admin handlers
window.openAdminOverlay = openAdminOverlay;
window.closeAdminOverlay = closeAdminOverlay;
window.lockAdmin = lockAdmin;

// Optional: Enter adds person
document.getElementById("newName")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addPerson();
  }
});

// ---- Bootstrap ----
setConn(navigator.onLine ? "🟢 Online" : "🔴 Offline");
setLoginStatus("Verbinde…");

// Auth first (needed for Firestore writes)
await signInAnonymously(auth);

// Wait for password
setLoginStatus("Bitte Passwort eingeben.");

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setLoginStatus("Prüfe Passwort…");

  try {
    const ok = await checkPasswordGate(passwordInput.value);
    if (!ok) {
      setLoginStatus("❌ Falsches Passwort.");
      return;
    }

    setLoginStatus("✅ OK. Lade Daten…");
    showApp();
    await startLiveSync();
  } catch (err) {
    console.error(err);
    setLoginStatus("⚠️ " + (err?.message || "Fehler"));
  }
});