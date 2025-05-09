import { z } from "zod"
import { Env } from "../main.ts"
import { cartItemSchema } from "../routes/purchasing/validators.ts"
import { bulkPricingOffers } from "../db/schema/bulkPricingOffers.ts"
import { inArray } from "drizzle-orm/expressions"
import { skus } from "../db/schema/skus.ts"
import { lineItems } from "../db/schema/lineItems.ts"
import { ApplicationError } from "./application-error.ts";

type Cart = Array<z.infer<typeof cartItemSchema>>
type SpeculativeLineItem = Omit<
  typeof lineItems.$inferInsert,
  "purchaseOrderId"
> & {
  appliedDiscountRate?: number
}

/**
 * This function takes a cart object and returns speculative line items (i.e
 * without a purchase order ID) with the total price and unit price for each
 * item.
 *
 * The function first retrieves the applicable bulk pricing offers and SKU
 * details from the database. It then computes the line total for each item. It
 * then generates line items for any discounts that apply.
 */
export const computeTotals = async (
  db: Env["Variables"]["database"],
  cart: Cart
) => {
  const skuIds = cart.map((item) => item.skuId)
  const applicableBulkPricingOffers_promise = db
    .select()
    .from(bulkPricingOffers)
    .where(inArray(bulkPricingOffers.skuId, skuIds))
  const applicableSkus_promise = db
    .select()
    .from(skus)
    .where(inArray(skus.skuId, skuIds))

  /**
   * Here, we pause execution until both the pricing offers and SKU details
   * have been retrieved. Doing this instead of `await`ing each query allows
   * them to run in parallel, instead of sequentially.
   */
  const [applicableBulkPricingOffers, skusFromDb] = await Promise.all([
    applicableBulkPricingOffers_promise,
    applicableSkus_promise,
  ])

  const computedLines = cart.map<SpeculativeLineItem>((item) => {
    const thisSku = skusFromDb.find((sku) => sku.skuId == item.skuId)

    if (!thisSku) throw new Error()
    const { unitPrice, unitPriceCurrency } = thisSku

    const lineTotal = parseFloat(unitPrice) * item.quantity

    return {
      quantity: item.quantity.toString(),
      skuId: item.skuId,
      skuName: thisSku.name,
      totalPrice: lineTotal.toString(),
      skuCode: thisSku.code,
      type: "charge",
      unitPrice,
      currency: unitPriceCurrency,
    }
  })

  /**
   * Check that all items are priced in the same currency. 
   * If not, throw an error.
   */

  const allSameCurrency =
    computedLines.length === 0
    || computedLines.every(line => line.currency === computedLines[0].currency)

  if (!allSameCurrency) {
    throw new ApplicationError(
      "Some items in your cart are priced in different currencies.",
      "InconsistentCurrency",
      400,
      "CartError"
    )
  }

  const bulkBuyingDiscounts = computedLines.map((item) => {
    const discountLines = applicableBulkPricingOffers
    // First, filter the offers to only those that apply to this SKU
      .filter(
        (offer) =>
          offer.skuId == item.skuId &&
          parseInt(offer.minQuantity) <= parseInt(item.quantity) &&
          parseInt(item.quantity) < parseInt(offer.maxQuantity)
      )
      .map<SpeculativeLineItem>((offer) => {
        const { discountPercentage } = offer
        const discountAmount =
          parseFloat(item.totalPrice) * parseFloat(discountPercentage)
        return {
          skuId: item.skuId,
          skuName: item.skuName,
          quantity: "1",
          unitPrice: (-1 * discountAmount).toString(),
          totalPrice: (-1 * discountAmount).toString(),
          currency: item.currency,
          appliedBulkPricingOfferId: offer.offerId,
          appliedDiscountRate: parseFloat(discountPercentage),
          type: "discount",
        }
      })

      return discountLines
  })

  return [...computedLines, ...bulkBuyingDiscounts.flat()]
}
