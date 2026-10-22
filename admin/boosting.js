(() => {
  "use strict";
  const $ = selector => document.querySelector(selector);
  const escape = value => String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  let token = "", state = null, shown = 50, importing = false;
  function lock() {
    token = ""; state = null;
    $("#ownerToken").value = "";
    $("#ownerDashboard").hidden = true;
    $("#ownerLogin").hidden = false;
    $("#adminRecords").replaceChildren();
    $("#importReceipt").textContent = "No authenticated catalogue has been retrieved.";
    $("#adminSummary").replaceChildren();
    $("#adminStatus").textContent = "Admin locked.";
  }
  async function api(path, method = "GET") {
    if (location.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)) throw new Error("Owner access requires HTTPS.");
    const response = await fetch(path, {
      method, cache: "no-store", credentials: "omit",
      headers: { authorization: `Bearer ${token}`, ...(method === "POST" ? { "content-type": "application/json" } : {}) },
      ...(method === "POST" ? { body: "{}" } : {})
    });
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 401) lock();
      throw new Error(result.message || "The admin request failed.");
    }
    return result;
  }
  function records() {
    const query = $("#adminSearch").value.trim().toLowerCase();
    const selected = (state?.services || []).filter(service => `${service.id} ${service.name} ${service.platform} ${service.category}`.toLowerCase().includes(query));
    $("#adminCount").textContent = `${selected.length} source records; showing ${Math.min(shown, selected.length)}.`;
    $("#adminRecords").innerHTML = selected.slice(0, shown).map(service => `<tr><td>${escape(service.id)}</td><td><strong>${escape(service.name)}</strong><br />${escape(service.platform)} · ${escape(service.category)}<details><summary>Original provider record</summary><pre>${escape(JSON.stringify(service.providerRecord, null, 2))}</pre></details></td><td>USD ${escape(service.agentUsdRate)}</td><td>${escape(window.VezlioPricing.formatLkr(service.ratePer1000Lkr))}${service.eligible ? " / 1,000" : " (unpublished conversion)"}</td><td>${escape(service.min)}–${escape(service.max)}</td><td>${service.active ? service.eligible ? "Customer catalogue" : "Owner review required" : "Inactive; retained"}${service.reviewReason ? `<br />${escape(service.reviewReason)}` : ""}</td></tr>`).join("");
    $("#adminMore").hidden = shown >= selected.length;
  }
  async function refresh() {
    state = await api("/api/admin/boosting");
    $("#ownerLogin").hidden = true;
    $("#ownerDashboard").hidden = false;
    $("#adminBlocker").textContent = state.blocker?.message || "Provider key configured for an owner-confirmed Agent account. Run an import to verify live access.";
    $("#syncCatalogue").disabled = Boolean(state.blocker) || importing || state.syncing;
    const receipt = state.receipt;
    $("#adminSummary").innerHTML = [["Services received", receipt?.receivedCount], ["Customer catalogue", receipt?.importedCount], ["Retained for review", receipt?.retainedForReviewCount]].map(([label, value]) => `<div><strong>${value ?? "—"}</strong><span>${label}</span></div>`).join("");
    $("#importReceipt").textContent = receipt ? JSON.stringify(receipt, null, 2) : "No authenticated catalogue has been retrieved. Received count and source timestamp are unknown.";
    records();
  }
  $("#ownerForm").addEventListener("submit", async event => {
    event.preventDefault();
    token = $("#ownerToken").value;
    $("#ownerToken").value = "";
    try { await refresh(); $("#adminStatus").textContent = "Owner authorized. The token is held only in memory for this page."; }
    catch (error) { token = ""; $("#adminStatus").textContent = error.message; }
  });
  $("#refreshAdmin").addEventListener("click", async () => {
    try { await refresh(); $("#adminStatus").textContent = "Status refreshed."; }
    catch (error) { $("#adminStatus").textContent = error.message; }
  });
  $("#syncCatalogue").addEventListener("click", async () => {
    importing = true;
    $("#syncCatalogue").disabled = true;
    $("#adminStatus").textContent = "Fetching the authenticated account currency and catalogue…";
    try {
      const { receipt } = await api("/api/admin/boosting/sync", "POST");
      await refresh();
      $("#adminStatus").textContent = `Authenticated import saved: ${receipt.receivedCount} received; ${receipt.importedCount} customer services; ${receipt.retainedForReviewCount} retained for review. Source retrieval: ${receipt.fetchedAt}. No provider orders were created.`;
    } catch (error) { $("#adminStatus").textContent = error.message; }
    finally { importing = false; $("#syncCatalogue").disabled = !token || Boolean(state?.blocker); }
  });
  $("#ownerLogout").addEventListener("click", lock);
  $("#adminSearch").addEventListener("input", () => { shown = 50; records(); });
  $("#adminMore").addEventListener("click", () => { shown += 50; records(); });
  window.addEventListener("pagehide", lock);
})();
