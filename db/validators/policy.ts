import { createInsertSchema, createSelectSchema } from "npm:drizzle-zod";
import { z } from "zod";
import { policies } from "../schema/policies.ts";

export const policySelectSchema = createSelectSchema(policies)
export const policyInsertSchema = createInsertSchema(policies)
    .omit({
        policyId: true
    })
    .setKey(
        "resourceDiscriminator",
        z.enum([
            "event",
            "organisation",
            "delegation",
            "license",
            "licenseAssignment"
        ])
    )
    .setKey(
        "effect",
        z.enum([
            "Allow",
            "Deny"
        ])
    )
    .strict()
export const policyUpdateSchema = policyInsertSchema.strict()
    
export type PolicySelect = z.infer<typeof policySelectSchema>
export type PolicyInsert = z.infer<typeof policyInsertSchema>
export type PolicyUpdate = z.infer<typeof policyUpdateSchema>