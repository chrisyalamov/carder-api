import { Hono } from "npm:hono"
import { Env } from "../../main.ts"
import { HTTPException } from "hono/http-exception"
import { describeRoute } from "hono-openapi"
import { testPermissionsForUser } from "../../utils/policy-test.ts"
import { licenses } from "../../db/schema/licenses.ts"
import { and, eq } from "drizzle-orm/expressions"
import { licenseSelectSchema } from "../../db/validators/license.ts"
import { createSchema } from "zod-openapi"
import { OpenAPIV3 } from "npm:openapi-types"
import { z } from "zod"
import { zValidator } from "npm:@hono/zod-validator"
import { ApplicationError } from "../../utils/application-error.ts"
import { checkSessionAuthenticated } from "../../utils/req-check-auth.ts"
import { testPermissionsForRequest } from "../../utils/policy-test.ts"
import { skus } from "../../db/schema/skus.ts"
import { bulkPricingOffers } from "../../db/schema/bulkPricingOffers.ts"
import { aggregateSkus } from "../../utils/aggregate-skus.ts";
import { licenseAssignments } from "../../db/schema/licenseAssignments.ts";
import { attendeeProfiles } from "../../db/schema/attendeeProfile.ts";
import { events } from "../../db/schema/events.ts";

// API handler for /licenses
const app = new Hono<Env>()

// /getAvailableSkus
app.get(
  "/getAvailableSkus",
  describeRoute({
    description: "Get available SKUs",
  }),
  async (c) => {
    const db = c.get("database")

    const availableSkus = await db
      .select()
      .from(skus)
      .leftJoin(bulkPricingOffers, eq(skus.skuId, bulkPricingOffers.skuId))

    /**
     * The code below aggregates SKUs, combining rows for the same SKU
     * into a single row with an array of bulk pricing offers (if any).
     */
    const aggregatedSkus = aggregateSkus(availableSkus)

    return c.json(aggregatedSkus)
  }
)

// /getSkuById
app.get(
  "/getSkuById",
  describeRoute({
    description: "Get SKU by ID",
    parameters: [
      {
        in: "query",
        name: "organisationId",
        description: "The ID of the organisation to retrieve SKUs for",
        required: true,
        schema: { type: "string", format: "ulid" },
      },
      {
        in: "query",
        name: "skuId",
        description: "The ID of the SKU to retrieve",
        required: true,
        schema: { type: "string", format: "ulid" },
      },
    ],
  }),
  zValidator(
    "query",
    z.object({ organisationId: z.string().ulid(), skuId: z.string().ulid() })
  ),
  async (c) => {
    const db = c.get("database")
    const organisationId = c.req.valid("query").organisationId
    const skuId = c.req.valid("query").skuId

    checkSessionAuthenticated(c)
    await testPermissionsForRequest(
      c,
      "organisation",
      organisationId,
      "manage_licenses"
    )

    const sku = await db
      .select()
      .from(skus)
      .where(and(eq(skus.skuId, skuId)))
      .leftJoin(bulkPricingOffers, eq(skus.skuId, bulkPricingOffers.skuId))

    const aggregatedSkus = aggregateSkus(sku)

    if (!sku) {
      throw new HTTPException(404, {
        message: "SKU not found",
      })
    }

    return c.json(aggregatedSkus[0])
  }
)

// /getAll (get all licenses)
app.get(
  "/getAll",

  // OpenAPI route specification
  describeRoute({
    description: "Get all licenses",
    parameters: [
      {
        in: "query",
        name: "organisationId",
        description: "The ID of the organisation to retrieve licenses for",
        required: true,
        schema: { type: "string", format: "ulid" },
      },
    ],
  }),

  // Validate query params
  zValidator("query", z.object({ organisationId: z.string().ulid() })),

  async (c) => {
    const organisationId = c.req.valid("query").organisationId
    let { session, database: db } = c.var

    session = checkSessionAuthenticated(c)
    /**
     * Check that the user has a "manage_licenses" permission for the
     * given organisation.
     */
    const authorised = testPermissionsForUser(
      db,
      (session.user as any).userId,
      "organisation",
      organisationId,
      "manage_licenses"
    )

    if (!authorised) {
      throw new ApplicationError(
        "User does not have permission to manage licenses for this organisation",
        "AuthorisationError",
        403
      )
    }

    const orgFilter = eq(licenses.organisationId, organisationId)
    const allLicenses = await db.select().from(licenses).where(orgFilter)

    return c.json(allLicenses)
  }
)

