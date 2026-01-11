const TITLE_PENALTY = 15;

export function defaultState() {
  return { persons: [], events: [], mvpCooldown: 1 };
}

export function addPerson(state, name) {
  const n = name.trim();
  if (!n) return state;

  state.persons.push({
    id: crypto.randomUUID(),
    name: n,
    title: false,
    blocked: false,
    mvpCount: 0,
    cooldownLeft: 0,
    placements: []
  });
  return state;
}

export function toggleTitle(state, id) {
  const p = state.persons.find(p => p.id === id);
  if (p) p.title = !p.title;
  return state;
}

export function toggleBlocked(state, id) {
  const p = state.persons.find(p => p.id === id);
  if (p) p.blocked = !p.blocked;
  return state;
}

export function giveMVP(state, id) {
  state.persons.forEach(p => { if (p.cooldownLeft > 0) p.cooldownLeft--; });
  const p = state.persons.find(p => p.id === id);
  if (p) {
    p.mvpCount++;
    p.cooldownLeft = state.mvpCooldown;
  }
  return state;
}

export function removePerson(state, id) {
  state.persons = state.persons.filter(p => p.id !== id);
  return state;
}

export function saveEvent(state, placementsById) {
  const eventNr = state.events.length + 1;
  state.persons.forEach(p => {
    const place = placementsById.get(p.id) ?? 15;
    p.placements.push({ event: eventNr, place });
  });
  state.events.push({ nr: eventNr });
  return state;
}

export function setCooldown(state, value) {
  state.mvpCooldown = Math.max(0, Number(value) || 0);
  return state;
}

export function calculateNextMVP(state) {
  let best = null;
  let bestScore = -Infinity;

  for (const p of state.persons) {
    if (p.blocked) continue;
    if (p.cooldownLeft > 0) continue;
    if (!p.placements?.length) continue;

    const avg =
      p.placements.reduce((s, x) => s + x.place, 0) / p.placements.length;

    let score = (20 - avg) * 3 + (10 - p.mvpCount);
    if (p.title) score -= TITLE_PENALTY;

    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }

  return best ? `Next MVP: ${best.name}` : "—";
}