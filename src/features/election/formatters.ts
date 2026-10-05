export function formatVotes(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

export function formatPercentage(value: number, digits = 2) {
  return `${new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value)}%`;
}

export function formatMargin(value: number) {
  const formatted = new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    signDisplay: "always",
  }).format(value);

  return `${formatted} p.p.`;
}

export function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}
