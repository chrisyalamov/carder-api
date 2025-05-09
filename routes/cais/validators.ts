import { z } from "zod";
import { userInsertSchema } from "../../db/validators/user.ts";

export const authenticationMethodPasswordSchema = z.object({
    type: z.literal("password"),
    password: z.string().min(8),
});

export const authenticationMethodEmailOTPSchema = z.object({
    type: z.literal("email-otp"),
    code: z.string().length(6).regex(/^\d+$/),
});

export const authenticationMethodSchema = z.discriminatedUnion("type", [
    authenticationMethodPasswordSchema,
    authenticationMethodEmailOTPSchema,
]);

export const login_POST_RequestBody_JSON_Schema = z.object({
    handle: z.string().email(),
    eventId: z.string().optional(),
    authenticationMethod: authenticationMethodSchema,
    uic: z.string()
})

export const initiateRegistration_POST_RequestBody_JSON_Schema =
    userInsertSchema
        .extend({
            password: z.string().min(8),
            agreesToTermsAndConditions: z.literal('on'),
            termsAndConditionsVersion: z.string(),

        })
        .strict()