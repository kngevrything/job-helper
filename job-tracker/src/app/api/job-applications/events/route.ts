import { applicationEvents } from "@/lib/events";

// Long-lived stream, not a normal cacheable response -- keep it out of
// static optimization.
export const dynamic = "force-dynamic";

// Server-Sent Events endpoint. POST /api/job-applications emits "changed"
// on applicationEvents after a successful create (including writes from
// the Chrome extension); every open tab's connection here forwards that
// as an SSE message so MainClient can do a silent background refresh
// instead of polling.
export async function GET() {
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval>;
  let onChanged: () => void;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${event}\n\n`));
        } catch {
          // Connection already closed; cancel() below handles cleanup.
        }
      };

      onChanged = () => send("changed");
      applicationEvents.on("changed", onChanged);

      // Keeps the connection alive through idle timeouts.
      heartbeat = setInterval(() => send("ping"), 25000);

      send("connected");
    },
    cancel() {
      clearInterval(heartbeat);
      applicationEvents.off("changed", onChanged);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
