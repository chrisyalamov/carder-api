/**
 * Core Authentication and Identity Service (CAIS)
 * 
 * This module contains the authentication and identity service for the application.
 * It provides endpoints for user login, registration, and account activation.
 */

import { Hono } from 'npm:hono'
import { Env } from "../../main.ts";
import { describeRoute } from "hono-openapi";
import { users } from "../../db/schema/users.ts";
import { _userUnrestrictedInsertSchema, UserSelect } from "../../db/validators/user.ts";
import { HTTPException } from "hono/http-exception";
import { zValidator } from 'npm:@hono/zod-validator'
import { z } from "zod";
import { and, eq, inArray, or } from "drizzle-orm/expressions";
import { OpenAPIV3 } from "npm:openapi-types";
import { jsonBodySchemaFromZod } from "../../utils/zod-json-request-body.ts";
import { login_POST_RequestBody_JSON_Schema, authenticationMethodSchema, initiateRegistration_POST_RequestBody_JSON_Schema } from "./validators.ts";
import { randomBytes } from "node:crypto";
import * as bcrypt from "https://deno.land/x/bcrypt/mod.ts";
import { Session } from "../../utils/session-middleware.ts";
import { NeonDbError } from "npm:@neondatabase/serverless";
import { roleAssignments } from "../../db/schema/roleAssignments.ts";
import { policies } from "../../db/schema/policies.ts";
import { organisations } from "../../db/schema/organisations.ts";
import { ApplicationError } from "../../utils/application-error.ts";

// API router
const app = new Hono<Env>()

// /auth/login
app.post(
    '/auth/login',

    describeRoute({
        description: 'Login a user',
        requestBody: {
            content: {
                'application/json': jsonBodySchemaFromZod(login_POST_RequestBody_JSON_Schema)
            }
        },
        responses: {
            200: {
                description: 'User logged in',
            },
            401: {
                description: 'Invalid credentials',
            },
        }
    }),

    zValidator('json', login_POST_RequestBody_JSON_Schema),

    async (c) => {
        const session = c.get("session") as Session
        const db = c.get("database");
        const body = c.req.valid('json')

        // Verify UIC token
        const providedUic = body.uic
        const uic = session.continuity[providedUic]

        if (!uic) {
            throw new HTTPException(400, {
                message: "Invalid UIC token",
            })
        }

        // Conditions
        const conditions = [
            body.handle === uic.handle,
            uic.action === 'login',
            uic.issuedAt > Date.now() - 5 * 60 * 1000, // 5 minutes ago
        ]

        // Check if all conditions are met
        if (!conditions.every(Boolean)) {
            throw new HTTPException(401, {
                message: "Invalid UIC token",
            })
        }

        // Retrieve the user from the database
        const userResults = await db
            .select()
            .from(users)
            .where(
                and(
                    eq(users.email, body.handle),
                    or(
                        eq(users.accountStatus, "created"),
                        eq(users.accountStatus, "active")
                    )
                )
            )

        if (userResults.length === 0) {
            throw new HTTPException(404, {
                message: "User not found",
            })
        }

        const user = userResults[0] as UserSelect
        let verified = false

        switch (body.authenticationMethod.type) {
            case "password": {
                const { passwordHash } = user

                // Verify the password
                const isValidPassword = await bcrypt.compare(
                    body.authenticationMethod.password,
                    passwordHash
                )

                if (!isValidPassword) {
                    throw new HTTPException(401, {
                        message: "Invalid password",
                    })
                } else {
                    verified = true
                    delete session.continuity[providedUic]
                }

                break;
            }
            case "email-otp": {
                const otp = session.otps[`${body.handle}_login`]
                console.log(`OTP for ${body.handle}: ${otp}`)

                // Check if the OTP is valid
                if (otp !== body.authenticationMethod.code) {
                    throw new HTTPException(401, {
                        message: "Invalid OTP",
                    })
                } else {
                    verified = true
                    delete session.continuity[providedUic]
                }

                break;
            }
            default: {
                throw new HTTPException(400, {
                    message: "Invalid authentication method",
                })
            }
        }

        // If the user is verified, set the session user

        if (!verified) {
            throw new HTTPException(401, {
                message: "Invalid credentials",
            })
        } else {
            session.user = {
                userId: user.userId,
                accountStatus: user.accountStatus,
                fullName: user.fullName,
            }

            // Clear the OTP from the session
            delete session.otps[`${body.handle}_login`]
        }

        return c.json({
            message: "User logged in",
        })
    })

