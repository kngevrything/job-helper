// src/lib/dashboard.ts
import { connectToDatabase } from "./db/mongoose"
import { JobApplication } from "@/models/JobApplication"
import { TERMINAL_STATUSES, isTerminalStatus } from "@/lib/status"

export type DashboardSummary = {
  totalApplications: number
  activeApplications: number
  terminalApplications: number
  averageCompletedDurationDays: number | null
  applicationsThisWeek: number
  applicationsThisMonth: number
  newestApplicationDate: Date | null
  interviewedApplications: number
  statusCounts: {
    status: string
    count: number
  }[]
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
    await connectToDatabase()

    const now = new Date()

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const dayOfWeek = now.getDay()
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1

    const startOfWeek = new Date(now)
    startOfWeek.setHours(0, 0, 0, 0)
    startOfWeek.setDate(now.getDate() - daysFromMonday)

    const [totalsResult, statusCountsResult, avgDurationResult,recentStatsResult] = await Promise.all([
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
                interviewedApplications: {
                    $sum: {
                        $cond: [
                            {
                                $or: [
                                { $regexMatch: { input: "$status", regex: /Round/i } },
                                {
                                    $and: [
                                        { $regexMatch: { input: "$status", regex: /Interview/i } },
                                        { $not: [{ $regexMatch: { input: "$status", regex: /No Interview/i } }] },
                                    ],
                                },
                                { $regexMatch: { input: "$status", regex: /Offer/i } },
                                ],
                            },
                            1,
                            0,
                        ],
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
        JobApplication.aggregate([
        {
            $group: {
            _id: null,
            applicationsThisWeek: {
                $sum: {
                $cond: [{ $gte: ["$createdAt", startOfWeek] }, 1, 0],
                },
            },
            applicationsThisMonth: {
                $sum: {
                $cond: [{ $gte: ["$createdAt", startOfMonth] }, 1, 0],
                },
            },
            newestApplicationDate: { $max: "$createdAt" },
            },
        },
        ]),
        
    ])

    const totals = totalsResult[0] ?? {
        totalApplications: 0,
        terminalApplications: 0,
        activeApplications: 0,
        interviewedApplications: 0,
    }

    const avgDuration = avgDurationResult[0]?.averageCompletedDurationDays
    const recentStats = recentStatsResult[0] ?? {
            applicationsThisWeek: 0,
            applicationsThisMonth: 0,
            newestApplicationDate: null,
        }

    return {
        totalApplications: totals.totalApplications,
        activeApplications: totals.activeApplications,
        terminalApplications: totals.terminalApplications,
        averageCompletedDurationDays:
        typeof avgDuration === "number" ? Math.round(avgDuration) : null,
        statusCounts: statusCountsResult,
        applicationsThisWeek: recentStats.applicationsThisWeek,
        applicationsThisMonth: recentStats.applicationsThisMonth,
        newestApplicationDate: recentStats.newestApplicationDate,
        interviewedApplications: totals.interviewedApplications,
    }
}