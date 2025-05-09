import { cors } from "npm:hono/cors";
import { Env } from "../main.ts";
import { createMiddleware } from "npm:hono/factory";
import { env } from "npm:hono/adapter";

export const corsMiddleware = createMiddleware<Env>((c, next) => {
    const { FRONTEND_HOST } = env(c);

    return cors({
        origin: [
            "http://localhost:3000",
            "https://dev-3000.chrisyalamov.space",
            FRONTEND_HOST as string,
        ],
        credentials: true,
    })(c, next);
})