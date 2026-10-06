import { numeric } from "./utils.js";

export function sum(items, field = "amount") {
  return items.reduce((total, item) => total + numeric(item[field]), 0);
}

export function distance(start, end) {
  const value = numeric(end) - numeric(start);
  return value >= 0 ? value : null;
}

export function costPerKm(cost, km) {
  return numeric(km) > 0 ? numeric(cost) / numeric(km) : null;
}

export function costPer100Km(costPerKilometer) {
  return costPerKilometer == null ? null : costPerKilometer * 100;
}

export function refuelIntervals(refuels = []) {
  const sorted = [...refuels].sort((a, b) => (a.date || "").localeCompare(b.date || "") || numeric(a.odometer) - numeric(b.odometer));
  const intervals = [];
  let anchorIndex = -1;
  sorted.forEach((entry, index) => {
    if (!entry.fullTank) return;
    if (anchorIndex >= 0) {
      const previous = sorted[anchorIndex];
      const km = distance(previous.odometer, entry.odometer);
      const segment = sorted.slice(anchorIndex + 1, index + 1);
      const liters = sum(segment, "liters");
      const spend = sum(segment, "total");
      const fuels = new Set(segment.map((record) => record.fuel).filter(Boolean));
      if (km > 0 && liters > 0) {
        intervals.push({
          from: previous.date,
          to: entry.date,
          km,
          liters,
          spend,
          kmPerLiter: km / liters,
          costPerKm: costPerKm(spend, km),
          fuel: fuels.size === 1 ? [...fuels][0] : null,
          mixedFuel: fuels.size > 1,
        });
      }
    }
    anchorIndex = index;
  });
  return intervals;
}

export function fuelSummary(refuels = []) {
  const intervals = refuelIntervals(refuels);
  return {
    intervals,
    averageKmPerLiter: intervals.length ? sum(intervals, "km") / sum(intervals, "liters") : null,
    best: intervals.length ? Math.max(...intervals.map((item) => item.kmPerLiter)) : null,
    worst: intervals.length ? Math.min(...intervals.map((item) => item.kmPerLiter)) : null,
  };
}

export function fuelComparison(refuels = []) {
  const byFuel = new Map();
  for (const interval of refuelIntervals(refuels)) {
    if (!interval.fuel) continue;
    const item = byFuel.get(interval.fuel) || { fuel: interval.fuel, km: 0, spend: 0, liters: 0 };
    item.km += interval.km;
    item.spend += interval.spend;
    item.liters += interval.liters;
    byFuel.set(interval.fuel, item);
  }
  return [...byFuel.values()].map((item) => ({
    ...item,
    kmPerLiter: item.km / item.liters,
    pricePerLiter: item.spend / item.liters,
    costPerKm: item.spend / item.km,
  })).sort((a, b) => a.costPerKm - b.costPerKm);
}

export function tripDistance(trip) {
  return distance(trip.startOdometer, trip.endOdometer);
}

export function monthlyTotals(records, dateField = "date", amountField = "amount", count = 6) {
  const now = new Date();
  const months = Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
    return { key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`, label: new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", ""), value: 0 };
  });
  const map = new Map(months.map((month) => [month.key, month]));
  for (const record of records) {
    const key = String(record[dateField] || "").slice(0, 7);
    const month = map.get(key);
    if (month) month.value += numeric(record[amountField]);
  }
  return months;
}

export function categoryTotals(records, categoryField = "category", amountField = "amount") {
  const categories = new Map();
  for (const record of records) {
    const key = record[categoryField] || "Outros";
    categories.set(key, (categories.get(key) || 0) + numeric(record[amountField]));
  }
  return [...categories.entries()].map(([category, value]) => ({ category, value })).sort((a, b) => b.value - a.value);
}

export function filterPeriod(records, period, dateField = "date", customStart = "", customEnd = "") {
  const today = new Date();
  const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  let start = startOfDay(today);
  let end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
  if (period === "week") start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
  else if (period === "last-week") { start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay() - 7); end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59, 999); }
  else if (period === "month") start = new Date(today.getFullYear(), today.getMonth(), 1);
  else if (period === "last-month") { start = new Date(today.getFullYear(), today.getMonth() - 1, 1); end = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999); }
  else if (period === "30-days") start.setDate(start.getDate() - 29);
  else if (period === "12-months") start = new Date(today.getFullYear(), today.getMonth() - 11, 1);
  else if (period === "year") start = new Date(today.getFullYear(), 0, 1);
  else if (period === "last-year") { start = new Date(today.getFullYear() - 1, 0, 1); end = new Date(today.getFullYear() - 1, 11, 31, 23, 59, 59, 999); }
  else if (period === "custom") { if (customStart) start = new Date(`${customStart}T00:00:00`); if (customEnd) end = new Date(`${customEnd}T23:59:59.999`); }
  return records.filter((record) => {
    const value = record[dateField] || record.startDate;
    if (!value) return false;
    const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
    return date >= start && date <= end;
  });
}
