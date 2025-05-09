import { eq } from "drizzle-orm/expressions"
import { purchaseOrders } from "../../db/schema/purchaseOrders.ts"
import { Env } from "../../main.ts"
import { lineItems } from "../../db/schema/lineItems.ts"
import { LineItemSelectSchema } from "../../db/validators/lineItem.ts"
import { LicenseInsert } from "../../db/validators/license.ts"
import { licenses } from "../../db/schema/licenses.ts"

type Database = Env["Variables"]["database"]

const buildLicensesFromLineItems = (
  lineItems: LineItemSelectSchema[],
  organisationId: string,
  purchaseOrderId: string
): LicenseInsert[] => {
  // For every line item, return:...
  return lineItems
    .map((lineItem) => {
      // ...an array of licenses
      const licensesArray: LicenseInsert[] = new Array(
        parseInt(lineItem.quantity)
      )

      if (!lineItem.skuCode) return null

      // which is filled with X copies of the line item, where X is the
      // quantity that was purchased
      return licensesArray.fill({
        licenseType: lineItem.skuCode,
        organisationId: organisationId,
        purchaseOrderId: purchaseOrderId,
        status: "available",
        skuId: lineItem.skuId,
      })
    })
    .flat()
    // Filter out any null values (i.e. line items without a SKU code)
    .filter((license) => Boolean(license)) as LicenseInsert[]
}

export const fulfillOrder = (db: Database, purchaseOrderId: string) =>
  db.transaction(async (tx) => {
    /**
     * Why not a join here? See footnote 1.
     */
    const purchaseOrderPromise = tx
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.purchaseOrderId, purchaseOrderId))
      // This creates a lock on the purchase order row, preventing it from
      // being modified by other transactions
      .for("share")

    const lineItemsPromise = tx
      .select()
      .from(lineItems)
      .where(eq(lineItems.purchaseOrderId, purchaseOrderId))
      // This creates a lock on the line items rows, preventing them from
      // being modified by other transactions
      .for("share")

    // This is where we pause execution until all queries have completed
    const [purchaseOrder, transactionLineItems] = await Promise.all([
      purchaseOrderPromise,
      lineItemsPromise,
    ])

    if (purchaseOrder.length === 0) {
      throw new Error("Purchase order not found")
    }

    const purchasedLicenses = buildLicensesFromLineItems(
      transactionLineItems,
      purchaseOrder[0].organisationId,
      purchaseOrder[0].purchaseOrderId
    )

    // Fulfill line items (provision licenses)
    await tx.insert(licenses).values(purchasedLicenses)
  })

/**
 * Footnotes
 *
 * 1. Why not a join here?
 *    Even though the line items and purchase orders are associated by a foreign
 *    key, separating them into two queries allows for the two tables to be
 *    queried concurrently.
 *
 *    This way, the purchase order can be fetched while the line items are being
 *    retrieved, improving performance. Additionally, this does not require
 *    the aggregation of the line items where we decouple the two tables.
 */
