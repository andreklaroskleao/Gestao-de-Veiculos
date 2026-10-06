import { watchAuth, signInWithGoogle, signOutUser } from "./auth.js";
import {
  addRecord, archiveVehicle, changeInviteRole, changeShareRole, claimPendingInvites,
  createPaymentMethod, deletePaymentMethod, listPaymentMethods, updatePaymentMethod,
  createServiceProvider, deleteServiceProvider, listServiceProviders, updateServiceProvider,
  closeTrip, reopenTrip,
  deleteVehiclePermanently,
  createVehicle, listAccessibleVehicles, listVehicleInvites, listVehicleShares,
  loadVehicleData, removeInvite, removeRecord, removeShare, saveRecord,
  shareVehicleByEmail, updateVehicle, upsertUserProfile,
} from "./firestore.js";
import { openEntryForm } from "./forms.js";
import { initPwa } from "./pwa.js";
import { fuelSummary, filterPeriod } from "./calculations.js";
import { buildBackup, financialEvents, getFinanceSummary, reportEvents } from "./reports.js";
import { generatePdf } from "./pdf.js";
import {
  csvDownload, decimal, errorMessage, escapeHtml, formatDate, jsonDownload,
  money, toast,
} from "./utils.js";
import {
  renderDashboard, renderFinance, renderNoVehicle, renderRecords, renderReports, renderTripDetails,
  renderSharing, renderVehicles, renderPaymentMethods, renderServiceProviders, viewTitles,
} from "./views.js";

const state = {
  user: null,
  vehicles: [],
  vehicle: null,
  data: { refuels: [], maintenances: [], tires: [], expenses: [], trips: [] },
  shares: [],
  invites: [],
  paymentMethods: [],
  serviceProviders: [],
  view: "dashboard",
  financePeriod: "month",
  financeCustomStart: "",
  financeCustomEnd: "",
};

const authGate = document.querySelector("#auth-gate");
const application = document.querySelector("#application");
const authMessage = document.querySelector("#auth-message");
const content = document.querySelector("#app-content");
const dialog = document.querySelector("#entry-dialog");
const vehiclePicker = document.querySelector("#vehicle-picker");
const recordArrays = ["refuels", "maintenances", "tires", "expenses", "trips"];
initPwa();

function canEdit() { return Boolean(state.vehicle && ["owner", "editor"].includes(state.vehicle.role)); }
function canManage() { return Boolean(state.vehicle?.role === "owner"); }

function updateHeader() {
  document.querySelector("#page-title").textContent = viewTitles[state.view] || "Dashboard";
  document.querySelector("#page-kicker").textContent = state.vehicle?.name ? state.vehicle.name.toUpperCase() : "SEU RESUMO";
  document.querySelectorAll(".nav-item, .mobile-nav button").forEach((button) => button.classList.toggle("active", button.dataset.view === state.view));
  const newButton = document.querySelector("#new-record");
  newButton.hidden = Boolean(state.vehicle && !canEdit() && !["vehicles", "payments", "providers"].includes(state.view));
  newButton.innerHTML = state.view === "payments" ? "<span>+</span> Novo cart\u00e3o" : state.view === "providers" ? "<span>+</span> Novo prestador" : state.view === "vehicles" || !state.vehicle ? "<span>+</span> Novo ve\u00edculo" : "<span>+</span> Novo registro";
}

function updateVehiclePicker() {
  vehiclePicker.innerHTML = state.vehicles.length
    ? state.vehicles.map((vehicle) => `<option value="${escapeHtml(vehicle.id)}" ${vehicle.id === state.vehicle?.id ? "selected" : ""}>${escapeHtml(vehicle.name)}</option>`).join("")
    : `<option value="">Nenhum veículo</option>`;
}

