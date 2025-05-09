import { createInsertSchema, createSelectSchema } from "npm:drizzle-zod";
import { z } from "zod";
import { bulkPricingOffers } from "../schema/bulkPricingOffers.ts";

export const bulkPricingOfferSelectSchema = createSelectSchema(bulkPricingOffers)
export const bulkPricingOfferInsertSchema = createInsertSchema(bulkPricingOffers)
    .omit({
        offerId: true
    })
    .strict()
const bulkPricingOfferUpdateSchema = bulkPricingOfferInsertSchema.strict()
    

export type BulkPricingOfferInsert = z.infer<typeof bulkPricingOfferInsertSchema>
export type BulkPricingOfferSelect = z.infer<typeof bulkPricingOfferSelectSchema>
export type BulkPricingOfferUpdate = z.infer<typeof bulkPricingOfferUpdateSchema>