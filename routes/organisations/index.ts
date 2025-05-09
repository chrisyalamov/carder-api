import { Hono } from 'npm:hono'
import { Env } from "../../main.ts";
import { organisations } from "../../db/schema/organisations.ts";
import { validator } from "npm:hono/validator";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm/expressions";
import { describeRoute } from "hono-openapi";
import { organisationInsertSchema, organisationUpdateSchema, organisationSelectSchema } from "../../db/validators/organisation.ts";
import { OpenAPIV3 } from "npm:openapi-types";
import { createSchema } from 'npm:zod-openapi';
import { z } from "zod";
import { zValidator } from "npm:@hono/zod-validator";
import { jsonBodySchemaFromZod } from "../../utils/zod-json-request-body.ts";
import { roles } from "../../db/schema/roles.ts";
import { roleAssignments } from "../../db/schema/roleAssignments.ts";
import { policies } from "../../db/schema/policies.ts";
import { ApplicationError } from "../../utils/application-error.ts";
import { checkSessionAuthenticated } from "../../utils/req-check-auth.ts";

// API handler for /organisations
const app = new Hono<Env>()


// GET (list) all organisations
app.get(
    '/getAllOrganisations',

    // Describe the route for the OpenAPI spec (documentation)
    describeRoute({
        description: 'List all organisations',
        responses: {
            200: {
                description: "List of organisations",
                content: {
                    'application/json': jsonBodySchemaFromZod(organisationSelectSchema.array())
                }
            },
        }
    }),

    // Handle request
    async (c): Promise<any> => {
        const db = c.get("database")
        const result = await db.select().from(organisations);
        return c.json(result)
    })

// GET specific organisation
app.get(
    '/getOrganisation',

    // Describe the route for the OpenAPI spec (documentation)
    describeRoute({
        description: 'Get a specific organisation',
        parameters: [
            {
                in: "query",
                name: "organisationId",
                required: true,
                schema: {
                    type: "string",
                    format: "ulid",
                }
            }
        ] as OpenAPIV3.ParameterObject[],
        responses: {
            200: {
                description: "Organisation found",
                content: {
                    'application/json': jsonBodySchemaFromZod(organisationSelectSchema)
                }
            },
            404: {
                description: "Organisation not found"
            }
        }
    }),

    // Validate params
    zValidator("query", z.object({ organisationId: z.string().ulid() })),

    // Handle request
    async (c): Promise<any> => {
        const db = c.get("database")
        const organisationId = c.req.valid('query').organisationId

        const result = await db.select().from(organisations).where(
            eq(organisations.organisationId, organisationId)
        ).limit(1);

        if (result.length === 0) {
            throw new HTTPException(404, {
                message: "Organisation not found"
            })
        } else {
            return c.json(result[0])
        }
    }
)

// Create new organisation
app.post(
    '/createNewOrganisation',

    // Describe the route for the OpenAPI spec (documentation)
    describeRoute({
        description: 'Create a new organisation',
        requestBody: {
            content: {
                'application/x-www-form-urlencoded': jsonBodySchemaFromZod(organisationInsertSchema)
            }
        }
    }),

    // Validate the request body
    zValidator("form", organisationInsertSchema),

    // Handle the request
    async (c): Promise<any> => {
        checkSessionAuthenticated(c, true)

        const { database: db, session } = c.var
        const organisation = c.req.valid('form')

        const newOrg = await db.transaction(async (tx) => {
            let result;

            try {
                result = await tx.insert(organisations).values(organisation).returning()
            } catch (e: any) {
                if (e?.code === "23505") {
                    throw new ApplicationError("Organisation already exists", "OrganisationAlreadyExists", 409, "OrganisationCreationError")
                } else {
                    throw e
                }
            }

            // provision roles and permissions
            const orgRoles = await tx.insert(roles).values([
                {
                    name: `${result[0].organisationId}_owner`,
                    organisationId: result[0].organisationId,
                }
            ]).returning()

            const orgRoleAssignments = tx.insert(roleAssignments).values([
                {
                    roleId: orgRoles[0].roleId,
                    userId: session.user?.userId as string
                }
            ]).returning()

            const orgPolicies = tx.insert(policies).values([
                {
                    action: "manage_organisation",
                    resourceDiscriminator: "organisation",
                    resourceId: result[0].organisationId,
                    roleId: orgRoles[0].roleId,
                    effect: "allow",
                    principalDiscriminator: "role"
                },
                {
                    action: "manage_licenses",
                    resourceDiscriminator: "organisation",
                    resourceId: result[0].organisationId,
                    roleId: orgRoles[0].roleId,
                    effect: "allow",
                    principalDiscriminator: "role"
                },
                {
                    action: "belong_to_organisation",
                    resourceDiscriminator: "organisation",
                    resourceId: result[0].organisationId,
                    principalDiscriminator: "user",
                    userId: session.user?.userId as string,
                    effect: "allow"
                },
            ]).returning()

            // Wait for both
            await Promise.all([orgPolicies, orgRoleAssignments])

            return result[0]
        })



        return c.json(newOrg)
    }
)

// Change organisation details
app.post(
    '/updateOrganisationDetails',

    // Describe the route for the OpenAPI spec (documentation)
    describeRoute({
        description: 'Update an existing organisation',
        requestBody: {
            content: {
                'application/json': {
                    schema: createSchema(z.object({
                        organisationId: z.string().ulid(),
                        patch: organisationUpdateSchema.partial()
                    })).schema as OpenAPIV3.SchemaObject
                }
            }
        }
    }),


    // Validate the request body
    validator("json", value => {
        const validationResult = z.object({
            organisationId: z.string().ulid(),
            patch: organisationUpdateSchema.partial()
        }).safeParse(value)

        if (validationResult.success) {
            return validationResult.data
        } else {
            throw new HTTPException(400, {
                message: validationResult.error.toString()
            })
        }
    }),

    // Handle the request
    async (c): Promise<any> => {
        const db = c.get("database")
        const { organisationId, patch } = c.req.valid('json')

        const result = await db.update(organisations).set(patch).where(
            eq(organisations.organisationId, organisationId)
        ).returning()

        if (result.length === 0) {
            throw new HTTPException(404, {
                message: "Organisation not found"
            })
        } else {
            return c.json(result[0])
        }
    }
)

app.on(
    ['POST', 'DELETE'],
    '/deleteOrganisation',

    // Describe the route for the OpenAPI spec (documentation)
    describeRoute({
        description: 'Delete (decommission) an organisation',
        requestBody: {
            content: {
                'application/json': jsonBodySchemaFromZod(z.object({
                    organisationId: z.string().ulid(),
                }))
            }
        }
    }),


    // Validate the request body
    zValidator("form", z.object({
        organisationId: z.string().ulid(),
    })),

    // Handle the request
    async (c) => {
        const db = c.get("database")
        const { organisationId } = c.req.valid('form')

        await db.transaction(async (tx) => {
            // Delete organisation
            const deleteOrg = await tx.delete(organisations).where(
                eq(organisations.organisationId, organisationId)
            ).returning()

            if (deleteOrg.length === 0) {
                throw new ApplicationError("An organisation with the given ID does not exist.", "OrganisationNotFound", 404, "OrganisationDeletionError")
            }
        })

        return c.json({
            success: true,
            message: "Organisation deleted successfully"
        })
    }
)

export default app
