CREATE TABLE "attendee_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"event_id" text NOT NULL,
	"email" text NOT NULL,
	"UserID" text,
	CONSTRAINT "AK_AttendeeEnrolments_EventId_Email" UNIQUE("event_id","email")
);
--> statement-breakpoint
CREATE TABLE "bulk_pricing_offers" (
	"id" text PRIMARY KEY NOT NULL,
	"sku_id" text NOT NULL,
	"min_quantity" numeric NOT NULL,
	"max_quantity" numeric NOT NULL,
	"discount_percentage" numeric NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkout_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"purchase_order_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"stripe_session_id" text
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"location" text NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"image_url" text,
	"organisation_id" text NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	CONSTRAINT "CK_Events_Status" CHECK ("events"."status" IN ('planned', 'upcoming', 'live', 'completed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "license_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"license_id" text NOT NULL,
	"target_discriminator" text NOT NULL,
	"target_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "licenses" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"organisation_id" text NOT NULL,
	"purchase_order_id" text,
	"status" text DEFAULT 'available' NOT NULL,
	"sku_id" text NOT NULL,
	CONSTRAINT "CK_Licenses_Status" CHECK ("licenses"."status" IN ('available', 'assigned', 'consumed', 'expired'))
);
--> statement-breakpoint
CREATE TABLE "line_items" (
	"id" text PRIMARY KEY NOT NULL,
	"purchase_order_id" text NOT NULL,
	"sku_id" text NOT NULL,
	"sku_name" text NOT NULL,
	"sku_code" text,
	"type" text DEFAULT 'charge' NOT NULL,
	"quantity" text NOT NULL,
	"unit_price" text NOT NULL,
	"applied_bulk_pricing_offer_id" text,
	"total_price" text NOT NULL,
	"currency" text DEFAULT 'GBP' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organisations" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "AK_OrganisaionKey" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"id" text PRIMARY KEY NOT NULL,
	"principal_discriminator" text NOT NULL,
	"user_id" text,
	"role_id" text,
	"resource_discriminator" text NOT NULL,
	"resource_id" text NOT NULL,
	"action" text NOT NULL,
	"effect" text DEFAULT 'deny' NOT NULL,
	CONSTRAINT "CK_AccessControlPolicies_SinglePrincipal" CHECK (
        (
            "policies"."principal_discriminator" = 'user' 
            AND "policies"."user_id" IS NOT NULL 
            AND "policies"."role_id" IS NULL
        ) 
        OR 
        (
            "policies"."principal_discriminator" = 'role' 
            AND "policies"."role_id" IS NOT NULL 
            AND "policies"."user_id" IS NULL
        )),
	CONSTRAINT "CK_ACPs_Effect" CHECK ("policies"."effect" IN ('allow', 'deny')),
	CONSTRAINT "CK_ACPs_PrincipalDiscriminator" CHECK ("policies"."principal_discriminator" IN ('user', 'role'))
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"role_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"name" text
);
--> statement-breakpoint
CREATE TABLE "skus" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"unit_price_currency" text NOT NULL,
	"unit_price" text NOT NULL,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"profile_image_url" text,
	"account_status" text DEFAULT 'created' NOT NULL,
	CONSTRAINT "UQ_Users_Email" UNIQUE("email"),
	CONSTRAINT "CK_Users_AccountStatus" CHECK ("users"."account_status" IN ('created', 'active', 'suspended', 'deleted'))
);
--> statement-breakpoint
ALTER TABLE "attendee_profiles" ADD CONSTRAINT "FK_AttendeeProfiles_Events_EventId" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendee_profiles" ADD CONSTRAINT "FK_AttendeeProfiles_Users_UserID" FOREIGN KEY ("UserID") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_pricing_offers" ADD CONSTRAINT "FK_BulkPricingOffers_Skus_SkuId" FOREIGN KEY ("sku_id") REFERENCES "public"."skus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "FK_CheckoutSessions_Organisations_OrganisationId" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "FK_CheckoutSessions_PurchaseOrders_PurchaseOrderId" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "FK_Events_Organisations_OrganisationId" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_assignments" ADD CONSTRAINT "FK_LicenseAssignments_Licenses_LicenseId" FOREIGN KEY ("license_id") REFERENCES "public"."licenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "licenses" ADD CONSTRAINT "FK_Licenses_Organisations_OrganisationId" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "licenses" ADD CONSTRAINT "FK_Licenses_PurchaseOrders_PurchaseOrderId" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "licenses" ADD CONSTRAINT "FK_Licenses_Skus_SkuId" FOREIGN KEY ("sku_id") REFERENCES "public"."skus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_items" ADD CONSTRAINT "FK_LineItems_PurchaseOrders_PurchaseOrderId" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_items" ADD CONSTRAINT "FK_LineItems_Skus_SkuId" FOREIGN KEY ("sku_id") REFERENCES "public"."skus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_items" ADD CONSTRAINT "FK_LineItems_BulkPricingOffers_OfferId" FOREIGN KEY ("applied_bulk_pricing_offer_id") REFERENCES "public"."bulk_pricing_offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "FK_Policies_Users_UserId" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "FK_Policies_Roles_RoleId" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "FK_PurchaseOrders_Organisations_OrganisationId" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "FK_RoleAssignments_Users_UserId" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "FK_RoleAssignments_Roles_RoleId" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "FK_Roles_Organisations_OrganisationId" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IX_AttendeeProfiles_EventId" ON "attendee_profiles" USING btree ("event_id" text_ops);--> statement-breakpoint
CREATE INDEX "IX_BulkPricingOffers_SkuId" ON "bulk_pricing_offers" USING btree ("sku_id" text_ops);--> statement-breakpoint
CREATE INDEX "IX_CheckoutSessions_OrganisationId" ON "checkout_sessions" USING btree ("organisation_id" text_ops);--> statement-breakpoint
CREATE INDEX "IX_CheckoutSessions_PurchaseOrderId" ON "checkout_sessions" USING btree ("purchase_order_id" text_ops);--> statement-breakpoint
CREATE INDEX "IX_Events_OrganisationId" ON "events" USING btree ("organisation_id" text_ops);--> statement-breakpoint
CREATE INDEX "IX_LicenseAssignments_LicenseId" ON "license_assignments" USING btree ("license_id" text_ops);--> statement-breakpoint
CREATE INDEX "IX_Licenses_OrganisationId" ON "licenses" USING btree ("organisation_id" text_ops);--> statement-breakpoint
CREATE INDEX "IX_LineItems_PurchaseOrderId" ON "line_items" USING btree ("purchase_order_id" text_ops);--> statement-breakpoint
CREATE INDEX "IX_LineItems_SkuId" ON "line_items" USING btree ("sku_id" text_ops);--> statement-breakpoint
CREATE INDEX "IX_ACPs_ResourceDiscriminator_ResourceID_UserID" ON "policies" USING btree ("resource_discriminator" text_ops,"resource_id" text_ops,"user_id" text_ops);--> statement-breakpoint
CREATE INDEX "IX_ACPs_ResourceDiscriminator_ResourceID_RoleID" ON "policies" USING btree ("resource_discriminator" text_ops,"resource_id" text_ops,"role_id" text_ops);--> statement-breakpoint
CREATE INDEX "IX_PurchaseOrders_OrganisationId" ON "purchase_orders" USING btree ("organisation_id" text_ops);--> statement-breakpoint
CREATE INDEX "IX_RoleAssignments_UserId" ON "role_assignments" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "IX_RoleAssignments_RoleId" ON "role_assignments" USING btree ("role_id" text_ops);