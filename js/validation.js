const required = (value, label) => String(value ?? "").trim() ? "" : `${label} é obrigatório.`;
const positive = (value, label, allowZero = false) => {
  const amount = Number(value);
  return Number.isFinite(amount) && (allowZero ? amount >= 0 : amount > 0) ? "" : `${label} deve ser ${allowZero ? "zero ou maior" : "maior que zero"}.`;
};

export function validateVehicle(data) {
  const yearError = data.year === "" || data.year == null ? "" : positive(data.year, "Ano", true);
  return required(data.name, "Nome do veículo") || required(data.type, "Tipo") || required(data.fuel, "Combustível") || yearError || positive(data.currentOdometer, "Quilometragem", true);
}

export function validatePaymentMethod(data, editing = false) {
  if (!String(data.name || "").trim()) return "Informe um nome para o cart\u00e3o.";
  if (!String(data.institution || "").trim()) return "Informe a institui\u00e7\u00e3o financeira.";
  if (!["credit", "debit"].includes(data.usage)) return "Selecione cr\u00e9dito ou d\u00e9bito.";
  const digits = String(data.cardNumber || "").replace(/\D/g, "");
  if (!digits && !editing) return "Informe o n\u00famero do cart\u00e3o.";
  if (digits && (digits.length < 13 || digits.length > 19)) return "O n\u00famero do cart\u00e3o deve ter entre 13 e 19 d\u00edgitos.";
  return "";
}

export function validateServiceProvider(data) {
  if (!String(data.name || "").trim()) return "Informe o nome do prestador.";
  if (!String(data.type || "").trim()) return "Selecione o tipo de servi\u00e7o.";
  const phoneDigits = String(data.phone || "").replace(/\D/g, "");
  if (phoneDigits.length < 10 || phoneDigits.length > 13) return "Informe um telefone v\u00e1lido com DDD.";
  if (String(data.postalCode || "").replace(/\D/g, "").length !== 8) return "Informe um CEP v\u00e1lido com 8 d\u00edgitos.";
  if (!String(data.address || "").trim() || !String(data.number || "").trim() || !String(data.neighborhood || "").trim() || !String(data.city || "").trim()) return "Informe logradouro, n\u00famero, bairro e cidade para localizar o endere\u00e7o.";
  if (!/^[a-zA-Z]{2}$/.test(String(data.state || "").trim())) return "Informe a UF com duas letras.";
  return "";
}

export function validateRecord(kind, data) {
  const dateError = required(data.date || data.startDate, "Data");
  if (dateError) return dateError;
  if (["refuels", "maintenances", "tires", "expenses"].includes(kind)) {
    const installments = Number(data.installments);
    if (!Number.isInteger(installments) || installments < 1 || installments > 48) return "Informe de 1 a 48 parcelas.";
  }
  if (kind === "refuels") {
    return positive(data.odometer, "Quilometragem", true) || positive(data.liters, "Litros") || positive(data.pricePerLiter, "Preço por litro") || (Number(data.total) <= 0 ? "O valor total deve ser maior que zero." : "");
  }
  const fuelExpense = kind === "expenses" && String(data.category || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase() === "combustivel";
  if (fuelExpense) {
    return required(data.fuel, "Combust\u00edvel") || positive(data.liters, "Litros") || positive(data.pricePerLiter, "Pre\u00e7o por litro") || positive(data.amount, "Valor");
  }
  if (kind === "maintenances" || kind === "tires" || kind === "expenses") {
    return required(data.service || data.description || data.category || data.action, "Descrição") || positive(data.amount, "Valor", true) || (data.odometer !== "" && data.odometer != null ? positive(data.odometer, "Quilometragem", true) : "");
  }
  if (kind === "trips") {
    const baseError = required(data.origin, "Origem") || required(data.destination, "Destino") || positive(data.startOdometer, "Quilometragem inicial", true);
    if (baseError) return baseError;
    if (data.status === "closed") {
      if (!String(data.endDate || "").trim()) return "Informe a data final para encerrar a viagem.";
      if (data.endDate < data.startDate) return "A data final não pode ser anterior à data de início.";
      if (positive(data.endOdometer, "Quilometragem final", true)) return positive(data.endOdometer, "Quilometragem final", true);
      if (Number(data.endOdometer) < Number(data.startOdometer)) return "A quilometragem final n\u00e3o pode ser menor que a inicial.";
    }
    return "";
  }
  return "";
}

export function validateShare(email, role) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Informe um e-mail válido.";
  if (!["editor", "viewer"].includes(role)) return "Escolha uma permissão válida.";
  return "";
}
