CREATE TABLE "daily_spending" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"date" date NOT NULL,
	"spent" numeric(12, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "daily_spending_plan_id_date_unique" UNIQUE("plan_id","date")
);
--> statement-breakpoint
CREATE TABLE "spending_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"desired_saving" numeric(12, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "spending_plans_year_month_unique" UNIQUE("year","month")
);
--> statement-breakpoint
ALTER TABLE "daily_spending" ADD CONSTRAINT "daily_spending_plan_id_spending_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."spending_plans"("id") ON DELETE cascade ON UPDATE no action;