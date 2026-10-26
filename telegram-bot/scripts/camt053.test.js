import { expect, test } from "bun:test";

import { toCamt053 } from "./camt053.js";

const tx = (over) => ({
  transactionDate: "2026-10-01",
  description: "Example Cafe",
  billingAmount: 3.5,
  billingCurrency: "EUR",
  sourceAmount: 3.5,
  sourceCurrency: "EUR",
  ...over,
});

const entries = (xml) => xml.match(/<Ntry>.*?<\/Ntry>/g);

test("charges are DBIT to the merchant, refunds CRDT from it", () => {
  const [charge, refund] = entries(toCamt053([tx(), tx({ billingAmount: -3.5 })], "ACC"));
  expect(charge).toContain('<Amt Ccy="EUR">3.50</Amt><CdtDbtInd>DBIT</CdtDbtInd>');
  expect(charge).toContain("<Cdtr><Nm>EXAMPLE CAFE</Nm></Cdtr>");
  expect(refund).toContain("<CdtDbtInd>CRDT</CdtDbtInd>");
  expect(refund).toContain("<Dbtr><Nm>EXAMPLE CAFE</Nm></Dbtr>");
});

test("identical same-day purchases stay distinct, casing does not matter", () => {
  const [a, b, c] = entries(toCamt053([tx(), tx({ description: "EXAMPLE CAFE" }), tx({ transactionDate: "2026-10-02" })], "ACC"));
  expect(a).not.toContain("AcctSvcrRef");
  expect(b).toContain("<AcctSvcrRef>2</AcctSvcrRef>");
  expect(c).not.toContain("AcctSvcrRef");
});

test("escapes XML and notes the original currency", () => {
  const [e] = entries(toCamt053([tx({ description: "A&B <shop>", sourceAmount: 4, sourceCurrency: "USD" })], "ACC"));
  expect(e).toContain("<Nm>A&amp;B &lt;SHOP&gt;</Nm>");
  expect(e).toContain("<Ustrd>Original: 4 USD</Ustrd>");
});
