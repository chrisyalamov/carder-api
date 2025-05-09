import { createInsertSchema, createSelectSchema } from "npm:drizzle-zod";
import { purchaseOrders } from "../schema/purchaseOrders.ts";
import { z } from "zod";

export const purchaseOrderSelectSchema = createSelectSchema(purchaseOrders)
export const purchaseOrderInsertSchema = createInsertSchema(purchaseOrders).strict()
    .omit({
        purchaseOrderId: true
    })
export const purchaseOrderUpdateSchema = purchaseOrderInsertSchema.strict()

export type PurchaseOrderInsert = z.infer<typeof purchaseOrderInsertSchema>
export type PurchaseOrderUpdate = z.infer<typeof purchaseOrderUpdateSchema>
export type PurchaseOrderSelect = z.infer<typeof purchaseOrderSelectSchema>