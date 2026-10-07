import { categoryTotals, filterPeriod, fuelSummary, costPerKm } from "./calculations.js";
import { decimal, money, numeric } from "./utils.js";

function expenseDescription(item) {
  const description = item.description || item.notes || "Despesa";
  return numeric(item.liters) > 0 && numeric(item.pricePerLiter) > 0
    ? `${description} \u00b7 ${decimal(item.liters, 2)} L \u00d7 ${money(item.pricePerLiter)}/L`
    : description;
}

export function financialEvents(data) {
  const tripsById = new Map((data.trips || []).map((trip) => [trip.id, trip]));
  return [
    ...(data.refuels || []).map((item) => ({ id: item.id, path: item.path, kind: "refuels", date: item.date, category: "Combustível", detail: `${item.fuel || "Abastecimento"}${item.station ? ` · ${item.station}` : ""}`, amount: numeric(item.total), paymentMethod: item.paymentMethod || "", installments: numeric(item.installments || 1), odometer: item.odometer })),
    ...(data.maintenances || []).map((item) => ({ id: item.id, path: item.path, kind: "maintenances", date: item.date, category: "Manutenção", detail: item.service || item.category || "Serviço", amount: numeric(item.amount), paymentMethod: item.paymentMethod || "", installments: numeric(item.installments || 1), odometer: item.odometer })),
    ...(data.tires || []).map((item) => ({ id: item.id, path: item.path, kind: "tires", date: item.date, category: "Pneus", detail: `${item.action || "Serviço"}${item.brand ? ` · ${item.brand}` : ""}`, amount: numeric(item.amount), paymentMethod: item.paymentMethod || "", installments: numeric(item.installments || 1), odometer: item.odometer })),
    ...(data.expenses || []).map((item) => {
      const trip = item.tripId ? tripsById.get(item.tripId) : null;
      return { id: item.id, path: item.path, kind: "expenses", date: item.date, category: item.category || "Outros", detail: expenseDescription(item), amount: numeric(item.amount), paymentMethod: item.paymentMethod || "", installments: numeric(item.installments || 1), odometer: item.odometer, tripId: item.tripId, trip: trip ? { origin: trip.origin, destination: trip.destination, startDate: trip.startDate, endDate: trip.endDate } : null };
    }),
  ].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

export function tripReportEvents(data) {
  const expensesByTrip = new Map();
  for (const expense of data.expenses || []) {
    if (!expense.tripId) continue;
    const expenses = expensesByTrip.get(expense.tripId) || [];
    expenses.push(expense);
    expensesByTrip.set(expense.tripId, expenses);
  }
  return (data.trips || []).map((trip) => {
    const expenses = expensesByTrip.get(trip.id) || [];
    return {
      id: `trip:${trip.id}`,
      kind: "trips",
      date: trip.startDate,
      category: "Viagem",
      detail: `${trip.origin || "Origem"} → ${trip.destination || "Destino"}`,
      amount: expenses.reduce((total, expense) => total + numeric(expense.amount), 0),
      paymentMethod: "",
      odometer: trip.startOdometer,
      trip: { origin: trip.origin, destination: trip.destination, startDate: trip.startDate, endDate: trip.endDate },
      expenseCount: expenses.length,
    };
  }).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

export function getFinanceSummary(data, events = financialEvents(data)) {
  const refuels = data.refuels || [];
  const maintenance = (data.maintenances || []).reduce((sum, item) => sum + numeric(item.amount), 0);
  const tires = (data.tires || []).reduce((sum, item) => sum + numeric(item.amount), 0);
  const other = (data.expenses || []).reduce((sum, item) => sum + numeric(item.amount), 0);
  const total = events.reduce((sum, item) => sum + item.amount, 0);
  const odometers = [
    ...(data.refuels || []).map((item) => numeric(item.odometer)),
    ...(data.maintenances || []).map((item) => numeric(item.odometer)),
    ...(data.tires || []).map((item) => numeric(item.odometer)),
    ...(data.trips || []).flatMap((item) => [numeric(item.startOdometer), numeric(item.endOdometer)]),
  ].filter((value) => value > 0);
  const kmDriven = odometers.length ? Math.max(...odometers) - Math.min(...odometers) : 0;
  return {
    total,
    fuel: refuels.reduce((sum, item) => sum + numeric(item.total), 0),
    maintenance,
    tires,
    other,
    monthlyAverage: events.length ? total / Math.max(1, new Set(events.map((item) => (item.date || "").slice(0, 7))).size) : 0,
    weeklyAverage: events.length ? total / Math.max(1, Math.ceil((Date.now() - new Date(`${events.at(-1).date}T12:00:00`).getTime()) / 604800000)) : 0,
    annual: events.filter((item) => String(item.date || "").startsWith(String(new Date().getFullYear()))).reduce((sum, item) => sum + item.amount, 0),
    costPerKm: costPerKm(total, kmDriven),
    kmDriven,
    categories: categoryTotals(events, "category", "amount"),
    fuelData: fuelSummary(refuels),
  };
}

export function reportEvents(data, type, period = "all", customStart = "", customEnd = "") {
  const events = financialEvents(data);
  const byType = {
    fuel: events.filter((item) => item.kind === "refuels"),
    maintenance: events.filter((item) => item.kind === "maintenances"),
    tires: events.filter((item) => item.kind === "tires"),
    expenses: events.filter((item) => item.kind === "expenses"),
    trips: tripReportEvents(data),
    complete: events,
  };
  const selected = byType[type] || events;
  return period === "all" ? selected : filterPeriod(selected, period, "date", customStart, customEnd);
}

export function buildBackup(vehicle, data, paymentMethods = [], serviceProviders = []) {
  return {
    format: "rota-backup-v1",
    exportedAt: new Date().toISOString(),
    vehicle: Object.fromEntries(Object.entries(vehicle).filter(([key]) => key !== "path")),
    paymentMethods: paymentMethods.map(({ id, name, institution, lastFour, usage }) => ({ id, name, institution, lastFour, usage })),
    serviceProviders: serviceProviders.map(({ id, name, type, phone, address, number, complement, neighborhood, city, state, postalCode, notes }) => ({ id, name, type, phone, address, number, complement, neighborhood, city, state, postalCode, notes })),
    collections: Object.fromEntries(Object.entries(data).map(([name, records]) => [name, records.map(({ path, ...record }) => record)])),
  };
}
