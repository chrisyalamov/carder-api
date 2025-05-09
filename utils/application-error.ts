import { ContentfulStatusCode } from "hono/utils/http-status";

export class ApplicationError extends Error {
    constructor(
        message: string,
        name: string = 'CarderAPIError',
        public statusCode: ContentfulStatusCode = 500,
        public type?: string,
        public details?: unknown,
    ) {
        super(message);
        this.name = name;
        this.statusCode = statusCode;
        this.type = type;
        this.details = details;
    }
}