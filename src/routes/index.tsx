import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import {
  spendingPlanQueryOptions,
  dailySpendingQueryOptions,
  updatePlanSettings,
  upsertDailySpending,
} from '@/features/spending'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export const Route = createFileRoute('/')({
  component: SpendingPlanApp,
  head: () => ({
    meta: [{ title: 'Daily Spending Planner' }],
  }),
})

function getMonthOptions() {
  const options: { value: string; label: string }[] = []
  const now = new Date()

  // Generate 12 months: 6 past + current + 5 future
  for (let i = -6; i <= 5; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const year = date.getFullYear()
    const month = date.getMonth()
    options.push({
      value: `${year}-${month}`,
      label: date.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      }),
    })
  }

  return options
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatDateKey(year: number, month: number, day: number) {
  const m = String(month + 1).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  return `${year}-${m}-${d}`
}

function SpendingPlanApp() {
  const queryClient = useQueryClient()
  const now = new Date()

  // Selected month state
  const [selectedMonth, setSelectedMonth] = useState(
    `${now.getFullYear()}-${now.getMonth()}`,
  )

  const [year, month] = selectedMonth.split('-').map(Number)

  // Fetch spending plan
  const planQuery = useQuery(spendingPlanQueryOptions(year, month))
  const plan = planQuery.data

  // Fetch daily spending entries
  const dailyQuery = useQuery({
    ...dailySpendingQueryOptions(plan?.id ?? 0),
    enabled: !!plan?.id,
  })

  // Local input states
  const [totalInput, setTotalInput] = useState('')
  const [savingInput, setSavingInput] = useState('')
  const [spentInputs, setSpentInputs] = useState<Record<string, string>>({})

  // Sync local state with fetched plan
  const displayTotal = totalInput || (plan ? String(plan.totalAmount) : '0')
  const displaySaving = savingInput || (plan ? String(plan.desiredSaving) : '0')

  // Update plan mutation
  const updatePlanMutation = useMutation({
    mutationFn: updatePlanSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['spending-plan', year, month],
      })
    },
  })

  // Update daily spending mutation
  const updateDailyMutation = useMutation({
    mutationFn: upsertDailySpending,
    onSuccess: () => {
      if (plan) {
        queryClient.invalidateQueries({ queryKey: ['daily-spending', plan.id] })
      }
    },
  })

  // Handle plan settings update
  const handleUpdateSettings = useCallback(
    (total: string, saving: string) => {
      if (plan) {
        updatePlanMutation.mutate({
          data: {
            planId: plan.id,
            totalAmount: total || '0',
            desiredSaving: saving || '0',
          },
        })
      }
    },
    [plan, updatePlanMutation],
  )

  // Calculate spending data with rollover
  const spendingData = useMemo(() => {
    const daysCount = getDaysInMonth(year, month)
    const totalAmount = parseFloat(displayTotal) || 0
    const desiredSaving = parseFloat(displaySaving) || 0
    const availableMoney = totalAmount - desiredSaving

    // Build a map of date -> spent amount (prefer local input over query data)
    const spentMap: Record<string, number> = {}
    if (dailyQuery.data) {
      for (const entry of dailyQuery.data) {
        spentMap[entry.date] = parseFloat(String(entry.spent)) || 0
      }
    }
    // Override with local input values
    for (const [dateKey, value] of Object.entries(spentInputs)) {
      spentMap[dateKey] = parseFloat(value) || 0
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const days: {
      date: Date
      dateKey: string
      formattedDate: string
      allowedSpending: number
      spent: number
      isPast: boolean
      isToday: boolean
    }[] = []

    // Calculate rollover: sum up savings/overspending from past days
    let rollover = 0
    let remainingDays = daysCount

    for (let day = 1; day <= daysCount; day++) {
      const date = new Date(year, month, day)
      date.setHours(0, 0, 0, 0)
      const dateKey = formatDateKey(year, month, day)
      const isPast = date < today
      const isToday = date.getTime() === today.getTime()
      const spent = spentMap[dateKey] ?? 0

      // Calculate remaining days from this day forward (including this day)
      const daysFromHere = daysCount - day + 1

      // For past days, calculate rollover
      if (isPast) {
        const baseDailyAllowance = availableMoney / daysCount
        rollover += baseDailyAllowance - spent
        remainingDays--
      }

      // Calculate allowed spending for this day
      let allowedSpending: number
      if (isPast) {
        // Past day: show original allowance
        allowedSpending = availableMoney / daysCount
      } else {
        // Current or future day: redistribute remaining + rollover
        const remainingBudget =
          (availableMoney / daysCount) * (daysCount - day + 1) + rollover
        allowedSpending = remainingBudget / daysFromHere
      }

      days.push({
        date,
        dateKey,
        formattedDate: formatDate(date),
        allowedSpending,
        spent,
        isPast,
        isToday,
      })
    }

    return {
      days,
      totalAmount,
      desiredSaving,
      availableMoney,
      baseDailyAllowance: availableMoney / daysCount,
      rollover,
    }
  }, [year, month, displayTotal, displaySaving, dailyQuery.data, spentInputs])

  // Update local state for spent input
  const handleSpentInputChange = (dateKey: string, value: string) => {
    setSpentInputs((prev) => ({ ...prev, [dateKey]: value }))
  }

  // Save to database on blur
  const handleSpentBlur = (dateKey: string, value: string) => {
    if (plan) {
      const spent = value === '' ? '0' : value
      updateDailyMutation.mutate({
        data: {
          planId: plan.id,
          date: dateKey,
          spent,
        },
      })
    }
  }

  const monthOptions = getMonthOptions()

  // Ref for scrolling to today
  const todayRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to today when data loads
  useEffect(() => {
    if (todayRef.current && scrollContainerRef.current) {
      // Small delay to ensure the layout is ready
      setTimeout(() => {
        todayRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        })
      }, 100)
    }
  }, [selectedMonth, spendingData.days])

  if (planQuery.isLoading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="text-stone-400 font-light tracking-widest animate-pulse">
          Loading...
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-stone-50 text-stone-800 font-sans selection:bg-emerald-100 selection:text-emerald-900 overflow-hidden">
      {/* Fixed Header Section */}
      <div className="shrink-0 px-4 sm:px-6 pt-8 pb-6">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <header className="text-center mb-8 space-y-2">
            <h1 className="text-3xl sm:text-4xl font-light text-stone-800 tracking-tight">
              Spending<span className="font-semibold text-stone-900">Plan</span>
            </h1>
            <p className="text-stone-500 text-xs tracking-wide uppercase font-medium">
              Monthly Budget & Daily Tracker
            </p>
          </header>

          {/* Settings Card */}
          <div className="bg-white rounded-2xl p-6 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] border border-stone-100">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Month Selector */}
              <div className="space-y-2">
                <Label className="text-stone-400 text-xs font-bold uppercase tracking-widest">
                  Month
                </Label>
                <Select
                  value={selectedMonth}
                  onValueChange={(value) => {
                    setSelectedMonth(value)
                    setTotalInput('')
                    setSavingInput('')
                    setSpentInputs({})
                  }}
                >
                  <SelectTrigger className="h-10 bg-stone-50 border-stone-200 text-stone-700 focus:ring-stone-200 focus:border-stone-300 transition-all duration-200 rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-stone-100 shadow-xl rounded-xl">
                    {monthOptions.map((opt) => (
                      <SelectItem
                        key={opt.value}
                        value={opt.value}
                        className="text-stone-600 focus:bg-stone-50 focus:text-stone-900 py-3 cursor-pointer"
                      >
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Total Amount */}
              <div className="space-y-2">
                <Label className="text-stone-400 text-xs font-bold uppercase tracking-widest">
                  Total Income
                </Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={displayTotal === '0' ? '' : displayTotal}
                  onChange={(e) => setTotalInput(e.target.value)}
                  onBlur={(e) =>
                    handleUpdateSettings(e.target.value || '0', displaySaving)
                  }
                  className="h-10 bg-stone-50 border-stone-200 text-stone-700 placeholder:text-stone-300 focus:ring-stone-200 focus:border-stone-300 transition-all duration-200 rounded-lg font-medium"
                />
              </div>

              {/* Desired Saving */}
              <div className="space-y-2">
                <Label className="text-stone-400 text-xs font-bold uppercase tracking-widest">
                  Target Savings
                </Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={displaySaving === '0' ? '' : displaySaving}
                  onChange={(e) => setSavingInput(e.target.value)}
                  onBlur={(e) =>
                    handleUpdateSettings(displayTotal, e.target.value || '0')
                  }
                  className="h-10 bg-stone-50 border-stone-200 text-stone-700 placeholder:text-stone-300 focus:ring-stone-200 focus:border-stone-300 transition-all duration-200 rounded-lg font-medium"
                />
              </div>
            </div>

            {/* Summary Stats */}
            <div className="mt-6 pt-6 border-t border-stone-100 grid grid-cols-4 gap-4">
              <div className="text-center group">
                <div className="text-stone-400 text-[10px] font-bold uppercase tracking-widest mb-1 group-hover:text-stone-500 transition-colors">
                  Available
                </div>
                <div className="text-stone-800 text-lg font-light tracking-tight tabular-nums">
                  {formatCurrency(spendingData.availableMoney)}
                </div>
              </div>
              <div className="text-center group">
                <div className="text-stone-400 text-[10px] font-bold uppercase tracking-widest mb-1 group-hover:text-stone-500 transition-colors">
                  Daily Budget
                </div>
                <div className="text-stone-800 text-lg font-light tracking-tight tabular-nums">
                  {formatCurrency(spendingData.baseDailyAllowance)}
                </div>
              </div>
              <div className="text-center group">
                <div className="text-stone-400 text-[10px] font-bold uppercase tracking-widest mb-1 group-hover:text-stone-500 transition-colors">
                  Rollover
                </div>
                <div
                  className={`text-lg font-light tracking-tight tabular-nums transition-colors ${spendingData.rollover >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}
                >
                  {spendingData.rollover >= 0 ? '+' : ''}
                  {formatCurrency(spendingData.rollover)}
                </div>
              </div>
              <div className="text-center group">
                <div className="text-stone-400 text-[10px] font-bold uppercase tracking-widest mb-1 group-hover:text-stone-500 transition-colors">
                  Days
                </div>
                <div className="text-stone-800 text-lg font-light tracking-tight tabular-nums">
                  {spendingData.days.length}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable Daily List */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-4 sm:px-6 pb-8"
      >
        <div className="max-w-3xl mx-auto space-y-2">
          {spendingData.days.map((day) => (
            <div
              key={day.dateKey}
              ref={day.isToday ? todayRef : null}
              className={`
                group rounded-xl p-4 transition-all duration-300 ease-in-out border
                ${
                  day.isToday
                    ? 'bg-white border-emerald-500/30 shadow-[0_4px_20px_-4px_rgba(16,185,129,0.1)] scale-[1.01]'
                    : day.isPast
                      ? 'bg-stone-50/50 border-transparent opacity-60 hover:opacity-100 hover:bg-white hover:shadow-sm'
                      : 'bg-white border-transparent hover:border-stone-200 hover:shadow-md hover:shadow-stone-200/50'
                }
              `}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex-1">
                  <div
                    className={`flex items-center gap-3 text-sm font-medium ${day.isToday ? 'text-emerald-900' : 'text-stone-600'}`}
                  >
                    <span className="capitalize tracking-wide">
                      {day.formattedDate}
                    </span>
                    {day.isToday && (
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                        Today
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-6 sm:gap-8">
                  {/* Allowed Spending */}
                  <div className="text-right min-w-[80px]">
                    <div className="text-stone-400 text-[10px] font-bold uppercase tracking-widest mb-1">
                      Allowed
                    </div>
                    <div
                      className={`font-light tabular-nums tracking-tight ${
                        day.isToday
                          ? 'text-lg text-emerald-700'
                          : day.isPast
                            ? 'text-stone-400 line-through decoration-stone-300'
                            : 'text-base text-stone-600'
                      }`}
                    >
                      {formatCurrency(day.allowedSpending)}
                    </div>
                  </div>

                  {/* Spent Input */}
                  <div className="w-28">
                    <div className="text-stone-400 text-[10px] font-bold uppercase tracking-widest mb-1 text-right">
                      Spent
                    </div>
                    <Input
                      type="number"
                      placeholder="-"
                      value={
                        spentInputs[day.dateKey] !== undefined
                          ? spentInputs[day.dateKey]
                          : day.spent === 0
                            ? ''
                            : day.spent
                      }
                      onChange={(e) =>
                        handleSpentInputChange(day.dateKey, e.target.value)
                      }
                      onBlur={(e) =>
                        handleSpentBlur(day.dateKey, e.target.value)
                      }
                      className={`
                        h-8 text-right font-medium tabular-nums transition-all duration-200
                        ${
                          day.isPast
                            ? 'bg-stone-100 border-transparent text-stone-500 focus:bg-white focus:border-stone-300'
                            : 'bg-stone-50 border-stone-200 text-stone-800 focus:bg-white focus:border-emerald-500/50 focus:ring-emerald-500/20'
                        }
                      `}
                    />
                  </div>

                  {/* Difference indicator */}
                  <div className="w-20 text-right hidden sm:block">
                    {day.spent > 0 ? (
                      <>
                        <div className="text-stone-400 text-[10px] font-bold uppercase tracking-widest mb-1">
                          Diff
                        </div>
                        <div
                          className={`text-sm font-medium tabular-nums ${
                            day.allowedSpending - day.spent >= 0
                              ? 'text-emerald-600'
                              : 'text-rose-500'
                          }`}
                        >
                          {day.allowedSpending - day.spent >= 0 ? '+' : ''}
                          {formatCurrency(day.allowedSpending - day.spent)}
                        </div>
                      </>
                    ) : (
                      <div className="h-7 w-full"></div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
