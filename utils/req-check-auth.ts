import { Env } from "../main.ts";
import { HTTPException } from "hono/http-exception";
import { Context } from "npm:hono";

type WithRequiredUser<T extends { user?: any }> = Omit<T, "user"> & {
    user: NonNullable<T["user"]>;
};


export const checkSessionAuthenticated = (c: Context<Env, any, any>, requireUserActive: boolean = true) => {
    const session = c.get("session");
    type S = typeof session;

    if (!session?.user) {
        throw new HTTPException(401, {
            message: "User not authenticated"
        })
    } else if (!session.user?.userId) {
        throw new HTTPException(401, {
            message: "User not authenticated"
        })
    } else if (requireUserActive && !(session.user.accountStatus === "active")) {
        throw new HTTPException(403, {
            message: "User not active"
        })
    } 
    return session as WithRequiredUser<S>
}
