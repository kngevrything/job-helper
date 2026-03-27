// src/app/dashboard.tsx
import { getDashboardSummary } from "@/lib/dashboard"
import { TERMINAL_STATUSES, isTerminalStatus } from "@/lib/status"

function formatAverageDays(value: number | null) {
  if (value === null) return "—"
  return `${value}d`
}

export default async function Dashboard() {
  const summary = await getDashboardSummary()

  const activeStatuses = summary.statusCounts.filter(
    (item) => !isTerminalStatus(item.status)
  )

  const terminalStatuses = summary.statusCounts.filter((item) =>
    isTerminalStatus(item.status)
  )

  const activeRate =
  summary.totalApplications > 0
    ? Math.round(
        (summary.activeApplications / summary.totalApplications) * 100
      )
    : null

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Dashboard</h2>
        <p className="text-sm text-zinc-500">
          Quick snapshot of your job search activity.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
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
        <SummaryCard
          label="Interviewed"
          value={summary.interviewedApplications}
          subtext="Made it past apply stage"
        />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard
          label="This Week"
          value={summary.applicationsThisWeek}
          subtext="Applications created this week"
        />

        <SummaryCard
          label="This Month"
          value={summary.applicationsThisMonth}
          subtext="Applications created this month"
        />

        <SummaryCard
          label="Active Rate"
          value={activeRate !== null ? `${activeRate}%` : "—"}
          subtext="Percent still in play"
        />

        <SummaryCard
          label="Last Applied"
          value={
            summary.newestApplicationDate
              ? new Date(summary.newestApplicationDate).toLocaleDateString()
              : "—"
          }
          subtext="Most recent application"
        />
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm space-y-4">
        <div>
          <h3 className="text-base font-semibold">Status Breakdown</h3>
          <p className="text-sm text-zinc-500">
            Active vs terminal outcomes
          </p>
        </div>

        {/* Active */}
        <div>
          <div className="mb-2 text-sm font-medium text-zinc-600">Active</div>

          {activeStatuses.length === 0 ? (
            <div className="text-sm text-zinc-400">None</div>
          ) : (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
              {activeStatuses.map((item) => {
                const maxCount = summary.statusCounts[0]?.count ?? 1
                const percent =
                  maxCount > 0 ? Math.max((item.count / maxCount) * 100, 6) : 0

                return (
                  <div
                    key={item.status}
                    className="rounded-lg border border-zinc-200 bg-zinc-50/40 p-3"
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
                        className="h-full rounded-full bg-zinc-700"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Terminal */}
        <div>
          <div className="mb-2 text-sm font-medium text-zinc-600">Terminal</div>

          {terminalStatuses.length === 0 ? (
            <div className="text-sm text-zinc-400">None</div>
          ) : (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
              {terminalStatuses.map((item) => {
                const maxCount = summary.statusCounts[0]?.count ?? 1
                const percent =
                  maxCount > 0 ? Math.max((item.count / maxCount) * 100, 6) : 0

                return (
                  <div
                    key={item.status}
                    className="rounded-lg border border-zinc-200 bg-zinc-50/40 px-3 py-2"
                  >
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div className="min-w-0 text-sm text-zinc-600">
                        {item.status}
                      </div>
                      <div className="shrink-0 rounded-md bg-white px-2 py-1 text-sm font-semibold text-zinc-600 border border-zinc-200">
                        {item.count}
                      </div>
                    </div>

                    <div className="h-2 overflow-hidden rounded-full bg-zinc-200">
                      <div
                        className="h-full rounded-full bg-zinc-400"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
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