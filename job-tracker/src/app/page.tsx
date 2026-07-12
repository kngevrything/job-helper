// src/app/page.tsx
import Dashboard from "./dashboard"
import MainClient from "./MainClient"

// This page always needs a live DB connection (dashboard summary is
// computed per request), so there's nothing useful to prerender at
// build time. Without this, `next build` tries to statically render
// "/" and fails if MongoDB isn't reachable during the build.
export const dynamic = "force-dynamic"

export default function Page() {
  return (
    <main className="p-4 space-y-6">
      <MainClient />
      <Dashboard />
    </main>
  )
}