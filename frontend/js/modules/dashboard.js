/**
 * dashboard.js — Minza Health Dashboard Module
 *
 * Responsibility: Fetch summary stats and render stat cards.
 *
 * PostgREST embedded filter syntax (critical to get right):
 *   To filter on a related table column use:
 *     ?select=*,table!inner(col)&table.col=eq.value
 *   The !inner makes it an inner join (rows without a match are excluded).
 *   Without !inner it's a LEFT join and the filter is silently ignored.
 */
 
import { api } from "../services/api.js";

(async ()=>{

const stats = await api.getStats();

document.querySelector(".total-today").textContent = stats.total_today;
document.querySelector(".waiting").textContent = stats.waiting;
document.querySelector(".consult").textContent = stats.in_consult;
document.querySelector(".completed").textContent = stats.completed;

})();