function render() {
  updateHeader();
  updateVehiclePicker();
  if (state.view === "payments") {
    content.innerHTML = renderPaymentMethods(state.paymentMethods);
    return;
  }
  if (state.view === "providers") {
    content.innerHTML = renderServiceProviders(state.serviceProviders);
    return;
  }
  if (state.view === "vehicles") {
    content.innerHTML = renderVehicles(state.vehicles, state.vehicle?.id, state.user?.uid, true);
    return;
  }
  if (!state.vehicle && state.view !== "dashboard") {
    content.innerHTML = renderNoVehicle();
    return;
  }
  if (state.view === "dashboard") {
    const events = financialEvents(state.data);
    content.innerHTML = renderDashboard({ vehicle: state.vehicle, data: state.data, events, summary: getFinanceSummary(state.data, events), canEdit: canEdit() });
  } else if (recordArrays.includes(state.view)) {
    content.innerHTML = renderRecords(state.view, state.data[state.view], state.data, canEdit(), { ...state.user, role: state.vehicle?.role });
  } else if (state.view === "finance") {
    content.innerHTML = renderFinance({ data: state.data, period: state.financePeriod, customStart: state.financeCustomStart, customEnd: state.financeCustomEnd });
  } else if (state.view === "reports") {
    content.innerHTML = renderReports({ vehicle: state.vehicle, data: state.data, canEdit: canEdit() });
  } else if (state.view === "sharing") {
    content.innerHTML = renderSharing({ vehicle: state.vehicle, shares: state.shares, invites: state.invites, user: state.user, canManage: canManage() });
  } else {
    state.view = "dashboard";
    render();
    return;
  }
  updateReportPeriodControls();
}

function updateReportPeriodControls() {
  const period = content.querySelector("#report-period");
  if (!period) return;
  const custom = period.value === "custom";
  content.querySelector("#report-start").hidden = !custom;
  content.querySelector("#report-end").hidden = !custom;
}

async function reloadVehicles(preferredId = state.vehicle?.id) {
  if (!state.user) return;
  state.vehicles = await listAccessibleVehicles(state.user.uid);
  state.vehicle = state.vehicles.find((item) => item.id === preferredId) || state.vehicles[0] || null;
  localStorage.setItem("rota-active-vehicle", state.vehicle?.id || "");
  updateVehiclePicker();
  if (state.vehicle) await reloadVehicleData(state.vehicle.id);
  else state.data = { refuels: [], maintenances: [], tires: [], expenses: [], trips: [] };
}

async function reloadVehicleData(vehicleId = state.vehicle?.id) {
  if (!state.user || !vehicleId) return;
  const data = await loadVehicleData(vehicleId);
  if (state.vehicle?.id !== vehicleId) return;
  state.data = data;
  if (canManage()) {
    [state.shares, state.invites] = await Promise.all([listVehicleShares(vehicleId), listVehicleInvites(vehicleId)]);
  } else {
    state.shares = [];
    state.invites = [];
  }
}

