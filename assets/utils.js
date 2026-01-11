export function $(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
}

export function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

export async function sha256Hex(str) {
  const enc = new TextEncoder().encode(str);
  const hashBuf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

export async function readJsonFile(file) {
  const txt = await file.text();
  return JSON.parse(txt);
}