// /getById
const getLicenseByIdParamsSchema = z.object({
  licenseId: z.string().ulid(),
  organisationId: z.string().ulid(),
})
app.get(
  "/getById",
  describeRoute({
    description: "Get license by ID",
    parameters: [
      {
        in: "query",
        name: "licenseId",
        description: "The ID of the license to retrieve",
        required: true,
        schema: createSchema(licenseSelectSchema.shape.licenseId)
          .schema as OpenAPIV3.SchemaObject,
      },
      {
        in: "query",
        name: "organisationId",
        description: "ID of the organisation",
        required: true,
        schema: { type: "string" },
      },
    ],
  }),
  zValidator("query", getLicenseByIdParamsSchema),
  async (c) => {
    const db = c.get("database")
    const params = c.req.valid("query")

    checkSessionAuthenticated(c)
    testPermissionsForRequest(
      c,
      "organisation",
      params.organisationId,
      "manage_licenses"
    )

    const license = await db
      .select()
      .from(licenses)
      .where(
        and(
          eq(licenses.organisationId, params.organisationId),
          eq(licenses.licenseId, params.licenseId)
        )
      )
      .leftJoin(
        licenseAssignments,
        eq(licenses.licenseId, licenseAssignments.licenseId)
      )

    if (!license) {
      throw new HTTPException(404, {
        message: "License not found",
      })
    }

    return c.json(license)
  }
)

// /getAttendeeLicenses
app.get(
  "/getAttendeeLicenses",
  describeRoute({
    description: "Get licenses for an attendee",
    parameters: [
      {
        in: "query",
        name: "attendeeProfileId",
        description: "The ID of the attendee to retrieve licenses for",
        required: true,
        schema: { type: "string", format: "ulid" },
      },
    ],
  }),
  zValidator("query", z.object({ attendeeProfileId: z.string().ulid() })),
  async (c) => {
    checkSessionAuthenticated(c)

    const { database: db, session } = c.var
    const params = c.req.valid("query")

    const attendeeProfile = await db
      .select()
      .from(attendeeProfiles)
      .where(eq(attendeeProfiles.attendeeProfileId, params.attendeeProfileId))

    if (!attendeeProfile) {
      throw new HTTPException(404, {
        message: "Attendee not found",
      })
    }

    const eventId = attendeeProfile[0].eventId
    const event = await db 
      .select()
      .from(events)
      .where(eq(events.eventId, eventId))

    if (!event) { throw new HTTPException(500, { message: "Event not found" }) }

    const manageEventPromise = testPermissionsForUser(db, (session.user as any).userId, "event", eventId, "manage_event")
    const manageLicensingPromise = testPermissionsForUser(db, (session.user as any).userId, "organisation", event[0].organisationId, "manage_licenses")

    const [manageEvent, manageLicensing] = await Promise.all([manageEventPromise, manageLicensingPromise])

    if (!manageEvent && !manageLicensing) {
      throw new HTTPException(403, {
        message: "User does not have permission to manage licenses for this organisation",
      })
    }

    const licensesForAttendee = await db
      .select()
      .from(licenseAssignments)
      .where(
        and(
          eq(licenseAssignments.targetType, "attendeeProfile"),
          eq(licenseAssignments.targetId, params.attendeeProfileId),
        )
      )
      .leftJoin(
        licenses,
        eq(licenseAssignments.licenseId, licenses.licenseId)
      )

    return c.json(licensesForAttendee)
  }
)

