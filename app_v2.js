console.log("APP.JS VERSION", "v1-final-firestore");

// 🔥 Firebase CDN (GitHub Pages kompatibel)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// 🔐 Firebase Config (DEINS)
const firebaseConfig = {
  apiKey: "AIzaSyAjWpYMV0xKUVqD2MdhmHdsv-CONgZ8iDM",
  authDomain: "zabini-mvp.firebaseapp.com",
  projectId: "zabini-mvp",
  storageBucket: "zabini-mvp.firebasestorage.app",
  messagingSenderId: "757946103220",
  appId: "1:757946103220:web:d56c1371db8c84aac7eee1"
};

// Init
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// 🔑 Anonymes Login
await signInAnonymously(auth);

// 📄 Firestore State
const stateRef = doc(db, "state", "main");

// Initial anlegen, falls nicht da
const snap = await getDoc(stateRef);
if (!snap.exists()) {
  await setDoc(stateRef, {
    persons: [],
    events: [],
    mvpCooldown: 1
  });
}

// ---------------- STATE ----------------
let persons = [];
let events = [];
let mvpCooldown = 1;

const TITLE_PENALTY = 15;

// 🔁 Live Sync
onSnapshot(stateRef, (snap) => {
  const data = snap.data();
  persons = data.persons || [];
  events = data.events || [];
  mvpCooldown = data.mvpCooldown ?? 1;
  render();
});

// 💾 Save
async function save() {
  await updateDoc(stateRef, {
    persons,
    events,
    mvpCooldown
  });
}

// ---------------- LOGIK ----------------
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
  p.title = !p.title;
  save();
}

function toggleBlocked(id) {
  const p = persons.find(p => p.id === id);
  p.blocked = !p.blocked;
  save();
}

function giveMVP(id) {
  persons.forEach(p => {
    if (p.cooldownLeft > 0) p.cooldownLeft--;
  });

  const p = persons.find(p => p.id === id);
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
    document.getElementById("mvpResult").innerText =
      "Not enough data";
    return;
  }

  let best = null;
  let bestScore = -Infinity;

  persons.forEach(p => {
    if (p.blocked || p.cooldownLeft > 0 || !p.placements.length) return;

    const avg =
      p.placements.reduce((s, x) => s + x.place, 0) /
      p.placements.length;

    let score = (20 - avg) * 3 + (10 - p.mvpCount);
    if (p.title) score -= TITLE_PENALTY;

    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  });

  document.getElementById("mvpResult").innerText =
    best ? `Next MVP: ${best.name}` : "No eligible MVP";
}

function setCooldown(value) {
  mvpCooldown = Math.max(0, Number(value));
  save();
}

// ---------------- RENDER ----------------
function render() {
  document.getElementById("cooldownInput").value = mvpCooldown;

  const personsBody = document.getElementById("persons");
  personsBody.innerHTML = persons.map(p => {
    const avg = p.placements.length
      ? (
          p.placements.reduce((s, x) => s + x.place, 0) /
          p.placements.length
        ).toFixed(2)
      : "-";

    return `
      <tr>
        <td>${p.name} ${p.title ? "★" : ""} ${p.blocked ? "✖" : ""}</td>
        <td>${p.mvpCount}</td>
        <td>${avg}</td>
        <td>${p.cooldownLeft}</td>
        <td>
          <button onclick="toggleTitle('${p.id}')">Title</button>
          <button onclick="toggleBlocked('${p.id}')">
            ${p.blocked ? "Unblock" : "Block"}
          </button>
          <button onclick="giveMVP('${p.id}')">MVP</button>
          <button onclick="removePerson('${p.id}')">✕</button>
        </td>
      </tr>
    `;
  }).join("");

  const top10Div = document.getElementById("top10");
  top10Div.innerHTML = "";
  for (let i = 1; i <= 10; i++) {
    top10Div.innerHTML += `
      <label>Place ${i}</label>
      <select id="place${i}">
        <option value="">---</option>
        ${persons.map(p =>
          `<option value="${p.id}">${p.name}</option>`
        ).join("")}
      </select>
    `;
  }
}

// 🔓 Expose für HTML onclick
window.addPerson = addPerson;
window.toggleTitle = toggleTitle;
window.toggleBlocked = toggleBlocked;
window.giveMVP = giveMVP;
window.removePerson = removePerson;
window.saveEvent = saveEvent;
window.calculateMVP = calculateMVP;
window.setCooldown = setCooldown;