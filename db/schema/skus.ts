import { pgTable, text } from "drizzle-orm/pg-core"
import { ulid } from "../ulid.ts";

export const skus = pgTable("skus", {
	skuId: text("id").primaryKey().notNull().$default(ulid),
    code: text("code").notNull(),
	name: text("name").notNull(),
    unitPriceCurrency: text("unit_price_currency").notNull(),
    unitPrice: text("unit_price").notNull(),
    description: text("description").notNull(),
});
