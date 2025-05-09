import { createInsertSchema, createSelectSchema } from "npm:drizzle-zod";
import { z } from "zod";
import { licenses } from "../schema/licenses.ts";
import { lineItems } from "../schema/lineItems.ts";

export const lineItemSelectSchema = createSelectSchema(lineItems)
export const lineItemInsertSchema = createInsertSchema(lineItems)
    .omit({
        lineItemId: true
    })
    .strict()

export const lineItemUpdateSchema = createInsertSchema(lineItems)

export type LineItemInsertSchema = z.infer<typeof lineItemInsertSchema>
export type LineItemSelectSchema = z.infer<typeof lineItemSelectSchema>
export type LineItemUpdateSchema = z.infer<typeof lineItemUpdateSchema>