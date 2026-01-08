console.log("APP.JS VERSION", "v6-undo-admin-FIXED");

/* =========================
   Firebase Setup
   ========================= */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

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

/* =========================
   DOM References
   ========================= */
const loginOverlay = document.getElementById("loginOverlay");
const loginForm = document.getElementById("loginForm");
const passwordInput = document.getElementById("passwordInput");
const loginStatus = document.getElementById("loginStatus");
const appRoot = document.getElementById("appRoot");

const connStatus = document.getElementById("connStatus");
const saveStatus = document.getElementById("saveStatus");
const adminBadge = document.getElementById("adminBadge");

const adminOverlay = document.getElementById("adminOverlay");
const adminForm = document.getElementById("adminForm");
const adminPasswordInput = document.getElementById("adminPasswordInput");
const adminStatus = document.getElementById("adminStatus");
const adminUnlockBtn = document.getElementById("adminUnlockBtn");
const adminLockBtn = document.getElementById("adminLockBtn");

const importFile = document.getElementById("importFile");
const importBtn = document.getElementById("importBtn");
const resetBtn = document.getElementById("resetBtn");
const undoBtn = document.getElementById("undoBtn");

/* =========================
   Firestore Refs
   ========================= */
const stateRef = doc(db, "state", "main");
const undoRef  = doc(db, "state", "undo");
const securityRef = doc(db, "config", "security");

/* =========================
   State
   ========================= */
let persons = [];
let events = [];
let mvpCooldown = 1;
const TITLE_PENALTY = 15;

let isAdmin = sessionStorage.getItem("isAdmin") === "1";

/* =========================
   Helpers
   ========================= */
function setLoginStatus(msg) { loginStatus.textContent = msg; }
function setConn(msg) { connStatus.textContent = msg; }
function setSaving(msg = "") { saveStatus.textContent = msg; }
function setAdminStatus(msg = "") { adminStatus.textContent = msg; }

function showApp() {
  loginOverlay.style.display = "none";
  appRoot.style.display = "block";
}

function applyAdminUi() {
  adminBadge.textContent = isAdmin ? "🛡 Admin" : "";
  importBtn.disabled = !isAdmin;
  resetBtn.disabled = !isAdmin;
  undoBtn.disabled = !isAdmin;
  adminUnlockBtn.style.display = isAdmin ? "none" : "inline-block";
  adminLockBtn.style.display = isAdmin ? "inline-block" : "none";
}

/* =========================
   Crypto / Auth
   ========================= */
async function sha256Hex(str) {
  const enc = new TextEncoder().encode(str);
  const hashBuf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2,"0")).join("");
}

async function checkPasswordGate(pass) {
  const snap = await getDoc(securityRef);
  const sec = snap.data();
  const hash = await sha256Hex(pass);
  return hash === sec.passwordHash;
}

async function checkAdminPassword(pass) {
  const snap = await getDoc(securityRef);
  const sec = snap.data();
  const hash = await sha256Hex(pass);
  return hash === sec.adminHash;
}

/* =========================
   Firestore Sync
   ========================= */
async function ensureStateDoc() {
  const snap = await getDoc(stateRef);
  if (!snap.exists()) {
    await setDoc(stateRef, { persons: [], events: [], mvpCooldown: 1 });
  }
}

async function startLiveSync() {
  await ensureStateDoc();
  onSnapshot(stateRef, snap => {
    const d = snap.data();
    persons = d.persons || [];
    events = d.events || [];
    mvpCooldown = d.mvpCooldown ?? 1;
    render();
    setConn("🟢 Online");
  });
}

let saving = false;
async function save() {
  if (saving) return;
  saving = true;
  setSaving("💾 Speichert…");
  await updateDoc(stateRef, { persons, events, mvpCooldown });
  setSaving("✅ Gespeichert");
  setTimeout(() => setSaving(""), 900);
  saving = false;
}

/* =========================
   Undo
   ========================= */
async function writeUndoSnapshot(label) {
  const snap = await getDoc(stateRef);
  await setDoc(undoRef, {
    meta: { label, at: new Date().toISOString() },
    state: snap.data()
  });
}

async function undoLast() {
  if (!isAdmin) return alert("Admin erforderlich");
  const snap = await getDoc(undoRef);
  if (!snap.exists()) return alert("Kein Undo vorhanden");
  await setDoc(stateRef, snap.data().state);
}

/* =========================
   Backup / Reset
   ========================= */