// /auth/logout
app.post(
    '/auth/logout',

    describeRoute({
        description: 'Logout a user',
        responses: {
            200: {
                description: 'User logged out',
            }
        }
    }),
    (c) => {
        const { session } = c.var

        session.clear = true

        return c.json({
            message: "User logged out",
        })
    }
)

// /auth/getAuthenticationOptions
app.get(
    '/auth/getAuthenticationOptions',

    describeRoute({
        description: "Obtain options for authenticating as a specific user",
        parameters: [
            {
                in: "query",
                name: "handle",
                description: "The email or username of the user being authenticated.",
                required: true,
            }
        ] as OpenAPIV3.ParameterObject[],
        responses: {
            200: {
                description: 'User found, authentication options returned',
                content: {
                    'application/json': jsonBodySchemaFromZod(z.object({
                        uic: z.string(),
                        options: z.array(authenticationMethodSchema),
                    }))
                }
            }
        }
    }),

    zValidator("query", z.object({
        handle: z.string().min(3),
    })),

    async (c) => {
        const db = c.get("database");
        const userHandle = c.req.valid("query").handle
        const session = c.get("session") as Session

        // Retrieve the user from the database
        const userResults = await db
            .select()
            .from(users)
            .where(
                eq(users.email, userHandle)
            )

        // Check if the user exists
        if (userResults.length === 0) {
            throw new HTTPException(404, {
                message: "User not found",
            })
        }

        // User Intent Continuity (UIC) token
        const randomToken = randomBytes(32).toString('hex')
        session.continuity[randomToken] = {
            action: 'login',
            handle: userHandle,
            issuedAt: Date.now(),
        }

        // Issue OTP and store it in session
        
        /**
         * In the future, this will be a randomly generated One-Time Password (OTP)
         * that is sent to the user via email or SMS.
         * 
         * However, for the purposes of this demo, the OTP is hardcoded to "000000"
         */

        // const otp = Math.floor(Math.random() * 1000000).toString().padStart(6, '0')
        const otp = "000000"
        session.otps[`${userHandle}_login`] = otp

        console.log(`OTP for ${userHandle}: ${otp}`)

        const options = [
            {
                type: "password",
            },
            {
                type: "email-otp"
            }
        ]

        return c.json({
            uic: randomToken,
            options,
        })
    }
)

// /auth/state
app.get(
    '/state',
    describeRoute({
        description: 'Get the current authentication state, based on the session cookie',
    }),
    (c) => {
        // Retrieve the session object from context
        const session = c.get("session") as Session

        // Return the current authenticated user
        return c.json(session?.user)
    }
)

// /user/getAvailableOrganisations
app.get(
    '/getAvailableOrganisations',
    describeRoute({
        description: 'Get the available organisations for the user',
        responses: {
            200: {
                description: 'Available organisations',
                content: jsonBodySchemaFromZod(z.array(z.string().ulid()))
            }
        }
    }),
    async (c) => {
        const db = c.get("database");
        const session = c.get("session") as Session

        // Check if the user is authenticated
        if (!session.user) {
            throw new HTTPException(401, {
                message: "User not authenticated"
            })
        }

        // Retrieve the user's organisations
        const cte = db.$with('userRoles')
            .as(
                db.select()
                    .from(roleAssignments)
                    .where(
                        eq(roleAssignments.userId, session.user.userId)
                    )
            )

        const belongingOrganisations = await db
            .with(cte)
            .select()
            .from(policies)
            .where(
                and(
                    eq(policies.resourceDiscriminator, "organisation"),
                    eq(policies.action, "belong_to_organisation"),
                    // Either:
                    or(
                        // A policy permits the user to belong to the organisation
                        and(
                            eq(policies.principalDiscriminator, "user"),
                            eq(policies.userId, session.user.userId),
                            eq(policies.effect, "allow")
                        ),

                        // A policy permits a role held by the user to belong to the organisation
                        and(
                            eq(policies.principalDiscriminator, "role"),
                            inArray(
                                policies.roleId,
                                db.select({
                                    roleId: cte.roleId
                                }).from(cte)
                            ),
                            eq(policies.effect, "allow")
                        )
                    )
                )
            )
            .innerJoin(
                organisations,
                eq(policies.resourceId, organisations.organisationId)
            )

        
        const orgs = belongingOrganisations.map((org) => ({
            organisationId: org.organisations.organisationId,
            organisationKey: org.organisations.key,
            organisationName: org.organisations.name,   
        }))

        return c.json(orgs)
    }
)

