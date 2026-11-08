import { z } from "zod";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";
import { updateXeroBankTransaction } from "../../handlers/update-xero-bank-transaction.handler.js";
import { bankTransactionDeepLink } from "../../consts/deeplinks.js";
import { formatBankTransactionLineItem } from "../../helpers/format-bank-transaction.js";
import { describeDroppedLine } from "../../helpers/merge-bank-transaction-line-items.js";

const trackingSchema = z.object({
  name: z.string().describe("Tracking category name, e.g. Business"),
  option: z.string().describe("Tracking option name within that category"),
});

const lineItemSchema = z.object({
  lineItemId: z
    .string()
    .optional()
    .describe(
      "LineItemID of the existing line to edit (from get-bank-transaction). " +
        "Include it for every existing line you keep, so the line is updated in place and keeps its tracking. " +
        "Omit only for a brand-new line.",
    ),
  description: z.string(),
  quantity: z.number(),
  unitAmount: z.number(),
  accountCode: z.string(),
  taxType: z.string(),
  tracking: z
    .array(trackingSchema)
    .max(2)
    .optional()
    .describe(
      "Tracking for this line (max 2 categories). Omit to keep the existing line's tracking unchanged; " +
        "pass [] to remove its tracking.",
    ),
});

const UpdateBankTransactionTool = CreateXeroTool(
  "update-bank-transaction",
  `Update a bank transaction in Xero.
  Before changing line items, call get-bank-transaction to read the current lines and their LineItemIDs.
  When a bank transaction is updated, a deep link to the bank transaction in Xero is returned.
  This deep link can be used to view the bank transaction in Xero directly.
  This link should be displayed to the user.`,
  {
    bankTransactionId: z.string(),
    type: z.enum(["RECEIVE", "SPEND"]).optional(),
    contactId: z.string().optional(),
    lineItems: z.array(lineItemSchema).optional().describe(
      "Omit to leave all line items unchanged. If provided, this is the complete new set: \
      any existing line not included will be removed. Pass each kept line's lineItemId so it keeps its \
      ID and tracking. Do not modify line items that have not been specified by the user.",
    ),
    reference: z.string().optional(),
    date: z.string().optional()
  },
  async (
    {
      bankTransactionId,
      type,
      contactId,
      lineItems,
      reference,
      date
    }
  ) => {
    const result = await updateXeroBankTransaction(bankTransactionId, type, contactId, lineItems, reference, date);

    if (result.isError) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error updating bank transaction: ${result.error}`,
          },
        ],
      };
    }

    const { bankTransaction, droppedTrackedLines } = result.result;

    const deepLink = bankTransaction.bankAccount?.accountID && bankTransaction.bankTransactionID
      ? bankTransactionDeepLink(bankTransaction.bankAccount.accountID, bankTransaction.bankTransactionID)
      : null;

    return {
      content: [
        {
          type: "text" as const,
          text: [
            "Bank transaction updated successfully:",
            `ID: ${bankTransaction?.bankTransactionID}`,
            `Date: ${bankTransaction?.date}`,
            `Contact: ${bankTransaction?.contact?.name}`,
            `Total: ${bankTransaction?.total}`,
            `Status: ${bankTransaction?.status}`,
            bankTransaction.isReconciled !== undefined
              ? `Reconciled: ${bankTransaction.isReconciled ? "Yes" : "No"}`
              : null,
            deepLink ? `Link to view: ${deepLink}` : null,
            bankTransaction.lineItems?.length
              ? `Line Items (${bankTransaction.lineItems.length}):\n${bankTransaction.lineItems
                  .map(formatBankTransactionLineItem)
                  .join("\n")}`
              : null,
            droppedTrackedLines.length
              ? `WARNING: ${droppedTrackedLines.length} line(s) that had tracking were removed by this update ` +
                `(not included by lineItemId):\n${droppedTrackedLines
                  .map((line) => `  - ${describeDroppedLine(line)}`)
                  .join("\n")}\nTell the user; if unintended, re-add them with their tracking.`
              : null,
          ].filter(Boolean).join("\n"),
        },
      ],
    };
  }
);

export default UpdateBankTransactionTool;