async function handleAuth(user) {
  state.user = user || null;
  if (!user) {
    application.hidden = true;
    authGate.hidden = false;
    state.vehicles = [];
    state.vehicle = null;
    state.shares = [];
    state.invites = [];
    state.paymentMethods = [];
    state.serviceProviders = [];
    state.data = { refuels: [], maintenances: [], tires: [], expenses: [], trips: [] };
    localStorage.removeItem("rota-active-vehicle");
    authMessage.textContent = "Entre com sua conta Google para continuar.";
    return;
  }
  authGate.hidden = true;
  application.hidden = false;
  document.querySelector("#user-name").textContent = user.displayName || "Usuário";
  document.querySelector("#user-email").textContent = user.email || "";
  const avatar = document.querySelector("#user-avatar");
  avatar.src = user.photoURL || `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="32" fill="#dbe9dd"/><text x="50%" y="56%" text-anchor="middle" font-family="sans-serif" font-size="25" fill="#356147">${(user.displayName || "U")[0]}</text></svg>`)}`;
  const startupWarnings = [];
  state.paymentMethods = [];
  try {
    state.paymentMethods = await listPaymentMethods(user.uid);
  } catch (error) {
    console.error("Payment methods could not be loaded:", error);
    startupWarnings.push({ step: "Formas de pagamento", error });
  }
  try {
    state.serviceProviders = await listServiceProviders(user.uid);
  } catch (error) {
    console.error("Service providers could not be loaded:", error);
    startupWarnings.push({ step: "Prestadores", error });
  }
  try { await upsertUserProfile(user); }
  catch (error) {
    console.error("User profile sync failed:", error);
    startupWarnings.push({ step: "Perfil", error });
  }
  let claimedInvites = 0;
  try { claimedInvites = await claimPendingInvites(user); }
  catch (error) {
    console.error("Pending invite lookup failed:", error);
    startupWarnings.push({ step: "Convites", error });
  }
  try {
    await reloadVehicles(localStorage.getItem("rota-active-vehicle"));
    render();
    if (startupWarnings.length) {
      const details = startupWarnings.map(({ step, error }) => `${step}: ${errorMessage(error)}`).join(" | ");
      toast("Dados auxiliares nao sincronizados", details, "error");
    }
    if (claimedInvites) toast("Acesso compartilhado ativado", `${claimedInvites} veículo(s) foi(ram) adicionado(s) à sua garagem.`);
  } catch (error) {
    console.error("Vehicle and record loading failed:", error);
    toast("Não foi possível carregar seus dados", errorMessage(error), "error");
    content.innerHTML = `<div class="empty-state"><div class="empty-illustration">!</div><h3>Falha ao conectar ao Firebase</h3><p>${escapeHtml(errorMessage(error))}</p><button class="button button-primary" data-retry>↻ Tentar novamente</button></div>`;
  }
}

function setView(view) {
  if (!viewTitles[view]) return;
  state.view = view;
  document.querySelector("#sidebar").classList.remove("open");
  if (view === "sharing" && canManage() && state.vehicle) {
    Promise.all([listVehicleShares(state.vehicle.id), listVehicleInvites(state.vehicle.id)]).then(([shares, invites]) => { state.shares = shares; state.invites = invites; render(); }).catch((error) => toast("Compartilhamentos indisponíveis", errorMessage(error), "error"));
  }
  render();
}

function openForm(kind, record = null, initialValues = null) {
  if (!["vehicles", "paymentMethods", "serviceProviders"].includes(kind) && !state.vehicle) {
    toast("Adicione um veículo primeiro", "Depois você poderá registrar despesas e viagens.", "error");
    state.view = "vehicles";
    render();
    return;
  }
  if (!["vehicles", "paymentMethods", "serviceProviders"].includes(kind) && !canEdit()) {
    toast("Acesso somente para leitura", "Peça ao proprietário uma permissão de editor para registrar dados.", "error");
    return;
  }
  openEntryForm(kind, {
    dialog,
    vehicle: state.vehicle,
    trips: state.data.trips,
    paymentMethods: state.paymentMethods,
    record,
    initialValues,
    onSubmit: async (submitted) => {
      const { _collection, _tripId, ...payload } = submitted;
      const returnToTripId = _collection === "expenses" ? (record?.tripId || _tripId) : "";
      if (_collection === "paymentMethods") {
        if (record) await updatePaymentMethod(state.user.uid, record.id, payload);
        else await createPaymentMethod(state.user.uid, payload);
        state.paymentMethods = await listPaymentMethods(state.user.uid);
        state.view = "payments";
        toast(record ? "Cart\u00e3o atualizado" : "Cart\u00e3o cadastrado", "Somente os quatro \u00faltimos d\u00edgitos ficam salvos.");
      } else if (_collection === "serviceProviders") {
        if (record) await updateServiceProvider(state.user.uid, record.id, payload);
        else await createServiceProvider(state.user.uid, payload);
        state.serviceProviders = await listServiceProviders(state.user.uid);
        state.view = "providers";
        toast(record ? "Prestador atualizado" : "Prestador cadastrado", "Endere\u00e7o completo salvo para navega\u00e7\u00e3o.");
      } else if (_collection === "vehicles") {
        if (record) {
          await updateVehicle(record.id, payload);
          await reloadVehicles(record.id);
          toast("Veículo atualizado", "Os dados da sua garagem foram salvos.");
        } else {
          const vehicleId = await createVehicle(state.user, payload);
          await reloadVehicles(vehicleId);
          state.view = "dashboard";
          toast("Veículo cadastrado", "Agora você pode registrar o primeiro abastecimento.");
        }
      } else if (record) {
        await saveRecord(record.path, payload);
        await reloadVehicleData();
        toast("Registro atualizado", "As informações foram salvas.");
      } else {
        await addRecord(state.vehicle.id, _collection, payload, state.user.uid, _tripId);
        await reloadVehicleData();
        if (_collection === "refuels") {
          const interval = fuelSummary(state.data.refuels).intervals.find((item) => item.to === payload.date && item.km > 0);
          toast("Abastecimento registrado com sucesso", interval ? `Consumo calculado: ${decimal(interval.kmPerLiter)} km/L · ${money(interval.costPerKm)}/km` : "Consumo ainda não disponível. Aguardando dados suficientes.");
        } else {
          toast("Registro salvo com sucesso", _tripId ? "O gasto foi associado à viagem escolhida." : "Os cálculos foram atualizados.");
        }
      }
      render();
      return returnToTripId ? () => showTripDetails(returnToTripId) : undefined;
    },
  });
}

function findRecord(path) {
  for (const collectionName of recordArrays) {
    const match = state.data[collectionName].find((item) => item.path === path);
    if (match) return { kind: collectionName, record: match };
  }
  return null;
}

function tripReportLabel(item) {
  if (!item.trip) return "";
  const route = `${item.trip.origin || "Origem"} → ${item.trip.destination || "Destino"}`;
  const dates = item.trip.endDate && item.trip.endDate !== item.trip.startDate
    ? `${formatDate(item.trip.startDate)} – ${formatDate(item.trip.endDate)}`
    : formatDate(item.trip.startDate);
  return `${route} · ${dates}`;
}

function showTripDetails(tripId) {
  const trip = state.data.trips.find((item) => item.id === tripId);
  if (!trip) return;
  const owner = state.vehicle?.role === "owner";
  const expenses = state.data.expenses.filter((item) => item.tripId === trip.id);
  const canEditTrip = canEdit() && (owner || trip.createdBy === state.user?.uid);
  dialog.innerHTML = renderTripDetails({
    trip,
    expenses,
    canEditTrip,
    canEdit: canEdit(),
    canEditAnyExpense: owner,
    userId: state.user?.uid || "",
  });
  dialog.showModal();
}

function periodLabel(period) {
  return ({ all: "Todo o período", week: "Esta semana", "last-week": "Semana passada", month: "Este mês", "last-month": "Mês passado", "30-days": "Últimos 30 dias", "12-months": "Últimos 12 meses", year: "Este ano", "last-year": "Ano passado", custom: "Período personalizado" })[period] || period;
}

function selectedReport() {
  const type = content.querySelector("#report-type")?.value || "complete";
  const period = content.querySelector("#report-period")?.value || "all";
  const customStart = content.querySelector("#report-start")?.value || "";
  const customEnd = content.querySelector("#report-end")?.value || "";
  const events = reportEvents(state.data, type, period, customStart, customEnd);
  return { type, period, customStart, customEnd, events };
}

function updateReportPreview() {
  const preview = content.querySelector("#report-preview");
  if (!preview) return;
  const { type, period, customStart, customEnd, events } = selectedReport();
  const title = ({ complete: "Relatório completo", fuel: "Abastecimentos e consumo", maintenance: "Manutenções", tires: "Pneus", expenses: "Despesas", trips: "Viagens" })[type] || "Relatório";
  const label = period === "custom" ? `${formatDate(customStart)} a ${formatDate(customEnd)}` : periodLabel(period);
  const total = events.reduce((sum, item) => sum + item.amount, 0);
  const rows = events.slice(0, 80).map((item) => `<tr><td>${formatDate(item.date)}</td><td>${escapeHtml(item.category)}</td><td>${escapeHtml(item.detail)}</td><td>${escapeHtml(tripReportLabel(item) || "—")}</td><td>${escapeHtml(item.paymentMethod || "\u2014")}</td><td>${item.kind === "trips" ? "\u2014" : `${Number(item.installments || 1)}x`}</td><td>${item.odometer ? `${Number(item.odometer).toLocaleString("pt-BR")} km` : "—"}</td><td>${money(item.amount)}</td></tr>`).join("");
  preview.innerHTML = `<p class="section-kicker">PRÉVIA DO RELATÓRIO</p><h2>${escapeHtml(state.vehicle?.name || "Veículo")}</h2><p class="report-meta">${escapeHtml(title)} · ${escapeHtml(label)} · ${events.length} lançamento(s)</p><div class="report-stats"><div class="report-stat"><span>Gasto no recorte</span><strong>${money(total)}</strong></div><div class="report-stat"><span>Registros</span><strong>${events.length}</strong></div><div class="report-stat"><span>Consumo médio</span><strong>${fuelSummary(state.data.refuels).averageKmPerLiter ? `${decimal(fuelSummary(state.data.refuels).averageKmPerLiter)} km/L` : "Dados insuficientes"}</strong></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Data</th><th>Categoria</th><th>Descrição</th><th>Viagem</th><th>Pagamento</th><th>Parcelas</th><th>Km</th><th>Valor</th></tr></thead><tbody>${rows || `<tr><td colspan="8"><div class="table-empty">Sem lançamentos para este filtro.</div></td></tr>`}</tbody></table>${events.length > 80 ? `<p class="comparison-note">A prévia mostra 80 itens; a exportação inclui todos os registros carregados.</p>` : ""}</div>`;
}

async function runReport(action) {
  const { type, period, customStart, customEnd, events } = selectedReport();
  const reportTitle = ({ complete: "Relatório completo", fuel: "Abastecimentos e consumo", maintenance: "Manutenções", tires: "Pneus", expenses: "Despesas", trips: "Viagens" })[type] || "Relatório";
  const label = period === "custom" ? `${formatDate(customStart)} a ${formatDate(customEnd)}` : periodLabel(period);
  if (action === "pdf") generatePdf({ vehicle: state.vehicle, events, title: reportTitle, periodLabel: label, summary: getFinanceSummary(state.data) });
  if (action === "print") { updateReportPreview(); window.print(); }
  if (action === "csv") csvDownload(`rota-${type}-${new Date().toISOString().slice(0, 10)}.csv`, [["Data", "Categoria", "Descri\u00e7\u00e3o", "Viagem (origem, destino e data)", "Forma de pagamento", "Parcelas", "Quilometragem", "Valor da despesa"], ...events.map((item) => [item.date, item.category, item.detail, tripReportLabel(item), item.paymentMethod || "", item.kind === "trips" ? "" : (item.installments || 1), item.odometer || "", item.amount])]);
  if (action === "json") jsonDownload(`rota-backup-${(state.vehicle.name || "veiculo").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`, buildBackup(state.vehicle, state.data, state.paymentMethods, state.serviceProviders));
}

content.addEventListener("click", async (event) => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) { setView(viewButton.dataset.view); return; }
  const createButton = event.target.closest("[data-new-kind]");
  if (createButton) { openForm(createButton.dataset.newKind); return; }
  const selectButton = event.target.closest("[data-select-vehicle]");
  if (selectButton) {
    state.vehicle = state.vehicles.find((item) => item.id === selectButton.dataset.selectVehicle) || null;
    localStorage.setItem("rota-active-vehicle", state.vehicle?.id || "");
    await reloadVehicleData();
    state.view = "dashboard";
    render();
    return;
  }
  const editVehicle = event.target.closest("[data-edit-vehicle]");
  if (editVehicle) { const vehicle = state.vehicles.find((item) => item.id === editVehicle.dataset.editVehicle); if (vehicle) openForm("vehicles", vehicle); return; }
  const archive = event.target.closest("[data-archive-vehicle]");
  if (archive) {
    const vehicle = state.vehicles.find((item) => item.id === archive.dataset.archiveVehicle);
    if (!vehicle || !confirm(`Arquivar ${vehicle.name}? Os registros serão preservados, mas o veículo sairá da sua lista ativa.`)) return;
    try { await archiveVehicle(vehicle.id); await reloadVehicles(); render(); toast("Veículo arquivado", "Os registros permanecem preservados."); }
    catch (error) { toast("Não foi possível arquivar", errorMessage(error), "error"); }
    return;
  }
  const deleteVehicle = event.target.closest("[data-delete-vehicle]");
  if (deleteVehicle) {
    const vehicle = state.vehicles.find((item) => item.id === deleteVehicle.dataset.deleteVehicle);
    if (!vehicle || !confirm(`Excluir permanentemente ${vehicle.name} e todos os registros? Esta ação não pode ser desfeita.`)) return;
    try {
      await deleteVehiclePermanently(vehicle.id);
      await reloadVehicles();
      render();
      toast("Veículo excluído", "Os registros associados também foram removidos.");
    } catch (error) { toast("Não foi possível excluir o veículo", errorMessage(error), "error"); }
    return;
  }
  const editPaymentMethod = event.target.closest("[data-edit-payment-method]");
  if (editPaymentMethod) {
    const method = state.paymentMethods.find((item) => item.id === editPaymentMethod.dataset.editPaymentMethod);
    if (method) openForm("paymentMethods", method);
    return;
  }
  const removePaymentMethodButton = event.target.closest("[data-delete-payment-method]");
  if (removePaymentMethodButton) {
    const method = state.paymentMethods.find((item) => item.id === removePaymentMethodButton.dataset.deletePaymentMethod);
    if (!method || !confirm(`Remover o cart\u00e3o ${method.name}? Os registros anteriores manterao a forma de pagamento.`)) return;
    try {
      await deletePaymentMethod(state.user.uid, method.id);
      state.paymentMethods = state.paymentMethods.filter((item) => item.id !== method.id);
      render();
      toast("Cart\u00e3o removido", "Os registros anteriores foram preservados.");
    } catch (error) { toast("Nao foi possivel remover o cartao", errorMessage(error), "error"); }
    return;
  }
  const editProviderButton = event.target.closest("[data-edit-provider]");
  if (editProviderButton) {
    const provider = state.serviceProviders.find((item) => item.id === editProviderButton.dataset.editProvider);
    if (provider) openForm("serviceProviders", provider);
    return;
  }
  const deleteProviderButton = event.target.closest("[data-delete-provider]");
  if (deleteProviderButton) {
    const provider = state.serviceProviders.find((item) => item.id === deleteProviderButton.dataset.deleteProvider);
    if (!provider || !confirm(`Remover o prestador ${provider.name}?`)) return;
    try {
      await deleteServiceProvider(state.user.uid, provider.id);
      state.serviceProviders = state.serviceProviders.filter((item) => item.id !== provider.id);
      render();
      toast("Prestador removido", "O contato foi retirado da sua lista.");
    } catch (error) { toast("N\u00e3o foi poss\u00edvel remover o prestador", errorMessage(error), "error"); }
    return;
  }
  const edit = event.target.closest("[data-edit-path]");
  if (edit) {
    const found = findRecord(edit.dataset.editPath);
    if (found) openForm(found.kind, found.record);
    return;
  }
  const remove = event.target.closest("[data-delete-path]");
  if (remove) {
    if (!confirm("Excluir este registro permanentemente?")) return;
    try { await removeRecord(remove.dataset.deletePath); await reloadVehicleData(); render(); toast("Registro excluído", "Os indicadores do veículo foram atualizados."); }
    catch (error) { toast("Não foi possível excluir", errorMessage(error), "error"); }
    return;
  }
  const openTrip = event.target.closest("[data-open-trip]");
  if (openTrip) { showTripDetails(openTrip.dataset.openTrip); return; }
  const report = event.target.closest("[data-report]");
  if (report) {
    try { await runReport(report.dataset.report); } catch (error) { toast("Não foi possível gerar o relatório", errorMessage(error), "error"); }
    return;
  }
  if (event.target.closest("[data-retry]")) {
    try { await reloadVehicles(); render(); } catch (error) { toast("Conexão indisponível", errorMessage(error), "error"); }
  }
});

content.addEventListener("change", async (event) => {
  if (event.target.id === "finance-period") { state.financePeriod = event.target.value; render(); }
  if (event.target.id === "finance-start") { state.financeCustomStart = event.target.value; render(); }
  if (event.target.id === "finance-end") { state.financeCustomEnd = event.target.value; render(); }
  if (event.target.id === "report-period") { updateReportPeriodControls(); updateReportPreview(); }
  if (event.target.id === "report-type" || event.target.id === "report-start" || event.target.id === "report-end") updateReportPreview();
  if (event.target.matches("[data-share-role]") && canManage()) {
    try { await changeShareRole(state.vehicle.id, event.target.dataset.shareRole, event.target.value); toast("Permissão atualizada"); }
    catch (error) { toast("Não foi possível alterar a permissão", errorMessage(error), "error"); }
  }
  if (event.target.matches("[data-invite-role]") && canManage()) {
    try {
      await changeInviteRole(state.vehicle.id, event.target.dataset.inviteRole, event.target.value);
      state.invites = await listVehicleInvites(state.vehicle.id);
      render();
      toast("Convite atualizado");
    } catch (error) { toast("Não foi possível alterar o convite", errorMessage(error), "error"); }
  }
});

dialog.addEventListener("click", async (event) => {
  if (event.target.closest("[data-trip-detail-close]")) { dialog.close(); return; }
  const closeTripButton = event.target.closest("[data-trip-close-open]");
  if (closeTripButton) {
    const form = dialog.querySelector("#trip-close-form");
    if (form) { form.hidden = false; form.querySelector('[name="endOdometer"]')?.focus(); }
    return;
  }
  if (event.target.closest("[data-trip-close-cancel]")) {
    const form = dialog.querySelector("#trip-close-form");
    if (form) form.hidden = true;
    return;
  }
  const reopenButton = event.target.closest("[data-trip-reopen]");
  if (reopenButton) {
    const tripId = reopenButton.dataset.tripReopen;
    if (!confirm("Reabrir esta viagem? A data final e a quilometragem final serao removidas.")) return;
    try {
      await reopenTrip(state.vehicle.id, tripId);
      await reloadVehicleData();
      render();
      dialog.close();
      showTripDetails(tripId);
      toast("Viagem reaberta", "Ela voltou para Em andamento.");
    } catch (error) { toast("Nao foi possivel reabrir a viagem", errorMessage(error), "error"); }
    return;
  }
  const addExpense = event.target.closest("[data-trip-detail-add-expense]");
  if (addExpense) {
    const tripId = addExpense.dataset.tripDetailAddExpense;
    dialog.close();
    openForm("expenses", null, { tripId });
    return;
  }
  const editTrip = event.target.closest("[data-trip-detail-edit]");
  if (editTrip) {
    const trip = state.data.trips.find((item) => item.id === editTrip.dataset.tripDetailEdit);
    dialog.close();
    if (trip) openForm("trips", trip);
    return;
  }
  const editExpense = event.target.closest("[data-trip-detail-expense-edit]");
  if (editExpense) {
    const found = findRecord(editExpense.dataset.tripDetailExpenseEdit);
    dialog.close();
    if (found) openForm(found.kind, found.record);
    return;
  }
  const deleteExpense = event.target.closest("[data-trip-detail-expense-delete]");
  if (deleteExpense) {
    if (!confirm("Excluir esta despesa da viagem?")) return;
    const tripId = deleteExpense.dataset.tripDetailId;
    try {
      await removeRecord(deleteExpense.dataset.tripDetailExpenseDelete);
      await reloadVehicleData();
      render();
      dialog.close();
      showTripDetails(tripId);
    } catch (error) { toast("Não foi possível excluir a despesa", errorMessage(error), "error"); }
  }
});

dialog.addEventListener("submit", async (event) => {
  if (event.target.id !== "trip-close-form") return;
  event.preventDefault();
  const form = event.target;
  const tripId = form.dataset.tripId;
  const trip = state.data.trips.find((item) => item.id === tripId);
  const errorNode = form.querySelector("[data-trip-close-error]");
  errorNode.textContent = "";
  const endDate = form.elements.namedItem("endDate").value;
  const endOdometer = Number(form.elements.namedItem("endOdometer").value);
  if (!trip || !endDate || endDate < trip.startDate || !Number.isFinite(endOdometer) || endOdometer < Number(trip.startOdometer)) {
    errorNode.textContent = "Informe uma data final igual ou posterior ao início e um KM igual ou maior que o inicial.";
    return;
  }
  try {
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = "Encerrando...";
    await closeTrip(state.vehicle.id, tripId, { endDate, endOdometer });
    await reloadVehicleData();
    render();
    dialog.close();
    showTripDetails(tripId);
    toast("Viagem encerrada", "Data e quilometragem final foram registradas.");
  } catch (error) {
    errorNode.textContent = errorMessage(error);
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = false;
    submit.textContent = "Confirmar encerramento";
  }
});

content.addEventListener("submit", async (event) => {
  if (event.target.id !== "share-form") return;
  event.preventDefault();
  if (!canManage()) return;
  const email = content.querySelector("#share-email").value;
  const role = content.querySelector("#share-role-select").value;
  const error = content.querySelector("#share-error");
  error.textContent = "";
  try {
    const inviteEmail = await shareVehicleByEmail(state.vehicle.id, email, role, state.user);
    [state.shares, state.invites] = await Promise.all([listVehicleShares(state.vehicle.id), listVehicleInvites(state.vehicle.id)]);
    render();
    toast("Convite enviado", `${inviteEmail} terá acesso como ${role === "editor" ? "editor" : "visualizador"} ao entrar com essa conta Google.`);
  } catch (failure) { error.textContent = errorMessage(failure); }
});

content.addEventListener("click", async (event) => {
  const remove = event.target.closest("[data-remove-share]");
  if (!remove || !canManage()) return;
  const userId = remove.dataset.removeShare;
  if (!confirm("Remover o acesso desta pessoa ao veículo?")) return;
  try { await removeShare(state.vehicle.id, userId); [state.shares, state.invites] = await Promise.all([listVehicleShares(state.vehicle.id), listVehicleInvites(state.vehicle.id)]); render(); toast("Acesso removido"); }
  catch (error) { toast("Não foi possível remover o acesso", errorMessage(error), "error"); }
});

content.addEventListener("click", async (event) => {
  const remove = event.target.closest("[data-remove-invite]");
  if (!remove || !canManage()) return;
  if (!confirm("Cancelar este convite pendente?")) return;
  try {
    await removeInvite(state.vehicle.id, remove.dataset.removeInvite);
    state.invites = await listVehicleInvites(state.vehicle.id);
    render();
    toast("Convite cancelado");
  } catch (error) { toast("Não foi possível cancelar o convite", errorMessage(error), "error"); }
});

document.querySelectorAll(".nav-item, .mobile-nav button").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
vehiclePicker.addEventListener("change", async () => {
  state.vehicle = state.vehicles.find((vehicle) => vehicle.id === vehiclePicker.value) || null;
  localStorage.setItem("rota-active-vehicle", state.vehicle?.id || "");
  try { await reloadVehicleData(); state.view = "dashboard"; render(); }
  catch (error) { toast("Não foi possível carregar o veículo", errorMessage(error), "error"); }
});
document.querySelector("#new-record").addEventListener("click", () => {
  if (state.view === "payments") { openForm("paymentMethods"); return; }
  if (state.view === "providers") { openForm("serviceProviders"); return; }
  const defaults = { dashboard: "refuels", vehicles: "vehicles", finance: "expenses", sharing: "vehicles", reports: "expenses" };
  if (!state.vehicle) { openForm("vehicles"); return; }
  openForm(defaults[state.view] || state.view);
});
document.querySelector("#mobile-menu").addEventListener("click", () => document.querySelector("#sidebar").classList.toggle("open"));
document.querySelector("#sign-out").addEventListener("click", async () => {
  try { await signOutUser(); toast("Sessão encerrada"); }
  catch (error) { toast("Não foi possível sair", errorMessage(error), "error"); }
});
document.querySelector("#google-sign-in").addEventListener("click", async () => {
  authMessage.textContent = "Abrindo o login do Google…";
  try { await signInWithGoogle(); }
  catch (error) { authMessage.textContent = errorMessage(error); }
});
watchAuth((user) => { void handleAuth(user); });

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") document.querySelector("#sidebar").classList.remove("open");
});