// /user/initiateRegistration
app.post(
    '/user/initiateRegistration',
    describeRoute({
        description: 'Initiate user registration',
        requestBody: {
            content: {
                "application/x-www-form-urlencoded": jsonBodySchemaFromZod(initiateRegistration_POST_RequestBody_JSON_Schema),
            }
        }
    }),
    zValidator('form', initiateRegistration_POST_RequestBody_JSON_Schema),
    async (c) => {
        const db = c.get("database");
        const body = c.req.valid('form')
        const session = c.get("session") as Session


        /**
         * Constructs a new user object
         */
        const newUser: z.infer<typeof _userUnrestrictedInsertSchema> = {
            fullName: body.fullName,
            email: body.email,
            accountStatus: "created",
            /**
             * Here, we hash the password for secure storage
             * 
             * Hashing is an irreversible cryptographic operation
             * that will allow us to later verify ownership of the
             * correct password without storing it in plaintext.
             */
            passwordHash: await bcrypt.hash(body.password),
        }

        let user;
        // Insert the record into the database
        try {
            user = await db.insert(users).values(newUser).returning({
                userId: users.userId,
                accountStatus: users.accountStatus,
            }) as UserSelect[]
        } catch (e) {
            if ((e as NeonDbError)?.code === "23505") {
                // Duplicate email error
                throw new ApplicationError("Email already exists", "DuplicateEmail", 409, "RegistrationError")
            } else {
                // Handle other errors
                throw new HTTPException(500, {
                    message: "Failed to create user",
                })
            }
        }

        // If the user was not created, throw an error
        if (!user) {
            throw new ApplicationError("Failed to create user", "RegistrationError", 500)
        } else {
            // If the user was created, set the ID in the session
            session.user = {
                userId: user[0].userId,
                accountStatus: user[0].accountStatus,
                fullName: newUser.fullName,
            }

            session.otps[`${user[0].userId}_activation`] = "445566"
        }

        return c.json({
            message: "User created",
            userId: user[0].userId
        })
    }
)

// /user/activateAccount
app.post(
    '/user/activateAccount',
    describeRoute({
        description: 'Activate a user account',
        requestBody: {
            content: {
                "application/x-www-form-urlencoded": jsonBodySchemaFromZod(z.object({
                    activationCode: z.string().length(6).regex(/^\d+$/),
                }))
            }
        }
    }),
    zValidator('form', z.object({
        activationCode: z.string().length(6).regex(/^\d+$/),
    })),
    async (c) => {
        const db = c.get("database");
        const body = c.req.valid('form')
        const session = c.get("session") as Session

        // Check if the user is authenticated
        if (!session.user) {
            throw new HTTPException(401, {
                message: "User not authenticated"
            })
        }

        // Retrieve authentication code and compare
        // const activationCode = session.otps[`${session.user.userId}_activation`]
        // delete session.otps[`${session.user.userId}_activation`]

        // if (activationCode !== body.activationCode) {
        //     const e = new Error("Invalid activation code")
        // }

        // For the purposes of the demo, the OTP is hardcoded
        if (body.activationCode !== "445566") {
            throw new HTTPException(401, {
                message: "Invalid activation code"
            })
        }

        // Update the user account status
        const updatedUser = await db
            .update(users)
            .set({
                accountStatus: "active"
            })
            .where(eq(users.userId, session.user.userId))
            .returning({
                userId: users.userId,
                accountStatus: users.accountStatus,
            }) as UserSelect[]

        // If the user was not updated, throw an error
        if (!updatedUser) {
            throw new HTTPException(500, {
                message: "Failed to activate user"
            })
        } else {
            // If the user was updated, set the ID in the session
            session.user = {
                userId: updatedUser[0].userId,
                accountStatus: updatedUser[0].accountStatus,
                fullName: session.user.fullName,
            }
        }

        return c.json({
            message: "User activated",
            userId: updatedUser[0].userId
        })
    }
)

export default app
