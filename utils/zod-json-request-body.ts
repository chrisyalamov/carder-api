import { z } from "zod";
import { createSchema } from "zod-openapi";
import { OpenAPIV3 } from "npm:openapi-types";

/**
 * This is a helper function which takes a Zod schema and returns
 * an object which can be used as the `requestBody` of an endpoint
 * in OpenAPI.
 * @param schema - The Zod schema to convert
 * @returns 
 */
export const jsonBodySchemaFromZod = (schema: z.ZodTypeAny): {

        schema: OpenAPIV3.SchemaObject;

} => {
        return {
                schema: createSchema(schema).schema as OpenAPIV3.SchemaObject
        }
}

// schema only
// application