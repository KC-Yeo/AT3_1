import { serveFile } from "https://deno.land/std@0.224.0/http/file_server.ts";
import * as path from "https://deno.land/std@0.224.0/path/mod.ts";

const NUM_SQUARES = 5;
const DEFAULT_STATUS = "out";
const KV_SQUARES_KEY = ["squares_status"];

// --- Deno KV Setup ---
const kv = await Deno.openKv();

async function getSquareStatus(): Promise<string[]> {
  const entry = await kv.get<string[]>(KV_SQUARES_KEY);
  if (entry.value) {
    return entry.value;
  }
  // Initialize if not found
  const initialColors = Array(NUM_SQUARES).fill(DEFAULT_STATUS);
  await kv.set(KV_SQUARES_KEY, initialColors);
  return initialColors;
}

async function updateSquareStatusInKV(
  squareId: number,
  newStatus: string,
): Promise<boolean> {
  if (squareId < 0 || squareId >= NUM_SQUARES) {
    return false;
  }
  const currentStatus = await getSquareStatus();
  currentStatus[squareId] = newStatus;
  const res = await kv
    .atomic()
    .check({
      key: KV_SQUARES_KEY,
      versionstamp: (await kv.get(KV_SQUARES_KEY)).versionstamp,
    }) // Optimistic locking
    .set(KV_SQUARES_KEY, currentStatus)
    .commit();
  return res.ok;
}

// --- SSE Management ---
interface SSEClient {
  controller: ReadableStreamDefaultController<Uint8Array>;
  id: string;
}
const sseClients = new Map<string, SSEClient>();

function broadcastToSSEClients(message: string) {
  for (const client of sseClients.values()) {
    try {
      client.controller.enqueue(new TextEncoder().encode(message));
    } catch (e) {
      console.error(`Error sending to client ${client.id}:`, e);
      // Client might have disconnected abruptly. The `cancel` in ReadableStream should handle removal.
    }
  }
}

function formatSSEMessage(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// --- Request Handler ---
async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname;

  console.log(`[Request] ${req.method} ${pathname}`);

  // 2. SSE Endpoint
  if (req.method === "GET" && pathname === "/sse") {
    if (req.headers.get("accept") !== "text/event-stream") {
      return new Response("Expected Accept: text/event-stream", {
        status: 400,
      });
    }

    const clientId = crypto.randomUUID();
    const body = new ReadableStream({
      start(controller) {
        sseClients.set(clientId, { controller, id: clientId });
        console.log(`SSE client connected: ${clientId}`);

        // Send initial state
        getSquareStatus()
          .then((status) => {
            const initialStateMsg = formatSSEMessage("initial-state", {
              status,
            });
            controller.enqueue(new TextEncoder().encode(initialStateMsg));
          })
          .catch((err) => {
            console.error(`Error sending initial state to ${clientId}:`, err);
            controller.error(err); // Close the stream on error
          });
      },
      cancel() {
        sseClients.delete(clientId);
        console.log(`SSE client disconnected: ${clientId}`);
      },
    });

    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });

  }

  // 3. Update Color Endpoint
  if (req.method === "POST" && pathname === "/update-status") {
    try {
      if (req.headers.get("content-type") !== "application/json") {
         console.log("--> Entered POST /update-status handler.");
        return new Response(
          JSON.stringify({
            error: "Invalid content type, expected application/json",
          }),
          { status: 415, headers: { "Content-Type": "application/json" } },
        );
      }

      const { squareId, newStatus } = await req.json();

      if (typeof squareId !== "number" || typeof newStatus !== "string") {
        return new Response(
          JSON.stringify({
            error:
              "Invalid payload: squareId (number) and newStatus (string) are required.",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      if (squareId < 0 || squareId >= NUM_SQUARES) {
        return new Response(JSON.stringify({ error: "Invalid squareId." }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      // Basic color validation (can be more robust)
      if (!["out", "in", "waiting"].includes(newStatus)) {
        return new Response(JSON.stringify({ error: "Invalid status." }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const success = await updateSquareStatusInKV(squareId, newStatus);
      if (!success) {
        // This could happen due to a concurrent update (versionstamp mismatch)
        console.warn(
          `Failed to update KV for square ${squareId} to ${newStatus}, likely due to concurrent modification.`,
        );
        return new Response(
          JSON.stringify({
            error:
              "Failed to update color, possibly due to a concurrent update. Please try again.",
          }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }

      console.log(`Updated square ${squareId} to ${newStatus}`);

      // Broadcast the update to all SSE clients
      const updateMessage = formatSSEMessage("update-status", {
        squareId,
        newStatus,
      });
      broadcastToSSEClients(updateMessage);

      return new Response(
        JSON.stringify({ success: true, squareId, newStatus }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    } catch (error) {
      console.error("Error processing /update-status:", error);
      return new Response(
        JSON.stringify({ error: "Internal server error processing update." }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  // 1. Serve static files from ./public
  if (req.method === "GET") {
    let filePath: string;

    if (pathname === "/" || pathname === "/index.html") {
      filePath = path.join(Deno.cwd(), "public", "index.html");
      console.log(`Attempting to serve indexedDB.html from ${filePath}`);
    } else {
      filePath = path.join(Deno.cwd(), "public", pathname);
      console.log(`Attempting to serve static file from: ${filePath}`);
    }

    try {
      const fileInfo = await Deno.stat(filePath);
      if (fileInfo.isFile) {
        console.log(`File found, serving: ${filePath}`);
        return serveFile(req, filePath);
      } else {
        console.log(`Path exists but is is not a file (it's a directory): ${filePath}`);
      }
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        console.log(`File NOT FOUND at: ${filePath}`);
      } else {
        console.error(`Error serving file ${filePath}:`, error);
        return new Response("Internal Server Error", { status: 500 });
      }
    }
    // if (pathname === "/" || pathname === "/index.html") {
    //   return serveFile(req, path.join(Deno.cwd(), "public", "index.html"));
    // }
    // if (pathname === "/script.js") {
    //   return serveFile(req, path.join(Deno.cwd(), "public", "script.js"));
    // }
    // if (pathname.startsWith("/src/")) {
    //   const filePath = path.join(Deno.cwd(), "public", pathname);
    // }
  }

  // 4. Not Found
  return new Response("Not Found", { status: 404 });
}

// --- Initialize and Start Server ---
async function main() {
  // Ensure initial colors are set in KV if they don't exist
  await getSquareStatus();
  console.log("Initial square colors ensured in Deno KV.");

  const port = Deno.env.get("PORT") ? parseInt(Deno.env.get("PORT")!) : 8000;
  console.log(`HTTP server running. Access it at: http://localhost:${port}/`);
  Deno.serve({ port }, handler);
}

main().catch((err) => console.error("Server failed to start:", err));