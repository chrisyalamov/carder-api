import { createInsertSchema, createSelectSchema } from "npm:drizzle-zod";
import { z } from "zod";
import { licenses } from "../schema/licenses.ts";

const licenseStatusEnum = z.enum([
    "available",
    "assigned",
    "consumed",
    "expired",
])

export const licenseSelectSchema = createSelectSchema(licenses)
    .setKey(
        'status',
        licenseStatusEnum
    )
export const licenseInsertSchema = createInsertSchema(licenses)
    .omit({
        licenseId: true
    })
    .setKey(
        'status',
        licenseStatusEnum
    )
    .strict()
export const licenseUpdateSchema = createInsertSchema(licenses)
    .setKey(
        'status',
        licenseStatusEnum
    ).strict()

export type LicenseInsert = z.infer<typeof licenseInsertSchema>
export type LicenseUpdate = z.infer<typeof licenseUpdateSchema>
export type LicenseSelect = z.infer<typeof licenseSelectSchema>