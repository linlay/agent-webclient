import type { WebappLaunch } from "@/shared/data/api/dto/webapps";

// A launch credential is submitted only in a one-time POST body. It must never
// enter navigation URLs, browser history, storage, logs or the opener channel.
export function submitWebappLaunch(launch: WebappLaunch, documentRef = document): void {
  const action = new URL(launch.action);
  if ((action.protocol !== "https:" && !(action.protocol === "http:" && action.hostname === "127.0.0.1" && Number(action.port) >= 1024)) || action.username || action.password || action.search || action.hash || action.pathname !== "/__desktop/session/exchange" || !launch.ticket || !Number.isSafeInteger(launch.expiresAt) || launch.expiresAt <= Date.now()) throw new Error("webapp_ticket_invalid");
  const form = documentRef.createElement("form");
  form.method = "POST"; form.action = action.href; form.target = "_blank"; form.rel = "noopener noreferrer";
  const field = documentRef.createElement("input"); field.type = "hidden"; field.name = "ticket"; field.value = launch.ticket;
  form.append(field); documentRef.body.append(form);
  try { form.submit(); } finally { field.value = ""; form.remove(); }
}
