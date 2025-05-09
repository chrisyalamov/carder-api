/**
 * Module for system generated unique identifiers (ULIDs).
 *
 * This module exports ulid which is a function that generates a ULID.
 * 
 * Since database migrations are NOT generated in the Deno runtime,
 * using the jsr: protocol to import the ulid function from the standard library
 * causes an error.
 * 
 * To work around this, when generating the database migrations, the stub
 * function is used instead of the actual ulid function.
 * 
 * (Uncomment the respective line)
 */




// UNCOMMENT THIS LINE IN PRODUCTION
export const ulid = (await import("jsr:@std/ulid")).ulid;

// UNCOMMENT THIS LINE WHEN GENERATING MIGRATIONS
// export const ulid = () => ""