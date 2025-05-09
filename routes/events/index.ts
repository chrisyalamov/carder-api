import { Hono } from "npm:hono"
import { Env } from "../../main.ts"
import { describeRoute } from "hono-openapi"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { events } from "../../db/schema/events.ts"
import { eq } from "drizzle-orm/expressions"
import { HTTPException } from "hono/http-exception"
import { jsonBodySchemaFromZod } from "../../utils/zod-json-request-body.ts"
import {
  eventSelectSchema,
  eventUpdateSchema,
} from "../../db/validators/event.ts"
import { checkSessionAuthenticated } from "../../utils/req-check-auth.ts"
import { testPermissionsForRequest } from "../../utils/policy-test.ts"
import { attendeeProfiles } from "../../db/schema/attendeeProfile.ts"
import {
  attendeeProfileSelectSchema,
  attendeeProfileUpdateSchema,
} from "../../db/validators/attendeeProfile.ts"
import { roles } from "../../db/schema/roles.ts"
import { policies } from "../../db/schema/policies.ts"
import { roleAssignments } from "../../db/schema/roleAssignments.ts"

// API handler for /organisations
const app = new Hono<Env>()

// / getAllEventsForOrg
app.get(
  "/getAllEventsForOrg",
  describeRoute({
    description: "Retrieve all events under a particular organisation",
    parameters: [
      {
        in: "query",
        name: "organisationId",
        description: "The organisation for which to retrieve events.",
        required: true,
      },
    ],
    responses: {
      200: {
        description: "List of events",
        content: {
          "application/json": jsonBodySchemaFromZod(eventSelectSchema),
        },
      },
    },
  }),
  zValidator(
    "query",
    z.object({
      organisationId: z.string().ulid(),
    })
  ),
  async (c) => {
    const { database: db } = c.var
    const { organisationId } = c.req.valid("query")

    /**
     * @FUTURE: Here, the could specify filters, e.g. by event status.
     * This would require some filtering JSON syntax.
     */

    let result
    try {
      result = await db
        .select()
        .from(events)
        .where(eq(events.organisationId, organisationId))
    } catch {
      throw new HTTPException(500, { message: "Unknown error occurred" })
    }

    return c.json(result)
  }
)

// /getEventById
app.get(
  "/getEventById",
  describeRoute({
    description: "Retrieve an event by its ID",
    parameters: [
      {
        in: "query",
        name: "eventId",
        description: "The ID of the event to retrieve.",
        required: true,
      },
    ],
    responses: {
      200: {
        description: "Event details",
        content: {
          "application/json": jsonBodySchemaFromZod(eventSelectSchema),
        },
      },
    },
  }),
  zValidator(
    "query",
    z.object({
      eventId: z.string().ulid(),
    })
  ),
  async (c) => {
    const { database: db } = c.var
    const { eventId } = c.req.valid("query")

    checkSessionAuthenticated(c)

    // Retrieve attendee profiles

    const eventQueryPromise = db
      .select()
      .from(events)
      .where(eq(events.eventId, eventId))
      .limit(1)

    const attendeeProfilesPromise = db
      .select()
      .from(attendeeProfiles)
      .where(eq(attendeeProfiles.eventId, eventId))

    const [eventResult, attendeeProfilesResult] = await Promise.all([
      eventQueryPromise,
      attendeeProfilesPromise,
    ])

    if (eventResult.length === 0) {
      throw new HTTPException(404, { message: "Event not found" })
    }

    const event = eventResult[0]

    return c.json({
      event,
      attendeeProfiles: attendeeProfilesResult ?? [],
    })
  }
)

