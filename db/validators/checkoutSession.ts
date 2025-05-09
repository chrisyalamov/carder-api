import { createInsertSchema, createSelectSchema } from "npm:drizzle-zod";
import { checkoutSessions } from "../schema/checkoutSessions.ts";
import { z } from "zod";

export const chekoutSessionSelectSchema = createSelectSchema(checkoutSessions)
export const checkoutSessionInsertSchema = createInsertSchema(checkoutSessions)
    .omit({
        checkoutSessionId: true
    })
    .strict()

export type CheckoutSessionInsert = z.infer<typeof checkoutSessionInsertSchema>
export type CheckoutSessionSelect = z.infer<typeof chekoutSessionSelectSchema>