// /assignToAttendeeProfile
app.post(
  "/assignToAttendeeProfile",
  describeRoute({
    description: "Assign a license to an attendee profile",
    parameters: [
      {
        in: "query",
        name: "organisationId",
        description: "The ID of the organisation to assign the license to",
        required: true,
        schema: { type: "string", format: "ulid" },
      },
      {
        in: "query",
        name: "attendeeProfileId",
        description: "The ID of the attendee profile to assign the license to",
        required: true,
        schema: { type: "string", format: "ulid" },
      },
      {
        in: "query",
        name: "licenseId",
        description: "The ID of the license to assign",
        required: true,
        schema: { type: "string", format: "ulid" },
      }
    ],
  }),
  zValidator(
    "query",
    z.object({
      organisationId: z.string().ulid(),
      attendeeProfileId: z.string().ulid(),
      licenseId: z.string().ulid(),
    })
  ),
  async (c) => {
    const { database: db, session } = c.var
    const params = c.req.valid("query")

    checkSessionAuthenticated(c)
  

    const transaction = db.transaction(async tx => {
      const attendeeProfile = await tx
        .select()
        .from(attendeeProfiles)
        .where(eq(attendeeProfiles.attendeeProfileId, params.attendeeProfileId))
  
      if (!attendeeProfile || attendeeProfile.length === 0) {
        throw new HTTPException(400, {
          message: "Attendee not found",
        })
      }

      // Get event ID from attendee profile
      const eventId = attendeeProfile[0].eventId

      // Get the event
      const event = await tx
        .select()
        .from(events)
        .where(eq(events.eventId, eventId))

      if (!event || event.length === 0) {
        throw new HTTPException(400, {
          message: "Unknown error occurred",
        })
      }

      // Check user permissions
      const manageLicensingPromise = testPermissionsForUser(tx, (session.user as any).userId, "organisation", event[0].organisationId, "manage_licenses")
      const manageEventPromise = testPermissionsForUser(tx, (session.user as any).userId, "event", eventId, "manage_event")
  
      const [manageLicensing, manageEvent] = await Promise.all([manageLicensingPromise, manageEventPromise])

      if (!(manageLicensing && manageEvent)) {
        throw new HTTPException(403, {
          message: "User does not have permission to manage licenses for this organisation",
        })
      }

      const license = await tx
        .select()
        .from(licenses)
        .where(
          and(
            eq(licenses.organisationId, params.organisationId),
            eq(licenses.licenseId, params.licenseId)
          )
        ).for("share")
  
      if (!license) {
        throw new HTTPException(400, {
          message: "License not found",
        })
      }

      // Check license status
      if (license[0].status !== "available") {
        throw new HTTPException(400, {
          message: "License is not available",
        })
      }
  
      // Assign the license to the attendee profile
      await tx.insert(licenseAssignments).values({
        licenseId: params.licenseId,
        targetType: "attendeeProfile",
        targetId: params.attendeeProfileId,
      })

      await tx
        .update(licenses)
        .set({ status: "assigned" })
        .where(
          and(
            eq(licenses.organisationId, params.organisationId),
            eq(licenses.licenseId, params.licenseId)
          )
        )
    })

    await transaction
    return c.json({
      message: "License assigned to attendee profile",
    })
  }
)

// /unassignFromAttendeeProfile
app.post(
  '/unassignFromAttendeeProfile',
  describeRoute({
    description: "Unassign a license from an attendee profile",
    parameters: [
      {
        in: "query",
        name: "attendeeProfileId",
        description: "The ID of the attendee profile to unassign the license from",
        required: true,
        schema: { type: "string", format: "ulid" },
      },
      {
        in: "query",
        name: "licenseId",
        description: "The ID of the license to unassign",
        required: true,
        schema: { type: "string", format: "ulid" },
      }
    ],
  }),
  zValidator(
    "query",
    z.object({
      attendeeProfileId: z.string().ulid(),
      licenseId: z.string().ulid(),
    })
  ),
  async (c) => {
    const { database: db, session } = c.var
    const params = c.req.valid("query")
    checkSessionAuthenticated(c)
    
    // Get license and attendee profile

    const license = await db
      .select()
      .from(licenses)
      .where(
        eq(licenses.licenseId, params.licenseId),
      )

    if (!license) {
      throw new HTTPException(404, {
        message: "License not found",
      })
    }

    const attendeeProfile = await db
      .select()
      .from(attendeeProfiles)
      .where(eq(attendeeProfiles.attendeeProfileId, params.attendeeProfileId))

    if (!attendeeProfile) {
      throw new HTTPException(404, {
        message: "Attendee not found",
      })
    }

    // Get event ID from attendee profile
    const eventId = attendeeProfile[0].eventId
    
    // Get the event
    const event = await db
      .select()
      .from(events)
      .where(eq(events.eventId, eventId))

    if (!event) {
      throw new HTTPException(404, {
        message: "Unknown error occurred",
      })
    }

    // Check permissions
    const manageEventPromise = testPermissionsForUser(db, (session.user as any).userId, "event", eventId, "manage_event")
    const manageLicensingPromise = testPermissionsForUser(db, (session.user as any).userId, "organisation", event[0].organisationId, "manage_licenses")

    const [manageEvent, manageLicensing] = await Promise.all([manageEventPromise, manageLicensingPromise])

    if (!(manageEvent && manageLicensing)) {
      throw new HTTPException(403, {
        message: "User does not have permission to manage licenses for this organisation",
      })
    }

    // Check if the license status is "consumed"

    if (license[0].status === "consumed") {
      throw new ApplicationError(
        "This license has already been consumed and cannot be unassigned.",
        "LicenseAlreadyConsumed",
        400,
        "LicensingConflict",
      )
    }

    // Unassign the license from the attendee profile
    await db
      .delete(licenseAssignments)
      .where(
        and(
          eq(licenseAssignments.targetType, "attendeeProfile"),
          eq(licenseAssignments.targetId, params.attendeeProfileId),
          eq(licenseAssignments.licenseId, params.licenseId),
        )
      )

    await db
      .update(licenses)
      .set({ status: "available" })
      .where(
        and(
          eq(licenses.organisationId, event[0].organisationId),
          eq(licenses.licenseId, params.licenseId)
        )
      )

    return c.json({
      message: "License unassigned from attendee profile",
    })
  }
) 

export default app
