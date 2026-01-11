import { $ } from "./utils.js";
import * as logic from "./logic.js";

export function render(state) {
  $("cooldownInput").value = state.mvpCooldown;

  // persons table
  $("persons").innerHTML = state.persons.map(p => {
    const avg = p.placements?.length
      ? (p.placements.reduce((s, x) => s + x.place, 0) / p.placements.length).toFixed(2)
      : "-";

    return `
      <tr>
        <td>${escapeHtml(p.name)} ${p.title ? "★" : ""} ${p.blocked ? "✖" : ""}</td>
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

  // top 10 selects
  const top10 = $("top10");
  top10.innerHTML = "";
  for (let i = 1; i <= 10; i++) {
    top10.innerHTML += `
      <label>Place ${i}</label>
      <select id="place${i}">
        <option value="">---</option>
        ${state.persons.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("")}
      </select>
    `;
  }
}

export function readPlacements() {
  const map = new Map();
  for (let i = 1; i <= 10; i++) {
    const v = document.getElementById("place" + i).value;
    if (v && !map.has(v)) map.set(v, i);
  }
  return map;
}

export function setMvpResult(text) {
  $("mvpResult").innerText = text;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}