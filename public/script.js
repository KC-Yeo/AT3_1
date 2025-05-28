document.addEventListener('DOMContentLoaded', () => {
    const squaresContainer = document.querySelector('.squares-container');
    const squares = [];
    for (let i = 0; i < 5; i++) {
        const square = document.getElementById(`square-${i}`);
        if (square) {
            squares.push(square);
        } else {
            console.error(`Square with ID square-${i} not found.`);
        }
    }

    const COLORS = ["red", "green", "blue"];
    const API_ENDPOINT = "/update-color";
    const SSE_ENDPOINT = "/sse";

    // Function to update a single square's color
    function updateSquareColor(squareId, newColor) {
        const squareElement = document.getElementById(`square-${squareId}`);
        if (squareElement) {
            squareElement.style.backgroundColor = newColor;
        }
    }

    // Attach click listeners to squares
    squares.forEach((square, index) => {
        square.addEventListener('click', async () => {
            const currentBgColor = square.style.backgroundColor;
            // Normalize color name if it comes as rgb()
            let currentColorIndex = COLORS.indexOf(currentBgColor);

            if (currentColorIndex === -1) {
                // Fallback for rgb() values - this is a simple check, might need robust parsing
                if (currentBgColor.includes('255, 0, 0')) currentColorIndex = COLORS.indexOf('red');
                else if (currentBgColor.includes('0, 128, 0')) currentColorIndex = COLORS.indexOf('green'); // 'green' is rgb(0,128,0)
                else if (currentBgColor.includes('0, 0, 255')) currentColorIndex = COLORS.indexOf('blue');
                else { // Default to first color if unknown
                    console.warn(`Unknown current color: ${currentBgColor}, defaulting.`);
                    currentColorIndex = -1; // To make next color the first one
                }
            }

            const nextColorIndex = (currentColorIndex + 1) % COLORS.length;
            const newColor = COLORS[nextColorIndex];

            try {
                const response = await fetch(API_ENDPOINT, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ squareId: index, newColor: newColor }),
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    console.error('Failed to update color:', response.status, errorData.error);
                    // Optionally revert optimistic update or show error to user
                }
                // Color update will be handled by SSE event
            } catch (error) {
                console.error('Error sending update request:', error);
            }
        });
    });

    // Setup SSE connection
    const eventSource = new EventSource(SSE_ENDPOINT);

    eventSource.addEventListener('initial-state', (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data && Array.isArray(data.colors)) {
                console.log('Received initial state:', data.colors);
                data.colors.forEach((color, i) => {
                    updateSquareColor(i, color);
                });
            } else {
                 console.error('Invalid initial-state data format:', event.data);
            }
        } catch (e) {
            console.error('Error parsing initial-state event data:', e, event.data);
        }
    });

    eventSource.addEventListener('color-update', (event) => {
        try {
            const data = JSON.parse(event.data);
             if (data && typeof data.squareId === 'number' && typeof data.newColor === 'string') {
                console.log('Received color update:', data);
                updateSquareColor(data.squareId, data.newColor);
            } else {
                console.error('Invalid color-update data format:', event.data);
            }
        } catch (e) {
            console.error('Error parsing color-update event data:', e, event.data);
        }
    });

    eventSource.onopen = () => {
        console.log('SSE connection established.');
    };

    eventSource.onerror = (err) => {
        console.error('SSE Error:', err);
        // The browser will automatically try to reconnect.
        // You might want to update UI to indicate a connection issue.
    };

    // For debugging: log all messages
    // eventSource.onmessage = (event) => {
    //     console.log("Generic SSE message:", event.type, event.data);
    // };
});