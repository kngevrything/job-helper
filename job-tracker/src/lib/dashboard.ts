// src/lib/dashboard.ts
import { connectToDatabase } from "./db/mongoose"
import { JobApplication } from "@/models/JobApplication"

const TERMINAL_STATUSES = [
  "Rejected, No Interview",
  "Closed, No Interview",
  "1st Round Exit",
  "2nd Round Exit",
  "3rd Round Exit",
  "Final Round Exit",
  "No Response, Job Closed",
  "Ghosted",
  "Disappeared",
  "Made 2nd, Declined to Proceed",
] as const

export type DashboardSummary = {
  totalApplications: number
  activeApplications: number
  terminalApplications: number
  averageCompletedDurationDays: number | null
  statusCounts: {
    status: string
    count: number
  }[]
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  await connectToDatabase()

  const [totalsResult, statusCountsResult, avgDurationResult] = await Promise.all([
    JobApplication.aggregate([
      {
        $group: {
          _id: null,
          totalApplications: { $sum: 1 },
          terminalApplications: {
            $sum: {
              $cond: [{ $in: ["$status", TERMINAL_STATUSES] }, 1, 0],
            },
          },
          activeApplications: {
            $sum: {
              $cond: [{ $in: ["$status", TERMINAL_STATUSES] }, 0, 1],
            },
          },
        },
      },
    ]),
    JobApplication.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          status: "$_id",
          count: 1,
        },
      },
      {
        $sort: {
          count: -1,
          status: 1,
        },
      },
    ]),
    JobApplication.aggregate([
      {
        $match: {
          createdAt: { $ne: null },
          endedAt: { $ne: null },
        },
      },
      {
        $project: {
          durationDays: {
            $divide: [
              { $subtract: ["$endedAt", "$createdAt"] },
              1000 * 60 * 60 * 24,
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          averageCompletedDurationDays: { $avg: "$durationDays" },
        },
      },
    ]),
  ])

  const totals = totalsResult[0] ?? {
    totalApplications: 0,
    terminalApplications: 0,
    activeApplications: 0,
  }

  const avgDuration = avgDurationResult[0]?.averageCompletedDurationDays

  return {
    totalApplications: totals.totalApplications,
    activeApplications: totals.activeApplications,
    terminalApplications: totals.terminalApplications,
    averageCompletedDurationDays:
      typeof avgDuration === "number" ? Math.round(avgDuration) : null,
    statusCounts: statusCountsResult,
  }
}