// /createEvent
app.post(
  "/createEvent",
  describeRoute({
    description: "Create a new event",
    parameters: [
      {
        in: "query",
        name: "organisationId",
        description: "The organisation for which to create the event.",
        required: true,
      },
    ],
  }),
  zValidator(
    "query",
    z.object({
      organisationId: z.string().ulid(),
    })
  ),
  async (c) => {
    const { database: db, session } = c.var
    const { organisationId } = c.req.valid("query")

    checkSessionAuthenticated(c)
    await testPermissionsForRequest(c, "organisation", organisationId, [
      "manage_events",
      "manage_organisation",
    ])

    try {
      const result = await db.transaction(async (tx) => {
        const event = await tx
          .insert(events)
          .values([
            {
              organisationId: organisationId,
              name: "",
              description: "",
              location: "",
              startDate: new Date(),
              endDate: new Date(),
            },
          ])
          .returning({
            eventId: events.eventId,
          })

        // Create new role, policy, and assign to user
        const newRole = await tx
          .insert(roles)
          .values([
            {
              organisationId: organisationId,
              name: `${event[0].eventId}_event-manager`,
            },
          ])
          .returning({
            roleId: roles.roleId,
          })

        const newPolicy = tx.insert(policies).values([
          {
            principalDiscriminator: "role",
            roleId: newRole[0].roleId,
            resourceDiscriminator: "event",
            resourceId: event[0].eventId,
            action: "manage_event",
            effect: "allow",
          },
        ])

        const assignRole = tx.insert(roleAssignments).values([
          {
            roleId: newRole[0].roleId,
            userId: (session.user as any).userId,
          },
        ])

        await Promise.all([newPolicy, assignRole])

        return event[0]
      })

      return c.json(result)
    } catch (e) {
      throw new HTTPException(500, { message: "Unknown error occurred" })
    }
  }
)

// /updateEvent
app.post(
  "/updateEvent",
  describeRoute({
    description: "Update an event record",
    parameters: [
      {
        in: "query",
        name: "organisationId",
        required: true,
        description: "The organisation under which the event should be created",
        schema: { type: "string" },
      },
    ],
    requestBody: {
      required: true,
      content: {
        "application/x-www-form-urlencoded":
          jsonBodySchemaFromZod(eventUpdateSchema),
      },
    },
  }),
  zValidator(
    "form",
    eventUpdateSchema
      .setKey("organisationId", z.string().ulid())
      .setKey("eventId", z.string().ulid())
      .setKey("startDate", z.string())
      .setKey("endDate", z.string())
  ),
  async (c) => {
    const data = c.req.valid("form")
    const { database: db } = c.var

    checkSessionAuthenticated(c)
    await testPermissionsForRequest(c, "organisation", data.organisationId, [
      "manage_events",
      "manage_organisation",
    ])

    const body = c.req.valid("form")
    const newBody = {
      ...body,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
    }

    try {
      const result = await db
        .update(events)
        .set(newBody)
        .where(eq(events.eventId, body.eventId))
        .returning({
          eventId: events.eventId,
        })

      return c.json(result)
    } catch (e) {
      throw new HTTPException(500, { message: "Unknown error occurred" })
    }
  }
)

// /getAttendeeProfile
app.get(
  "/getAttendeeProfile",
  describeRoute({
    description: "Retrieve an attendee profile by its ID",
    parameters: [
      {
        in: "query",
        name: "attendeeProfileId",
        description: "The ID of the attendee profile to retrieve.",
        required: true,
      },
    ],
    responses: {
      200: {
        description: "Attendee profile details",
        content: {
          "application/json": jsonBodySchemaFromZod(
            attendeeProfileSelectSchema
          ),
        },
      },
    },
  }),
  zValidator(
    "query",
    z.object({
      attendeeProfileId: z.string().ulid(),
    })
  ),
  async (c) => {
    const { database: db } = c.var
    const { attendeeProfileId } = c.req.valid("query")

    checkSessionAuthenticated(c)

    const result = await db
      .select()
      .from(attendeeProfiles)
      .where(eq(attendeeProfiles.attendeeProfileId, attendeeProfileId))
      .limit(1)

    if (result.length === 0) {
      throw new HTTPException(404, { message: "Attendee profile not found" })
    }

    return c.json(result[0])
  }
)

