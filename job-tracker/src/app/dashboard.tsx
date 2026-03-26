// src/app/dashboard.tsx
import { getDashboardSummary } from "@/lib/dashboard"

function formatAverageDays(value: number | null) {
  if (value === null) return "—"
  return `${value}d`
}

export default async function Dashboard() {
  const summary = await getDashboardSummary()

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Dashboard</h2>
        <p className="text-sm text-zinc-500">
          Quick snapshot of your job search activity.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Total Applications"
          value={summary.totalApplications}
          subtext="All tracked applications"
        />
        <SummaryCard
          label="Active Applications"
          value={summary.activeApplications}
          subtext="Still in play"
        />
        <SummaryCard
          label="Terminal Applications"
          value={summary.terminalApplications}
          subtext="Closed outcomes"
        />
        <SummaryCard
          label="Avg Completed Duration"
          value={formatAverageDays(summary.averageCompletedDurationDays)}
          subtext="Only records with endedAt"
        />
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold">Count by Status</h3>
            <p className="text-sm text-zinc-500">
              Sorted by highest count first
            </p>
          </div>
          <div className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
            {summary.statusCounts.length} statuses
          </div>
        </div>

        {summary.statusCounts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6 text-sm text-zinc-500">
            No applications yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {summary.statusCounts.map((item) => {
              const maxCount = summary.statusCounts[0]?.count ?? 1
              const percent =
                maxCount > 0 ? Math.max((item.count / maxCount) * 100, 6) : 0

              return (
                <div
                  key={item.status}
                  className="rounded-lg border border-zinc-200 bg-zinc-50/70 p-3"
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="min-w-0 text-sm font-medium text-zinc-800">
                      {item.status}
                    </div>
                    <div className="shrink-0 rounded-md bg-white px-2 py-1 text-sm font-semibold text-zinc-700 border border-zinc-200">
                      {item.count}
                    </div>
                  </div>

                  <div className="h-2 overflow-hidden rounded-full bg-zinc-200">
                    <div
                      className="h-full rounded-full bg-zinc-700 transition-all"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

function SummaryCard({
  label,
  value,
  subtext,
}: {
  label: string
  value: string | number
  subtext: string
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="text-sm font-medium text-zinc-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">
        {value}
      </div>
      <div className="mt-2 text-xs text-zinc-500">{subtext}</div>
    </div>
  )
}