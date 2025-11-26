import { createServerFn } from '@tanstack/react-start'
import { db } from '@/db'
import { spendingPlans, dailySpending } from '@/db/schema'
import { queryOptions } from '@tanstack/react-query'
import { eq, and } from 'drizzle-orm'

// Get or create a spending plan for a specific month
export const getOrCreatePlan = createServerFn({ method: 'POST' })
  .inputValidator((data: { year: number; month: number }) => data)
  .handler(async (ctx) => {
    const { year, month } = ctx.data

    // Try to find existing plan
    let plan = await db.query.spendingPlans.findFirst({
      where: and(eq(spendingPlans.year, year), eq(spendingPlans.month, month)),
    })

    // Create if doesn't exist
    if (!plan) {
      const [newPlan] = await db
        .insert(spendingPlans)
        .values({
          year,
          month,
          totalAmount: '0',
          desiredSaving: '0',
        })
        .returning()
      plan = newPlan
    }

    return plan
  })

// Update plan settings
export const updatePlanSettings = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { planId: number; totalAmount: string; desiredSaving: string }) =>
      data,
  )
  .handler(async (ctx) => {
    const { planId, totalAmount, desiredSaving } = ctx.data

    const [updatedPlan] = await db
      .update(spendingPlans)
      .set({
        totalAmount,
        desiredSaving,
        updatedAt: new Date(),
      })
      .where(eq(spendingPlans.id, planId))
      .returning()

    return updatedPlan
  })

// Get daily spending entries for a plan
export const getDailySpending = createServerFn({ method: 'POST' })
  .inputValidator((data: { planId: number }) => data)
  .handler(async (ctx) => {
    return await db.query.dailySpending.findMany({
      where: eq(dailySpending.planId, ctx.data.planId),
    })
  })

// Update or create daily spending entry
export const upsertDailySpending = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { planId: number; date: string; spent: string }) => data,
  )
  .handler(async (ctx) => {
    const { planId, date, spent } = ctx.data

    // Check if entry exists
    const existing = await db.query.dailySpending.findFirst({
      where: and(
        eq(dailySpending.planId, planId),
        eq(dailySpending.date, date),
      ),
    })

    if (existing) {
      const [updated] = await db
        .update(dailySpending)
        .set({
          spent,
          updatedAt: new Date(),
        })
        .where(eq(dailySpending.id, existing.id))
        .returning()
      return updated
    } else {
      const [created] = await db
        .insert(dailySpending)
        .values({
          planId,
          date,
          spent,
        })
        .returning()
      return created
    }
  })

// Query options for spending plan
export const spendingPlanQueryOptions = (year: number, month: number) =>
  queryOptions({
    queryKey: ['spending-plan', year, month],
    queryFn: () => getOrCreatePlan({ data: { year, month } }),
  })

// Query options for daily spending
export const dailySpendingQueryOptions = (planId: number) =>
  queryOptions({
    queryKey: ['daily-spending', planId],
    queryFn: () => getDailySpending({ data: { planId } }),
    enabled: planId > 0,
  })
