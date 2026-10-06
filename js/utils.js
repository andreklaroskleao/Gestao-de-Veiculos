const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "UTC" });

export const money = (value) => brl.format(Number(value) || 0);
export const decimal = (value, digits = 1) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(value) || 0);
export const formatDate = (value) => value ? date.format(new Date(`${String(value).slice(0, 10)}T12:00:00Z`)) : "—";
export const todayISO = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
export const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
export const numeric = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
export const shortNumber = (value) => number.format(Number(value) || 0);

export function toast(title, detail = "", type = "success") {
  const region = document.querySelector("#toast-region");
  const item = document.createElement("div");
  item.className = `toast ${type === "error" ? "error" : ""}`;
  item.innerHTML = `<strong>${escapeHtml(title)}</strong>${detail ? `<span class="toast-sub">${escapeHtml(detail)}</span>` : ""}`;
  region.append(item);
  window.setTimeout(() => item.remove(), 4600);
}

export function errorMessage(error) {
  if (/failed-precondition$/.test(error?.code || "") && error?.message) return error.message;
  const known = {
    "auth/popup-closed-by-user": "A janela de login foi fechada antes da conclusão.",
    "auth/popup-blocked": "O navegador bloqueou a janela de login. Tente novamente.",
    "permission-denied": "Sem permissão para essa ação. Confira o compartilhamento ou as regras do Firestore.",
    "unavailable": "O Firebase está temporariamente indisponível. Tente novamente.",
    "failed-precondition": "O Firestore precisa de uma configuração ou índice. Consulte o README.",
    "auth/unauthorized-domain": "Este domínio ainda não está autorizado no Firebase Authentication.",
  };
  return known[error?.code] || error?.message || "Não foi possível concluir a operação.";
}

export function csvDownload(filename, rows) {
  const csv = rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(";")).join("\r\n");
  downloadBlob(filename, `\uFEFF${csv}`, "text/csv;charset=utf-8");
}

export function jsonDownload(filename, value) {
  downloadBlob(filename, JSON.stringify(value, null, 2), "application/json;charset=utf-8");
}

function downloadBlob(filename, contents, type) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function initials(name = "Usuário") {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
}