async function exportBackup() {
  const snap = await getDoc(stateRef);
  const blob = new Blob([JSON.stringify(snap.data(), null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "hellcats-backup.json";
  a.click();
}

async function resetAll() {
  if (!isAdmin) return alert("Admin erforderlich");
  await writeUndoSnapshot("reset");
  await setDoc(stateRef, { persons: [], events: [], mvpCooldown: 1 });
}

/* =========================
   Admin Overlay
   ========================= */
function openAdminOverlay() {
  adminOverlay.style.display = "grid";
  adminPasswordInput.value = "";
}

function closeAdminOverlay() {
  adminOverlay.style.display = "none";
}

async function unlockAdmin(pass) {
  setAdminStatus("Prüfe…");
  if (!(await checkAdminPassword(pass))) {
    setAdminStatus("❌ Falsches Passwort");
    return;
  }
  isAdmin = true;
  sessionStorage.setItem("isAdmin","1");
  applyAdminUi();
  closeAdminOverlay();
}

function lockAdmin() {
  isAdmin = false;
  sessionStorage.removeItem("isAdmin");
  applyAdminUi();
}

/* =========================
   MVP Logic
   ========================= */
function addPerson() {
  const input = document.getElementById("newName");
  if (!input.value.trim()) return;
  persons.push({
    id: crypto.randomUUID(),
    name: input.value.trim(),
    title:false, blocked:false,
    mvpCount:0, cooldownLeft:0, placements:[]
  });
  input.value="";
  save();
}

function toggleTitle(id){ persons.find(p=>p.id===id).title^=1; save(); }
function toggleBlocked(id){ persons.find(p=>p.id===id).blocked^=1; save(); }

function giveMVP(id){
  persons.forEach(p=>p.cooldownLeft>0&&p.cooldownLeft--);
  const p=persons.find(p=>p.id===id);
  p.mvpCount++; p.cooldownLeft=mvpCooldown;
  save();
}

function removePerson(id){ persons=persons.filter(p=>p.id!==id); save(); }

function saveEvent(){
  const eventNr=events.length+1;
  const map=new Map();
  for(let i=1;i<=10;i++){
    const v=document.getElementById("place"+i).value;
    if(v&&!map.has(v)) map.set(v,i);
  }
  persons.forEach(p=>p.placements.push({event:eventNr,place:map.get(p.id)??15}));
  events.push({nr:eventNr});
  save();
}

function calculateMVP(){
  let best=null,bestScore=-1e9;
  persons.forEach(p=>{
    if(p.blocked||p.cooldownLeft||!p.placements.length) return;
    const avg=p.placements.reduce((s,x)=>s+x.place,0)/p.placements.length;
    let score=(20-avg)*3+(10-p.mvpCount)-(p.title?TITLE_PENALTY:0);
    if(score>bestScore){bestScore=score;best=p;}
  });
  document.getElementById("mvpResult").innerText=best?`Next MVP: ${best.name}`:"—";
}

function setCooldown(v){ mvpCooldown=Math.max(0,+v); save(); }

function render(){
  document.getElementById("cooldownInput").value=mvpCooldown;
  document.getElementById("persons").innerHTML=persons.map(p=>`
    <tr>
      <td>${p.name} ${p.title?"★":""} ${p.blocked?"✖":""}</td>
      <td>${p.mvpCount}</td>
      <td>${p.placements.length?(p.placements.reduce((s,x)=>s+x.place,0)/p.placements.length).toFixed(2):"-"}</td>
      <td>${p.cooldownLeft}</td>
      <td>
        <button onclick="toggleTitle('${p.id}')">Title</button>
        <button onclick="toggleBlocked('${p.id}')">${p.blocked?"Unblock":"Block"}</button>
        <button onclick="giveMVP('${p.id}')">MVP</button>
        <button onclick="removePerson('${p.id}')">✕</button>
      </td>
    </tr>`).join("");
}

/* =========================
   GLOBAL EXPORTS (FIX)
   ========================= */
window.addPerson = addPerson;
window.toggleTitle = toggleTitle;
window.toggleBlocked = toggleBlocked;
window.giveMVP = giveMVP;
window.removePerson = removePerson;
window.saveEvent = saveEvent;
window.calculateMVP = calculateMVP;
window.setCooldown = setCooldown;

window.exportBackup = exportBackup;
window.resetAll = resetAll;
window.undoLast = undoLast;

window.openAdminOverlay = openAdminOverlay;
window.closeAdminOverlay = closeAdminOverlay;
window.lockAdmin = lockAdmin;

/* =========================
   Bootstrap
   ========================= */
applyAdminUi();
setConn("🔌 Verbinde…");
setLoginStatus("Verbinde…");

await signInAnonymously(auth);
setLoginStatus("Bitte Passwort eingeben.");

loginForm.addEventListener("submit", async e=>{
  e.preventDefault();
  if(!(await checkPasswordGate(passwordInput.value))){
    setLoginStatus("❌ Falsches Passwort");
    return;
  }
  showApp();
  startLiveSync();
});

adminForm.addEventListener("submit", async e=>{
  e.preventDefault();
  await unlockAdmin(adminPasswordInput.value);
});