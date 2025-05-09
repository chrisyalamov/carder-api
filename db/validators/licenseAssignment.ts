import { createInsertSchema, createSelectSchema } from "npm:drizzle-zod";
import { licenseAssignments } from "../schema/licenseAssignments.ts";

export const licenseAssignmentSelectSchema = createSelectSchema(licenseAssignments)
export const licenseAssignmentInsertSchema = createInsertSchema(licenseAssignments)
    .omit({
        licenseAssignmentId: true
    })
    .strict()
export const licenseAssignmentUpdateSchema = licenseAssignmentInsertSchema.strict()

export type LicenseAssignmentInsert = z.infer<typeof licenseAssignmentInsertSchema>
export type LicenseAssignmentUpdate = z.infer<typeof licenseAssignmentUpdateSchema>
export type LicenseAssignmentSelect = z.infer<typeof licenseAssignmentSelectSchema>