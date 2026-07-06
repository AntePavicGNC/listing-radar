// Finanzierungs-Rechner (SPEC §5): Standard-Annuität, Parameter aus config.ts.
// Zinssatz ist ein Richtwert (bonitätsabhängig) — kein Angebot.
import { FINANCING } from "./config";

export interface FinancingResult {
  loanAmountEur: number; // benötigter Kredit nach Eigenmitteln
  monthlyRateEur: number | null; // null, wenn kein Kredit nötig
  exceedsLimit: boolean; // Kredit über maxLoanEur -> Warnhinweis statt Rate
  termMonths: number;
  annualInterestRate: number;
}

/** Monatsrate für ein Auto-Inserat (SPEC §5). */
export function computeFinancing(priceEur: number): FinancingResult {
  const { ownFundsEur, maxLoanEur, loanTermMonths, annualInterestRate } = FINANCING;
  const loanAmountEur = Math.max(0, priceEur - ownFundsEur);

  if (loanAmountEur === 0) {
    return {
      loanAmountEur: 0,
      monthlyRateEur: null,
      exceedsLimit: false,
      termMonths: loanTermMonths,
      annualInterestRate,
    };
  }
  if (loanAmountEur > maxLoanEur) {
    return {
      loanAmountEur,
      monthlyRateEur: null,
      exceedsLimit: true,
      termMonths: loanTermMonths,
      annualInterestRate,
    };
  }

  // Standard-Annuitätenformel mit Monatszins
  const i = annualInterestRate / 12;
  const n = loanTermMonths;
  const rate = (loanAmountEur * i) / (1 - Math.pow(1 + i, -n));

  return {
    loanAmountEur,
    monthlyRateEur: Math.round(rate),
    exceedsLimit: false,
    termMonths: n,
    annualInterestRate,
  };
}

/** Anzeige-Text, z. B. "ca. 245 €/Monat bei 9.500 € Kredit über 48 Monate". */
export function financingLabel(priceEur: number): string {
  const f = computeFinancing(priceEur);
  if (f.loanAmountEur === 0) return "Ohne Kredit finanzierbar (Eigenmittel decken den Preis)";
  if (f.exceedsLimit)
    return `Übersteigt dein Kredit-Limit (${Math.round(f.loanAmountEur).toLocaleString("de-DE")} € nötig)`;
  return `ca. ${f.monthlyRateEur} €/Monat bei ${f.loanAmountEur.toLocaleString("de-DE")} € Kredit über ${f.termMonths} Monate`;
}
