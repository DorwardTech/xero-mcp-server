import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticateMock = vi.fn();
const getBankTransactionMock = vi.fn();
const updateBankTransactionMock = vi.fn();

vi.mock("../clients/xero-client.js", () => ({
  xeroClient: {
    tenantId: "tenant-123",
    authenticate: authenticateMock,
    accountingApi: {
      getBankTransaction: getBankTransactionMock,
      updateBankTransaction: updateBankTransactionMock,
    },
  },
}));

vi.mock("../helpers/get-client-headers.js", () => ({
  getClientHeaders: vi.fn(() => ({ "x-test": "header" })),
}));

const TXN = "d20b6c54-7f5d-4ce6-ab83-55f609719126";
const LINE_A = "aaaaaaaa-0000-4000-8000-000000000001";
const TRACKING = [
  { trackingCategoryID: "tc-1", trackingOptionID: "to-1", name: "Business", option: "Zone 3" },
];

const existingTxn = {
  bankTransactionID: TXN,
  type: "SPEND",
  bankAccount: { accountID: "acc-1" },
  lineAmountTypes: "Inclusive",
  status: "AUTHORISED",
  currencyCode: "AUD",
  contact: { contactID: "c-1" },
  reference: "Arena timber",
  date: "2026-08-14",
  isReconciled: true,
  lineItems: [
    {
      lineItemID: LINE_A,
      description: "Timber",
      quantity: 1,
      unitAmount: 220,
      accountCode: "449",
      taxType: "INPUT",
      tracking: TRACKING,
    },
  ],
};

const sentLineItems = () =>
  updateBankTransactionMock.mock.calls[0][2].bankTransactions[0].lineItems;

describe("updateXeroBankTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBankTransactionMock.mockResolvedValue({ body: { bankTransactions: [existingTxn] } });
    updateBankTransactionMock.mockImplementation(async (_t, _id, body) => ({
      body: { bankTransactions: [{ ...existingTxn, ...body.bankTransactions[0] }] },
    }));
  });

  it("sends the LineItemID and existing tracking when recoding a line by ID", async () => {
    const { updateXeroBankTransaction } = await import("./update-xero-bank-transaction.handler.js");

    const result = await updateXeroBankTransaction(TXN, undefined, undefined, [
      { lineItemId: LINE_A, description: "Timber", quantity: 1, unitAmount: 220, accountCode: "429", taxType: "INPUT" },
    ]);

    expect(result.isError).toBe(false);
    expect(sentLineItems()).toEqual([
      {
        lineItemID: LINE_A,
        description: "Timber",
        quantity: 1,
        unitAmount: 220,
        accountCode: "429",
        taxType: "INPUT",
        tracking: TRACKING,
      },
    ]);
    expect(result.result?.droppedTrackedLines).toEqual([]);
  });

  it("leaves line items untouched when none are given", async () => {
    const { updateXeroBankTransaction } = await import("./update-xero-bank-transaction.handler.js");

    await updateXeroBankTransaction(TXN, undefined, undefined, undefined, "New ref");

    expect(sentLineItems()).toBe(existingTxn.lineItems);
    expect(updateBankTransactionMock.mock.calls[0][2].bankTransactions[0].reference).toBe("New ref");
  });

  it("returns dropped tracked lines when lines are sent without IDs", async () => {
    const { updateXeroBankTransaction } = await import("./update-xero-bank-transaction.handler.js");

    const result = await updateXeroBankTransaction(TXN, undefined, undefined, [
      { description: "Timber", quantity: 1, unitAmount: 220, accountCode: "429", taxType: "INPUT" },
    ]);

    expect(result.isError).toBe(false);
    expect(result.result?.droppedTrackedLines.map((l) => l.lineItemID)).toEqual([LINE_A]);
  });

  it("rejects an unknown line item ID without calling update", async () => {
    const { updateXeroBankTransaction } = await import("./update-xero-bank-transaction.handler.js");

    const result = await updateXeroBankTransaction(TXN, undefined, undefined, [
      { lineItemId: "cccccccc-0000-4000-8000-000000000003", description: "x", quantity: 1, unitAmount: 1, accountCode: "429", taxType: "INPUT" },
    ]);

    expect(result.isError).toBe(true);
    expect(result.error).toMatch(/is not on this bank transaction/);
    expect(updateBankTransactionMock).not.toHaveBeenCalled();
  });
});
