(() => {
  "use strict";
  const $ = selector => document.querySelector(selector);
  const pricing = window.VezlioPricing;
  const grid = $("#boostingGrid");
  if (!grid || !pricing) return;
  const escape = value => String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  const pageSize = 24;
  let catalogue = { services: [], revision: null }, shown = pageSize;
  const date = value => new Intl.DateTimeFormat("en-LK", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Colombo" }).format(new Date(value)) + " (Sri Lanka)";

  function options(select, values, label) {
    const previous = select.value;
    select.replaceChildren(new Option(label, ""), ...values.map(value => new Option(value, value)));
    if (values.includes(previous)) select.value = previous;
  }
  function updateCategories() {
    const platform = $("#boostingPlatform").value;
    options($("#boostingCategory"), [...new Set(catalogue.services.filter(service => !platform || service.platform === platform).map(service => service.category))].sort(), "All categories");
  }
  function matches() {
    const search = $("#boostingSearch").value.trim().toLowerCase();
    const platform = $("#boostingPlatform").value, category = $("#boostingCategory").value;
    return catalogue.services.filter(service => (!platform || service.platform === platform) && (!category || service.category === category) && `${service.id} ${service.name} ${service.category} ${service.description || ""}`.toLowerCase().includes(search));
  }
  function quantity(card, service) {
    const value = card.querySelector("input").value;
    const number = pricing.integer(value);
    if (number < BigInt(service.min) || number > BigInt(service.max)) throw new Error(`Enter ${service.min}–${service.max}.`);
    return value;
  }
  function updateTotal(card, service) {
    const input = card.querySelector("input"), output = card.querySelector("output"), button = card.querySelector(".boosting-enquire");
    card.querySelector(".boosting-enquiry").hidden = true;
    card.querySelector(".boosting-feedback").textContent = "";
    try {
      const value = quantity(card, service);
      input.setCustomValidity("");
      output.textContent = pricing.formatLkr(pricing.totalFromLkrRate(service.ratePer1000Lkr, value));
      button.disabled = card.dataset.quoting === "true";
    } catch (error) {
      input.setCustomValidity(error.message);
      output.textContent = "Enter a valid quantity";
      button.disabled = true;
    }
  }
  function render() {
    const filtered = matches();
    $("#boostingResults").textContent = `${filtered.length} matching service${filtered.length === 1 ? "" : "s"}`;
    grid.innerHTML = filtered.slice(0, shown).map((service, index) => {
      const properties = Object.entries(service.properties).map(([key, value]) => `<span>${{ dripfeed: "Drip-feed", refill: "Refill", cancel: "Cancellation" }[key]}: ${value ? "Yes" : "No"}</span>`).join("");
      return `<article class="boosting-card" data-service-id="${escape(service.id)}">
        <div class="boosting-card-top"><span class="boosting-platform">${escape(service.platform)}</span><span class="boosting-id">#${escape(service.id)}</span></div>
        <p class="boosting-category">${escape(service.category)}</p><h3>${escape(service.name)}</h3>
        <p class="boosting-rate">${escape(pricing.formatLkr(service.ratePer1000Lkr))}<small>per 1,000</small></p>
        <p class="boosting-range">Quantity: ${escape(service.min)}–${escape(service.max)}</p>
        <details class="boosting-details"><summary>Service details</summary><p>${escape(service.description ?? "No description supplied by the provider.")}</p><div class="boosting-properties">${properties}</div></details>
        <label for="boostingQty${index}">Quantity</label><input id="boostingQty${index}" type="text" inputmode="numeric" pattern="[0-9]+" maxlength="24" value="${escape(service.min)}" autocomplete="off" aria-describedby="boostingTotal${index}" required />
        <div class="boosting-total"><span>Total</span><output id="boostingTotal${index}" aria-live="polite"></output></div>
        <button type="button" class="btn btn-primary boosting-enquire">Prepare enquiry ↗</button>
        <p class="boosting-feedback" role="status" aria-live="polite"></p>
        <div class="boosting-enquiry" hidden><label for="boostingMessage${index}">Your enquiry</label><textarea id="boostingMessage${index}" readonly rows="6"></textarea><button type="button" class="btn btn-outline boosting-copy">Copy enquiry</button></div>
      </article>`;
    }).join("");
    if (!filtered.length) grid.innerHTML = '<p class="boosting-empty">No matching services. Try another search or filter.</p>';
    $("#boostingMore").hidden = shown >= filtered.length;
    for (const card of grid.querySelectorAll(".boosting-card")) {
      const service = catalogue.services.find(item => item.id === card.dataset.serviceId);
      card.querySelector("input").addEventListener("input", () => updateTotal(card, service));
      card.querySelector(".boosting-enquire").addEventListener("click", () => prepareEnquiry(card, service));
      card.querySelector(".boosting-copy").addEventListener("click", async () => {
        const textarea = card.querySelector("textarea");
        try { await navigator.clipboard.writeText(textarea.value); card.querySelector(".boosting-feedback").textContent = "Enquiry copied."; }
        catch { textarea.focus(); textarea.select(); card.querySelector(".boosting-feedback").textContent = "Select and copy the enquiry text."; }
      });
      updateTotal(card, service);
    }
  }

  async function prepareEnquiry(card, service) {
    const button = card.querySelector(".boosting-enquire"), feedback = card.querySelector(".boosting-feedback");
    let requestedQuantity;
    try { requestedQuantity = quantity(card, service); }
    catch (error) { feedback.textContent = error.message; return; }
    button.disabled = true;
    card.dataset.quoting = "true";
    feedback.textContent = "Verifying your quote…";
    try {
      const response = await fetch("/api/boosting/quote", {
        method: "POST", headers: { "content-type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ serviceId: service.id, quantity: requestedQuantity, revision: catalogue.revision })
      });
      const quote = await response.json();
      if (!response.ok) {
        if (response.status === 409) await load();
        throw new Error(quote.message || "The quote could not be verified.");
      }
      if (card.querySelector("input").value !== requestedQuantity) return;
      const expected = pricing.totalFromLkrRate(service.ratePer1000Lkr, requestedQuantity);
      if (quote.totalLkr !== expected || quote.serviceId !== service.id || quote.quantity !== requestedQuantity || quote.revision !== catalogue.revision) throw new Error("The price changed. Refresh the catalogue and try again.");
      card.querySelector("output").textContent = pricing.formatLkr(quote.totalLkr);
      card.querySelector("textarea").value = `Hello VEZLIO! I'd like to enquire about:\nService #${service.id}: ${service.name}\nPlatform: ${service.platform}\nCategory: ${service.category}\nQuantity: ${quote.quantity}\nQuoted total: ${pricing.formatLkr(quote.totalLkr)}\nCatalogue retrieved: ${quote.sourceFetchedAt}\nQuote reference: ${quote.revision}\nPlease confirm availability and terms before payment.`;
      card.querySelector(".boosting-enquiry").hidden = false;
      feedback.textContent = "Quote verified. No order or payment has been created.";
    } catch (error) { feedback.textContent = error.message || "Please try again."; }
    finally {
      delete card.dataset.quoting;
      try { quantity(card, service); button.disabled = false; }
      catch { button.disabled = true; }
    }
  }

  async function load() {
    $("#boostingStatus").textContent = "Loading service prices…";
    $("#boostingControls").hidden = true;
    $("#boostingMore").hidden = true;
    grid.replaceChildren();
    $("#boostingResults").textContent = "";
    try {
      const response = await fetch("/api/boosting/services", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (!Array.isArray(result.services)) throw new Error();
      catalogue = result;
      if (!result.available) {
        $("#boostingStatus").textContent = "Service prices are awaiting a verified catalogue update. You can still prepare a campaign enquiry below.";
        return;
      }
      $("#boostingStatus").textContent = `${result.count} services · Catalogue retrieved ${date(result.fetchedAt)}`;
      options($("#boostingPlatform"), [...new Set(catalogue.services.map(service => service.platform))].sort(), "All platforms");
      updateCategories();
      $("#boostingControls").hidden = false;
      shown = pageSize;
      render();
    } catch {
      $("#boostingStatus").textContent = "Service prices are currently unavailable. Please try again or prepare a campaign enquiry below.";
    }
  }
  $("#boostingSearch").addEventListener("input", () => { shown = pageSize; render(); });
  $("#boostingPlatform").addEventListener("change", () => { shown = pageSize; updateCategories(); render(); });
  $("#boostingCategory").addEventListener("change", () => { shown = pageSize; render(); });
  $("#boostingMore").addEventListener("click", () => { shown += pageSize; render(); });
  $("#boostingRefresh").addEventListener("click", load);
  load();
})();
