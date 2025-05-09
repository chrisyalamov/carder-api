import { z } from "zod";
import { policySelectSchema } from "../db/validators/policy.ts";
import { NodePgDatabase } from "drizzle-orm/node-postgres/driver";
import { roleAssignments } from "../db/schema/roleAssignments.ts";
import { and, eq, inArray, or } from "drizzle-orm/expressions";
import { policies } from "../db/schema/policies.ts";
import { Context } from "npm:hono";
import { Env } from "../main.ts";
import { HTTPException } from "hono/http-exception";
import { ApplicationError } from "./application-error.ts";

/**
 * A function that takes a list of policies and evaluate, when 
 * combined, whether they allow or deny access.
 * 
 * @param policies The policies to check
 * @returns {boolean} `false` if there is any `DENY` policy present, or otherwise, if there is at least one `ALLOW` policy present, `true`.
 */
export const evaluateCompoundPolicyEffect = (policies: z.infer<typeof policySelectSchema>[]): boolean => {
    let allowPresent = false;

    for (const policy of policies) {
        if (policy.effect.toLowerCase() === "deny") {
            // If any encountered policy is a DENY, we early return false
            return false;
        }
        if (policy.effect.toLowerCase() === "allow") {
            // If we encounter an ALLOW policy, we set the allowPresent flag to true
            allowPresent = true;
        }
    }

    if (allowPresent) {
        // If any ALLOW policies were encountered, and the function has not yet
        // early returned false due to a DENY policy, we return true

        return true;
    } else {
        return false;
    }
}

/**
 * This is a helper function that checks whether a user has permission to 
 * perform an action on a resource.
 * 
 * @param {NodePgDatabase} db - The database connection (Drizzle ORM)
 * @param {string} userId - The ID of the user to check permissions for
 * @param {string} resourceType - The resource type discriminator (e.g. 
 *  "organisation", "event", etc.)
 * @param {string} resourceId The resource ID (e.g. the organisation ID, 
 *  event ID, etc.)
 * @param {string} action The action to check permissions for (e.g. 
 *  "assign_license", "enrol_attendee", etc.)
 * @returns {Promise<boolean>} `true` if the user has permission to perform the 
 *  action on the resource, `false` otherwise.
 */
export const testPermissionsForUser = async (db: NodePgDatabase, userId: string, resourceType: string, resourceId: string, action: string | string[]): Promise<boolean> => {
    const cte =
        db.$with('userRoles')
            .as(
                db.select()
                    .from(roleAssignments)
                    .where(
                        eq(roleAssignments.userId, userId)
                    )
            )

    const relevantPolicies = await
        db
            .with(cte)
            .select()
            .from(policies)
            .where(
                and(
                    eq(policies.resourceDiscriminator, resourceType),
                    eq(policies.resourceId, resourceId),
                    // If the action is an array, test for inArray
                    action instanceof Array 
                    ? inArray(policies.action, action)
                    : eq(policies.action, action),
                    or(
                        eq(policies.userId, userId),
                        inArray(policies.roleId, db.select({
                            roleId: cte.roleId
                        }).from(cte)
                        )
                    )
                )
            )

    const result = evaluateCompoundPolicyEffect(relevantPolicies);

    return result;
}

/**
 * This is a helper function that checks permissions, given a request context.
 */
export const testPermissionsForRequest = async (c: Context<Env>, resourceType: string, resourceId: string, action: string | string[]): Promise<boolean> => {
    let { session, database: db } = c.var
    const userId = (session.user as any)?.userId

    if (!userId) { throw new HTTPException(400, { message: "Malformed request" }) }

    const authorised = await testPermissionsForUser(db, userId, resourceType, resourceId, action)

    if (!authorised) {
        throw new ApplicationError(
            "The currently authenticated user does not have permission to perform this action on the specified resource.",
            "UnauthorisedRequest",
            403,
            "AuthorisationError",
            {
                userId,
                resourceType,
                resourceId,
                action
            }
        )
    }

    return authorised
}