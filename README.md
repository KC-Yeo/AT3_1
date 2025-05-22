# Deno KV SSE Color Squares Sync

This project demonstrates a web application that uses Deno, Deno KV (Key-Value store), and Server-Sent Events (SSE) to share and synchronize state across multiple client instances in real-time. The application consists of five squares, each of which can be red, green, or blue. When a square is clicked, its color changes, and this change is immediately reflected for all connected users.

## Features

-   Real-time color synchronization across multiple clients.
-   Persistent state storage using Deno KV.
-   Efficient server-to-client communication via Server-Sent Events.
-   Simple and clear API for color updates.

## Technologies Used

-   **Deno:** A modern runtime for JavaScript and TypeScript.
-   **Deno KV:** A distributed key-value database built into Deno, perfect for Deno Deploy.
-   **Server-Sent Events (SSE):** A standard for enabling servers to push data to web clients over a single HTTP connection.
-   **HTML, CSS, JavaScript:** For the frontend user interface.

## How it Works

The application is composed of a frontend (client-side) and a backend (server-side Deno application).

### 1. Frontend (`public/index.html` and `public/script.js`)

-   Displays five clickable squares.
-   When a square is clicked:
    -   The client-side JavaScript calculates the next color in the sequence (red -> green -> blue -> red).
    -   It sends a `POST` request to the `/update-color` backend endpoint with the square's ID and the new color.
-   Establishes an SSE connection to the `/sse` endpoint on the backend.
-   Listens for two types of events from the SSE stream:
    -   `initial-state`: Received upon connection, provides the current colors of all squares.
    -   `color-update`: Received whenever a square's color is changed by any client.
-   Updates the visual representation of the squares based on SSE messages.

### 2. Backend (`main.ts`)

-   **Static File Serving:** Serves `index.html` and `script.js` from the `public/` directory.
-   **Deno KV Integration:**
    -   Uses Deno KV to store the current color for each of the five squares. The state is stored under a predefined key (`["squares_colors"]`) as an array of strings.
    -   Initializes the colors (e.g., all red) if no state exists in Deno KV.
    -   Uses atomic operations (`kv.atomic().check().set().commit()`) when updating colors to ensure data consistency, especially in concurrent environments like Deno Deploy.
-   **Server-Sent Events (SSE) Management (`/sse` endpoint):**
    -   Manages a list of connected SSE clients.
    -   When a new client connects:
        -   The current state of all squares (from Deno KV) is sent as an `initial-state` event.
        -   The client's connection is kept open.
    -   When a client disconnects, it's removed from the active list.
-   **Color Update Logic (`/update-color` endpoint):**
    -   Handles `POST` requests to change a square's color.
    -   Validates the incoming request (JSON payload, square ID, color).
    -   Updates the color for the specified square in Deno KV.
    -   If the KV update is successful, it broadcasts a `color-update` SSE message to all connected clients. This message contains the ID of the square that changed and its new color.

### Data Flow Example (User Clicks a Square):

1.  User A clicks Square #2 (currently red) to change it to green.
2.  Frontend JS sends `POST /update-color` with `{"squareId": 1, "newColor": "green"}`.
3.  Backend receives the request:
    a.  Validates the payload.
    b.  Atomically updates Deno KV: `squares_colors[1] = "green"`.
    c.  Sends an SSE message to all connected clients: `event: color-update\ndata: {"squareId": 1, "newColor": "green"}\n\n`.
4.  All connected clients (User A, User B, etc.) receive the `color-update` SSE message.
5.  Frontend JS on each client updates the display of Square #2 to green.

## API Endpoints

The server exposes the following endpoints:

-   `GET /` or `GET /index.html`
    -   Description: Serves the main HTML page.
    -   Response: `text/html`

-   `GET /script.js`
    -   Description: Serves the client-side JavaScript file.
    -   Response: `application/javascript`

-   `GET /sse`
    -   Description: Establishes a Server-Sent Events connection.
    -   Headers: Client must send `Accept: text/event-stream`.
    -   Response Stream:
        -   `event: initial-state`
          `data: {"colors": ["red", "red", "blue", "green", "red"]}` (example)
        -   `event: color-update`
          `data: {"squareId": 2, "newColor": "blue"}` (example)

-   `POST /update-color`
    -   Description: Updates the color of a specified square.
    -   Request Headers: `Content-Type: application/json`
    -   Request Body (JSON):
        ```json
        {
          "squareId": 0, // (number) Index of the square (0-4)
          "newColor": "green" // (string) New color ("red", "green", or "blue")
        }
        ```
    -   Success Response (`200 OK`):
        ```json
        {
          "success": true,
          "squareId": 0,
          "newColor": "green"
        }
        ```
    -   Error Responses:
        -   `400 Bad Request`: Invalid payload (e.g., missing fields, wrong types, invalid squareId/color).
        -   `415 Unsupported Media Type`: If `Content-Type` is not `application/json`.
        -   `500 Internal Server Error`: If the KV update fails (e.g., due to a concurrent update conflict not resolved by retry, or other server issues).

## Project Structure

```
kc_template/
├── public/
│   ├── index.html     # Main HTML file
│   └── script.js      # Client-side JavaScript
├── main.ts            # Deno server application
├── deno.json          # Deno configuration (tasks, compiler options)
└── README.md          # This file
```

## Getting Started

### Prerequisites

-   [Deno](https://deno.land/#installation) installed on your system.

### Running Locally

1.  Clone or download the project.
2.  Navigate to the `kc_template` directory:
    ```bash
    cd kc_template
    ```
3.  Start the server using the Deno task:
    ```bash
    deno task start
    ```
    This command uses the `deno.json` file to run `main.ts` with the necessary permissions (`--allow-net`, `--allow-read`, `--allow-env`, `--allow-write`, `--unstable-kv`).
4.  Open your web browser and navigate to `http://localhost:8000` (or the port specified if `PORT` env var is set).
5.  Open multiple browser tabs or windows to see the real-time synchronization in action.

## Deno Deploy

This application is designed to work seamlessly with [Deno Deploy](https://deno.com/deploy).
-   Deno KV is natively supported and highly available on Deno Deploy.
-   The `--unstable-kv` flag and local `--allow-write` for KV are not needed for deployment as Deno Deploy manages KV permissions and stability.
-   Simply link your GitHub repository to a Deno Deploy project, and it will deploy `main.ts`.
```