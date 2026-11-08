import { LineItem, LineItemTracking } from "xero-node";

export interface BankTransactionTrackingInput {
  name: string;
  option: string;
}

export interface BankTransactionLineItemInput {
  /** LineItemID of an existing line to edit in place; omit for a new line */
  lineItemId?: string;
  description: string;
  quantity: number;
  unitAmount: number;
  accountCode: string;
  taxType: string;
  /** Omit to keep an existing line's tracking; [] clears it */
  tracking?: BankTransactionTrackingInput[];
}

export interface MergedLineItems {
  lineItems: LineItem[];
  /** Existing lines that carried tracking and are not in the new set */
  droppedTrackedLines: LineItem[];
}

const describeTracking = (tracking: LineItemTracking[] = []): string =>
  tracking.map((t) => `${t.name ?? t.trackingCategoryID}=${t.option ?? t.trackingOptionID}`).join(", ");

export const describeDroppedLine = (line: LineItem): string =>
  `"${line.description ?? "(no description)"}" ${line.lineAmount ?? ""} [${describeTracking(line.tracking)}] (Line Item ID ${line.lineItemID})`;

/**
 * Build the line items to send to Xero for a bank transaction update.
 *
 * Xero replaces the whole set of line items on update, so a line sent without
 * its LineItemID is deleted and recreated, and a line sent without Tracking
 * loses its tracking. This keeps both for lines the caller identifies by ID.
 */
export function mergeBankTransactionLineItems(
  existing: LineItem[] = [],
  provided: BankTransactionLineItemInput[],
): MergedLineItems {
  const existingById = new Map(
    existing
      .filter((line) => line.lineItemID)
      .map((line) => [line.lineItemID!.toLowerCase(), line]),
  );

  const seen = new Set<string>();
  const lineItems = provided.map((input) => {
    const id = input.lineItemId?.toLowerCase();
    let match: LineItem | undefined;

    if (id) {
      if (seen.has(id)) {
        throw new Error(`Line Item ID ${input.lineItemId} is listed more than once.`);
      }
      seen.add(id);
      match = existingById.get(id);
      if (!match) {
        throw new Error(
          `Line Item ID ${input.lineItemId} is not on this bank transaction. ` +
            `Use get-bank-transaction to see its current line item IDs, or omit lineItemId to add a new line.`,
        );
      }
    }

    const tracking: LineItemTracking[] | undefined =
      input.tracking !== undefined
        ? input.tracking.map(({ name, option }) => ({ name, option }))
        : match?.tracking;

    const lineItem: LineItem = {
      description: input.description,
      quantity: input.quantity,
      unitAmount: input.unitAmount,
      accountCode: input.accountCode,
      taxType: input.taxType,
    };
    if (match?.lineItemID) lineItem.lineItemID = match.lineItemID;
    if (tracking !== undefined) lineItem.tracking = tracking;
    return lineItem;
  });

  const droppedTrackedLines = existing.filter(
    (line) =>
      line.tracking?.length &&
      !(line.lineItemID && seen.has(line.lineItemID.toLowerCase())),
  );

  return { lineItems, droppedTrackedLines };
}
