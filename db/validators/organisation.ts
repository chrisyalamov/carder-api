import { createInsertSchema, createSelectSchema } from "npm:drizzle-zod";
import { organisations } from "../schema/organisations.ts";
import { z } from "zod";

export const organisationSelectSchema = createSelectSchema(organisations)
export const organisationInsertSchema = createInsertSchema(organisations)
    .strict()
    .omit({
        organisationId: true
    })
    .setKey("name", z.string().min(3))
    .setKey("key", z.string().min(3))
export const organisationUpdateSchema = 
    organisationInsertSchema
        .omit({
            key: true,
        })
        .strict()

export type OrganisationInsert = z.infer<typeof organisationInsertSchema>  
export type OrganisationUpdate = z.infer<typeof organisationUpdateSchema>
export type OrganisationSelect = z.infer<typeof organisationSelectSchema>