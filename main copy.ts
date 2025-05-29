import { serveFile } from "https://deno.land/std@0.224.0/http/file_server.ts";
import * as path from "https://deno.land/std@0.224.0/path/mod.ts";

const NUM_IMAGES = 5;
const DEFAULT_IMAGES = [
  "/public/src/dageoff_2.png", 
  "/public/src/ergeoff_3.png", 
  "/public/src/sangeoff.png", 
  "/public/src/seigoroff.png", 
  "/public/src/kcOff.png",
];
const KV_IMAGES_KEY = ["images_list"];

// --- Deno KV Setup ---
const kv = await Deno.openKv();

async function getImageId(): Promise<string[]> {
  const entry = await kv.get<string[]>(KV_IMAGES_KEY);
  if (entry.value) {
    return entry.value;
  }
  await kv.set(KV_IMAGES_KEY, [...DEFAULT_IMAGES]);
  return [...DEFAULT_IMAGES];
}

async function updateImagesInKV(
  imageId: number,
  newSrc: string,
): Promise<boolean> {
  if (imageId < 0 || imageId >= NUM_IMAGES) {
    return false;
  }
  const currentImages = await getImageId();
  currentImages[imageId] = newSrc;
  const res = await kv
    .atomic()
    .check({
      key: KV_IMAGES_KEY,
      versionstamp: (await kv.get(KV_IMAGES_KEY)).versionstamp,
    })
    .set(KV_IMAGES_KEY, currentImages)
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

  // 1. Serve static files from ./public (for any GET request)
  if (req.method === "GET") {
    try {
      return await serveFile(req, path.join(Deno.cwd(), "public", pathname));
    } catch {
      // If file not found, fall through to API endpoints and 404
    }
  }

  // 2. SSE Endpoint
  if (req.method === "GET" && pathname === "/sse") {
    const clientId = crypto.randomUUID();
    const body = new ReadableStream({
      start(controller) {
        sseClients.set(clientId, { controller, id: clientId });
        console.log(`SSE client connected: ${clientId}`);

        // Send initial state
        getImageId()
          .then((imageSrcs) => {
            const initialStateMsg = formatSSEMessage("initial-state", {
              imageSrcs,
            });
            controller.enqueue(new TextEncoder().encode(initialStateMsg));
          })
          .catch((err) => {
            console.error(`Error sending initial state to ${clientId}:`, err);
            controller.error(err);
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

  // 3. Update Image Endpoint
  if (req.method === "POST" && pathname === "/update-images") {
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
      if (!DEFAULT_IMAGES.includes(newSrc)) {
        return new Response(JSON.stringify({ error: "Invalid image." }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const success = await updateImagesInKV(imageId, newSrc);
      if (!success) {
        console.warn(
          `Failed to update KV for image ${imageId} to ${newSrc}, likely due to concurrent modification.`,
        );
        return new Response(
          JSON.stringify({
            error:
              "Failed to update image, possibly due to a concurrent update. Please try again.",
          }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }

      console.log(`Updated image ${imageId} to ${newSrc}`);

      // Broadcast the update to all SSE clients
      const updateMessage = formatSSEMessage("update-images", {
        imageId,
        newSrc,
      });
      broadcastToSSEClients(updateMessage);

      return new Response(
        JSON.stringify({ success: true, imageId, newSrc }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    } catch (error) {
      console.error("Error processing /update-images:", error);
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
  // Ensure initial images are set in KV if they don't exist
  await getImageId();
  console.log("Initial images ensured in Deno KV.");

  const port = Deno.env.get("PORT") ? parseInt(Deno.env.get("PORT")!) : 8000;
  console.log(`HTTP server running. Access it at: http://localhost:${port}/`);
  Deno.serve({ port }, handler);
}

main().catch((err) => console.error("Server failed to start:", err));