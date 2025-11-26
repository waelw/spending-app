import { pgTable, serial, text, timestamp, integer, numeric, date, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

export const todos = pgTable('todos', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
})

export const spendingPlans = pgTable('spending_plans', {
  id: serial('id').primaryKey(),
  year: integer('year').notNull(),
  month: integer('month').notNull(), // 0-indexed (0 = January)
  totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull(),
  desiredSaving: numeric('desired_saving', { precision: 12, scale: 2 }).notNull().default('0'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  uniqueYearMonth: unique().on(table.year, table.month),
}))

export const spendingPlansRelations = relations(spendingPlans, ({ many }) => ({
  dailySpending: many(dailySpending),
}))

export const dailySpending = pgTable('daily_spending', {
  id: serial('id').primaryKey(),
  planId: integer('plan_id').notNull().references(() => spendingPlans.id, { onDelete: 'cascade' }),
  date: date('date').notNull(),
  spent: numeric('spent', { precision: 12, scale: 2 }).notNull().default('0'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  uniquePlanDate: unique().on(table.planId, table.date),
}))

export const dailySpendingRelations = relations(dailySpending, ({ one }) => ({
  plan: one(spendingPlans, {
    fields: [dailySpending.planId],
    references: [spendingPlans.id],
  }),
}))
