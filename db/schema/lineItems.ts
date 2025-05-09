import { foreignKey, index, pgTable, text } from "drizzle-orm/pg-core";
import { ulid } from "../ulid.ts";
import { bulkPricingOffers } from "./bulkPricingOffers.ts";
import { purchaseOrders } from "./purchaseOrders.ts";
import { skus } from "./skus.ts";

export const lineItems = pgTable("line_items", {
    lineItemId: text("id").primaryKey().notNull().$default(ulid),   
    purchaseOrderId: text("purchase_order_id").notNull(),
    skuId: text("sku_id").notNull(),
    /**
     * This is denormalised, since SKUs may be deleted, however, the name
     * needs to be retained for archiving— e.g. if an SKU is deleted, the 
     * invoice should still show the name of the SKU at the time of purchase.
     */
    skuName: text("sku_name").notNull(),
    skuCode: text("sku_code"),
    type: text("type").notNull().default("charge"),
    quantity: text("quantity").notNull(),
    /**
     * See above. 
     */
    unitPrice: text("unit_price").notNull(),
    appliedBulkPricingOfferId: text("applied_bulk_pricing_offer_id"),
    /**
     * See above.
     */
    totalPrice: text("total_price").notNull(),
    currency: text("currency").notNull().default("GBP"),
}, (table) => [
    index("IX_LineItems_PurchaseOrderId").using("btree", table.purchaseOrderId.asc().nullsLast().op("text_ops")),
    index("IX_LineItems_SkuId").using("btree", table.skuId.asc().nullsLast().op("text_ops")),
    foreignKey({
        columns: [table.purchaseOrderId],
        foreignColumns: [purchaseOrders.purchaseOrderId],
        name: "FK_LineItems_PurchaseOrders_PurchaseOrderId"
    }).onDelete("cascade"),
    foreignKey({
        columns: [table.skuId],
        foreignColumns: [skus.skuId],
        name: "FK_LineItems_Skus_SkuId"
    }),
    foreignKey({
        columns: [table.appliedBulkPricingOfferId],
        foreignColumns: [bulkPricingOffers.offerId],
        name: "FK_LineItems_BulkPricingOffers_OfferId"
    })
])