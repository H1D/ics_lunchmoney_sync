/**
 * Build a minimal CAMT.053 bank statement from ICS transactions, shaped for
 * bonnetje's parser (src/lib/bank-import/camt053.ts in H1D/bonnetje).
 *
 * bonnetje dedupes on a hash of date|amount|direction|currency|payee|reference|description,
 * so every field here must come out the same on every fetch:
 * - payee is uppercased because ICS changes casing between fetches
 * - reference is only set for repeats of an identical same-day purchase ("2", "3", ...),
 *   so two equal coffees stay two transactions
 *
 * ICS billingAmount is positive for charges and negative for refunds/payments.
 */
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function toCamt053(transactions, accountNumber) {
  const seen = new Map();
  const entries = transactions.map((t) => {
    const amount = Number(t.billingAmount);
    const debit = amount > 0;
    const payee = (t.description || "").toUpperCase();
    const key = `${t.transactionDate}|${payee}|${amount}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);

    // Merchant is the creditor on a charge, the debtor on a refund
    const party = debit ? "Cdtr" : "Dbtr";
    const fx =
      t.sourceCurrency && t.sourceCurrency !== t.billingCurrency
        ? `<RmtInf><Ustrd>${esc(`Original: ${t.sourceAmount} ${t.sourceCurrency}`)}</Ustrd></RmtInf>`
        : "";

    return (
      `<Ntry><Amt Ccy="${t.billingCurrency || "EUR"}">${Math.abs(amount).toFixed(2)}</Amt>` +
      `<CdtDbtInd>${debit ? "DBIT" : "CRDT"}</CdtDbtInd><Sts>BOOK</Sts>` +
      `<BookgDt><Dt>${t.transactionDate}</Dt></BookgDt>` +
      (n > 1 ? `<AcctSvcrRef>${n}</AcctSvcrRef>` : "") +
      `<NtryDtls><TxDtls><RltdPties><${party}><Nm>${esc(payee)}</Nm></${party}></RltdPties>${fx}</TxDtls></NtryDtls></Ntry>`
    );
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt><Stmt>',
    `<Acct><Id><Othr><Id>${esc(accountNumber)}</Id></Othr></Id><Ccy>EUR</Ccy></Acct>`,
    ...entries,
    "</Stmt></BkToCstmrStmt></Document>",
  ].join("\n");
}