// /newAttendeeProfile
app.post(
  "/newAttendeeProfile",
  describeRoute({
    description: "Create a new attendee profile",
  }),
  zValidator(
    "query",
    z.object({
      organisationId: z.string().ulid(),
      eventId: z.string().ulid(),
    })
  ),
  async (c) => {
    const { database: db } = c.var
    const { organisationId, eventId } = c.req.valid("query")

    checkSessionAuthenticated(c)
    await testPermissionsForRequest(c, "organisation", organisationId, [
      "manage_events",
      "manage_organisation",
    ])

    try {
      const result = await db
        .insert(attendeeProfiles)
        .values([
          {
            eventId: eventId,
            fullName: "",
            email: "",
          },
        ])
        .returning({
          attendeeProfileId: attendeeProfiles.attendeeProfileId,
        })

      return c.json(result)
    } catch (e: any) {
      if (e.code === "23505") {
        // Unique constraint violation
        throw new HTTPException(400, {
          message:
            "There can only be a single empty attendee profile under an event, at a time. Please make sure all attendee profiles have been populated with an email address.",
        })
      }
      throw new HTTPException(500, {
        message: "Unknown error occurred. " + e?.message,
      })
    }
  }
)

// /updateAttendeeProfile
app.post(
  "/updateAttendeeProfile",
  describeRoute({
    description: "Update an attendee profile",
    requestBody: {
      required: true,
      content: {
        "application/x-www-form-urlencoded": jsonBodySchemaFromZod(
          attendeeProfileUpdateSchema
        ),
      },
    },
  }),
  zValidator(
    "form",
    attendeeProfileUpdateSchema
      .setKey("organisationId", z.string().ulid())
      .setKey("eventId", z.string().ulid())
      .setKey("attendeeProfileId", z.string().ulid())
  ),
  async (c) => {
    const { database: db } = c.var
    const data = c.req.valid("form")

    checkSessionAuthenticated(c)
    await testPermissionsForRequest(c, "organisation", data.organisationId, [
      "manage_events",
      "manage_organisation",
    ])

    const body = c.req.valid("form")

    try {
      const result = await db
        .update(attendeeProfiles)
        .set(body)
        .where(eq(attendeeProfiles.attendeeProfileId, body.attendeeProfileId))
        .returning({
          attendeeProfileId: attendeeProfiles.attendeeProfileId,
        })

      return c.json(result)
    } catch (e: any) {
      if (e?.code === "23505") {
        // Unique constraint violation
        throw new HTTPException(400, {
          message:
            "There can only be a single attendee profile with the same email address under an event, at a time. Please make sure all attendee profiles have unique email addresses.",
        })
      }
      throw new HTTPException(500, { message: "Unknown error occurred" })
    }
  }
)

// /deleteEvent
app.post(
  "/deleteEvent",
  describeRoute({
    description: "Delete an event by its ID",
    parameters: [
      {
        in: "query",
        name: "eventId",
        description: "The ID of the event to delete.",
        required: true,
      },
    ],
  }),
  zValidator(
    "query",
    z.object({
      eventId: z.string().ulid(),
    })
  ),
  async (c) => {
    const { database: db } = c.var
    const { eventId } = c.req.valid("query")

    checkSessionAuthenticated(c)

    // Check if the event exists
    const event = await db
      .select()
      .from(events)
      .where(eq(events.eventId, eventId))
      .limit(1)

    if (event.length === 0) {
      throw new HTTPException(404, { message: "Event not found" })
    }

    // Check if the user has permission to delete the event
    await testPermissionsForRequest(
      c,
      "organisation",
      event[0].organisationId,
      ["manage_events", "manage_organisation"]
    )

    // Delete the event
    await db.delete(events).where(eq(events.eventId, eventId)).returning({
      eventId: events.eventId,
    })

    return c.json({
      message: "Event deleted successfully",
    })
  }
)

export default app
