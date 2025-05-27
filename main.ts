import { serveFile } from "https://deno.land/std@0.224.0/http/file_server.ts";
import * as path from "https://deno.land/std@0.224.0/path/mod.ts";

const NUM_IMAGES = 5;
const DEFAULT_IMAGE_SRCS = [
  "/src/dageoff_2.png",
  "/src/ergeoff.png",
  "/src/sangeoff.png",
  "/src/seigoroff.png",
  "/src/kcOff.png",
];
const KV_IMAGES_KEY = ["images_srcs"];

// --- Deno KV Setup ---
const kv = await Deno.openKv();

async function getImageSrcs(): Promise<string[]> {
  const entry = await kv.get<string[]>(KV_IMAGES_KEY);
  if (entry.value) {
    return entry.value;
  }
  // Initialize if not found
  await kv.set(KV_IMAGES_KEY, DEFAULT_IMAGE_SRCS);
  return [...DEFAULT_IMAGE_SRCS];
}

async function updateImageSrcInKV(
  imageId: number,
  newSrc: string,
): Promise<boolean> {
  if (imageId < 0 || imageId >= NUM_IMAGES) {
    return false;
  }
  const currentSrcs = await getImageSrcs();
  currentSrcs[imageId] = newSrc;
  const res = await kv
    .atomic()
    .check({
      key: KV_IMAGES_KEY,
      versionstamp: (await kv.get(KV_IMAGES_KEY)).versionstamp,
    }) // Optimistic locking
    .set(KV_IMAGES_KEY, currentSrcs)
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

  // Serve static files from ./public
  if (req.method === "GET") {
    if (pathname === "/" || pathname === "/index.html") {
      return serveFile(req, path.join(Deno.cwd(), "public", "index.html"));
    }
    if (pathname === "/script.js") {
      return serveFile(req, path.join(Deno.cwd(), "public", "script.js"));
    }
    try {
      return await serveFile(req, path.join(Deno.cwd(), "public", pathname));
    } catch {
      // fall through to 404
    }
  }

  // SSE Endpoint
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
        getImageSrcs()
          .then((imageSrcs) => {
            const initialStateMsg = formatSSEMessage("initial-state", {
              imageSrcs,
            });
            controller.enqueue(new TextEncoder().encode(initialStateMsg));
          })
          .catch((err) => {
            console.error(`Error sending initial state to ${clientId}:`, err);
            controller.error(err); // Close stream on error
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

  // Update Image Endpoint
  if (req.method === "POST" && pathname === "/update-image") {
    try {
      if (req.headers.get("content-type") !== "application/json") {
        return new Response(
          JSON.stringify({
            error: "Invalid content type, expected application/json",
          }),
          { status: 415, headers: { "Content-Type": "application/json" } },
        );
      }

      const { imageId, newSrc } = await req.json();

      if (typeof imageId !== "number" || typeof newSrc !== "string") {
        return new Response(
          JSON.stringify({
            error:
              "Invalid payload: imageId (number) and newSrc (string) are required.",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      if (imageId < 0 || imageId >= NUM_IMAGES) {
        return new Response(JSON.stringify({ error: "Invalid imageId." }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const success = await updateImageSrcInKV(imageId, newSrc);
      if (!success) {
        // This could happen due to a concurrent update (versionstamp mismatch)
        console.warn(
          `Failed to update KV for image ${imageId} to ${newSrc}, likely due to concurrent modification.`,
        );
        return new Response(
          JSON.stringify({
            error:
              "Failed to update image source, possibly due to a concurrent update. Please try again.",
          }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }

      console.log(`Updated image ${imageId} to ${newSrc}`);

      // Broadcast the update to all SSE clients
      const updateMessage = formatSSEMessage("image-update", {
        imageId,
        newSrc,
      });
      broadcastToSSEClients(updateMessage);

      return new Response(
        JSON.stringify({ success: true, imageId, newSrc }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    } catch (error) {
      console.error("Error processing /update-image:", error);
      return new Response(
        JSON.stringify({ error: "Internal server error processing update." }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  // Not Found
  return new Response("Not Found", { status: 404 });
}

// Initialize and Start Server
async function main() {
  // Ensure initial image sources are set in KV if they don't exist
  await getImageSrcs();
  console.log("Initial image sources ensured in Deno KV.");

  const port = Deno.env.get("PORT") ? parseInt(Deno.env.get("PORT")!) : 8000;
  console.log(`HTTP server running. Access it at: http://localhost:${port}/`);
  Deno.serve({ port }, handler);
}

main().catch((err) => console.error("Server failed to start:", err));