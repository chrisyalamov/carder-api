import { foreignKey, index, pgTable, text, numeric } from "drizzle-orm/pg-core";
import { ulid } from "../ulid.ts";
import { skus } from "./skus.ts";

export const bulkPricingOffers = pgTable("bulk_pricing_offers", {  
    offerId: text("id").primaryKey().notNull().$default(ulid),
    skuId: text("sku_id").notNull(),
    minQuantity: numeric("min_quantity").notNull(),
    maxQuantity: numeric("max_quantity").notNull(),
    discountPercentage: numeric("discount_percentage").notNull(),
}, (table) => [
    index("IX_BulkPricingOffers_SkuId").using("btree", table.skuId.asc().nullsLast().op("text_ops")),
    foreignKey({
        columns: [table.skuId],
        foreignColumns: [skus.skuId],
        name: "FK_BulkPricingOffers_Skus_SkuId"
    }),
])
