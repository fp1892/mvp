import { loadSecurity } from "./store.js";
import { sha256Hex } from "./utils.js";

export async function checkPasswordGate(pass) {
  const sec = await loadSecurity();
  if (!sec?.passwordHash) return false;
  const hash = await sha256Hex(pass);
  return hash === sec.passwordHash;
}

export async function checkAdminPassword(pass) {
  const sec = await loadSecurity();
  if (!sec?.adminHash) return false;
  const hash = await sha256Hex(pass);
  return hash === sec.adminHash;
}