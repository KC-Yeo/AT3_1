import { serveFile } from "https://deno.land/std@0.224.0/http/file_server.ts";
import * as path from "https://deno.land/std@0.224.0/path/mod.ts";

const NUM_SQUARES = 5;
const DEFAULT_COLOR = "red";
const KV_SQUARES_KEY = ["squares_colors"];

// --- Deno KV Setup ---
const kv = await Deno.openKv();

async function getSquareColors(): Promise<string[]> {
  const entry = await kv.get<string[]>(KV_SQUARES_KEY);
  if (entry.value) {
    return entry.value;
  }
  // Initialize if not found
  const initialColors = Array(NUM_SQUARES).fill(DEFAULT_COLOR);
  await kv.set(KV_SQUARES_KEY, initialColors);
  return initialColors;
}

async function updateSquareColorInKV(
  squareId: number,
  newColor: string,
): Promise<boolean> {
  if (squareId < 0 || squareId >= NUM_SQUARES) {
    return false;
  }
  const currentColors = await getSquareColors();
  currentColors[squareId] = newColor;
  const res = await kv
    .atomic()
    .check({
      key: KV_SQUARES_KEY,
      versionstamp: (await kv.get(KV_SQUARES_KEY)).versionstamp,
    }) // Optimistic locking
    .set(KV_SQUARES_KEY, currentColors)
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

  // 1. Serve static files from ./public
  if (req.method === "GET") {
    if (pathname === "/" || pathname === "/index.html") {
      return serveFile(req, path.join(Deno.cwd(), "public", "index.html"));
    }
    if (pathname === "/script.js") {
      return serveFile(req, path.join(Deno.cwd(), "public", "script.js"));
    }
  }

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
        getSquareColors()
          .then((colors) => {
            const initialStateMsg = formatSSEMessage("initial-state", {
              colors,
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
  if (req.method === "POST" && pathname === "/update-color") {
    try {
      if (req.headers.get("content-type") !== "application/json") {
        return new Response(
          JSON.stringify({
            error: "Invalid content type, expected application/json",
          }),
          { status: 415, headers: { "Content-Type": "application/json" } },
        );
      }

      const { squareId, newColor } = await req.json();

      if (typeof squareId !== "number" || typeof newColor !== "string") {
        return new Response(
          JSON.stringify({
            error:
              "Invalid payload: squareId (number) and newColor (string) are required.",
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
      if (!["red", "green", "blue"].includes(newColor)) {
        return new Response(JSON.stringify({ error: "Invalid color." }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const success = await updateSquareColorInKV(squareId, newColor);
      if (!success) {
        // This could happen due to a concurrent update (versionstamp mismatch)
        console.warn(
          `Failed to update KV for square ${squareId} to ${newColor}, likely due to concurrent modification.`,
        );
        return new Response(
          JSON.stringify({
            error:
              "Failed to update color, possibly due to a concurrent update. Please try again.",
          }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }

      console.log(`Updated square ${squareId} to ${newColor}`);

      // Broadcast the update to all SSE clients
      const updateMessage = formatSSEMessage("color-update", {
        squareId,
        newColor,
      });
      broadcastToSSEClients(updateMessage);

      return new Response(
        JSON.stringify({ success: true, squareId, newColor }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    } catch (error) {
      console.error("Error processing /update-color:", error);
      return new Response(
        JSON.stringify({ error: "Internal server error processing update." }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  // 4. Not Found
  return new Response("Not Found", { status: 404 });
}

// --- Initialize and Start Server ---
async function main() {
  // Ensure initial colors are set in KV if they don't exist
  await getSquareColors();
  console.log("Initial square colors ensured in Deno KV.");

  const port = Deno.env.get("PORT") ? parseInt(Deno.env.get("PORT")!) : 8000;
  console.log(`HTTP server running. Access it at: http://localhost:${port}/`);
  Deno.serve({ port }, handler);
}

main().catch((err) => console.error("Server failed to start:", err));