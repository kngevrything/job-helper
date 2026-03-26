// src/app/page.tsx
import Dashboard from "./dashboard"
import MainClient from "./MainClient"

export default function Page() {
  return (
    <main className="p-4 space-y-6">
      <MainClient />
      <Dashboard />
    </main>
  )
}