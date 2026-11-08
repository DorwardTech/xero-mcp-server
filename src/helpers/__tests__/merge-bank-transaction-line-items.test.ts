import { describe, expect, it } from "vitest";
import { LineItem } from "xero-node";

import { mergeBankTransactionLineItems } from "../merge-bank-transaction-line-items.js";

const LINE_A = "aaaaaaaa-0000-4000-8000-000000000001";
const LINE_B = "bbbbbbbb-0000-4000-8000-000000000002";

const existing: LineItem[] = [
  {
    lineItemID: LINE_A,
    description: "Timber",
    quantity: 1,
    unitAmount: 220,
    accountCode: "449",
    taxType: "INPUT",
    lineAmount: 220,
    tracking: [
      { trackingCategoryID: "tc-1", trackingOptionID: "to-1", name: "Business", option: "Zone 3" },
    ],
  },
  {
    lineItemID: LINE_B,
    description: "Screws",
    quantity: 1,
    unitAmount: 30,
    accountCode: "449",
    taxType: "INPUT",
    lineAmount: 30,
    tracking: [
      { trackingCategoryID: "tc-1", trackingOptionID: "to-2", name: "Business", option: "NT Amusements" },
    ],
  },
];

const edit = (overrides: Record<string, unknown> = {}) => ({
  description: "Timber",
  quantity: 1,
  unitAmount: 220,
  accountCode: "429",
  taxType: "INPUT",
  ...overrides,
});

describe("mergeBankTransactionLineItems", () => {
  it("keeps LineItemID and existing tracking when a line is edited by ID", () => {
    const { lineItems, droppedTrackedLines } = mergeBankTransactionLineItems(existing, [
      edit({ lineItemId: LINE_A }),
      edit({ lineItemId: LINE_B, description: "Screws", unitAmount: 30 }),
    ]);

    expect(lineItems[0]).toEqual({
      lineItemID: LINE_A,
      description: "Timber",
      quantity: 1,
      unitAmount: 220,
      accountCode: "429",
      taxType: "INPUT",
      tracking: existing[0].tracking,
    });
    expect(lineItems[1].lineItemID).toBe(LINE_B);
    expect(lineItems[1].tracking).toEqual(existing[1].tracking);
    expect(droppedTrackedLines).toEqual([]);
  });

  it("matches line item IDs case-insensitively", () => {
    const { lineItems } = mergeBankTransactionLineItems(existing, [
      edit({ lineItemId: LINE_A.toUpperCase() }),
      edit({ lineItemId: LINE_B }),
    ]);
    expect(lineItems[0].lineItemID).toBe(LINE_A);
    expect(lineItems[0].tracking).toEqual(existing[0].tracking);
  });

  it("replaces tracking when new tracking is given", () => {
    const { lineItems } = mergeBankTransactionLineItems(existing, [
      edit({ lineItemId: LINE_A, tracking: [{ name: "Business", option: "NT Amusements" }] }),
      edit({ lineItemId: LINE_B }),
    ]);
    expect(lineItems[0].tracking).toEqual([{ name: "Business", option: "NT Amusements" }]);
  });

  it("clears tracking when given an empty array", () => {
    const { lineItems } = mergeBankTransactionLineItems(existing, [
      edit({ lineItemId: LINE_A, tracking: [] }),
      edit({ lineItemId: LINE_B }),
    ]);
    expect(lineItems[0].tracking).toEqual([]);
  });

  it("adds a new line without an ID or tracking", () => {
    const { lineItems } = mergeBankTransactionLineItems(existing, [
      edit({ lineItemId: LINE_A }),
      edit({ lineItemId: LINE_B }),
      edit({ description: "Delivery", unitAmount: 15 }),
    ]);
    expect(lineItems[2]).not.toHaveProperty("lineItemID");
    expect(lineItems[2]).not.toHaveProperty("tracking");
  });

  it("reports tracked lines that are dropped", () => {
    const { lineItems, droppedTrackedLines } = mergeBankTransactionLineItems(existing, [
      edit({ lineItemId: LINE_A }),
    ]);
    expect(lineItems).toHaveLength(1);
    expect(droppedTrackedLines.map((l) => l.lineItemID)).toEqual([LINE_B]);
  });

  it("reports every tracked line as dropped when no IDs are given (old behaviour)", () => {
    const { droppedTrackedLines } = mergeBankTransactionLineItems(existing, [edit()]);
    expect(droppedTrackedLines.map((l) => l.lineItemID)).toEqual([LINE_A, LINE_B]);
  });

  it("does not report untracked lines as dropped", () => {
    const untracked: LineItem[] = [{ ...existing[0], tracking: [] }];
    const { droppedTrackedLines } = mergeBankTransactionLineItems(untracked, [edit()]);
    expect(droppedTrackedLines).toEqual([]);
  });

  it("rejects a line item ID that is not on the transaction", () => {
    expect(() =>
      mergeBankTransactionLineItems(existing, [
        edit({ lineItemId: "cccccccc-0000-4000-8000-000000000003" }),
      ]),
    ).toThrow(/is not on this bank transaction/);
  });

  it("rejects a duplicated line item ID", () => {
    expect(() =>
      mergeBankTransactionLineItems(existing, [
        edit({ lineItemId: LINE_A }),
        edit({ lineItemId: LINE_A }),
      ]),
    ).toThrow(/more than once/);
  });
});
