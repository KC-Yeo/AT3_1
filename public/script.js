document.addEventListener('DOMContentLoaded', () => {
    // const squaresContainer = document.querySelector('.squares-container');
    const squares = [];
    for (let i = 0; i < 5; i++) {
        const square = document.getElementById(`square-${i}`);
        if (square) {
            squares.push(square);
        } else {
            console.error(`Square with ID square-${i} not found.`);
        }
    }

    const STATUSES= ["in", "out", "waiting"];
    const API_ENDPOINT = "/update-status";
    const SSE_ENDPOINT = "/sse";
    const HOUSES = [ "Seng", "Meng", "Weng", "Fei", "KC" ]

    // Function to update a single square's color
    function updateSquareStatus(squareId, newStatus) {
        const squareElement = document.getElementById (`square-${squareId}`);

        if (squareElement) {
            const imagePath = `/src/${ HOUSES[squareId] }/${ newStatus }.png`;
            squareElement.src = imagePath;
            console.log(`Updated square=${squareId} to ${imagePath}`);
        } else {
            console.error(`Error: Element with ID 'square-${squareId}' not found for update`);
        }
    //     const squareElement = document.getElementById(`/src/${ HOUSES[squareId] }/${ [newStatus].png }`);
    //     if (squareElement) {
    //         squareElement.src = newStatus;
    //     }
    }

    // Attach click listeners to squares
    squares.forEach((square, index) => {
        square.addEventListener('click', async () => {
            const currentStatus = square.src.split('/').pop().split('.')[0];
            const currentIndex = STATUSES.indexOf(currentStatus);

            // if (currentStatus === -1) {
            //     // Fallback for rgb() values - this is a simple check, might need robust parsing
            //     if (currentBgColor.includes('255, 0, 0')) currentColorIndex = STATUS.indexOf('in');
            //     else if (currentBgColor.includes('0, 128, 0')) currentColorIndex = STATUS.indexOf('out'); // 'green' is rgb(0,128,0)
            //     else if (currentBgColor.includes('0, 0, 255')) currentColorIndex = STATUS.indexOf('waiting');
            //     else { // Default to first color if unknown
            //         console.warn(`Unknown current color: ${currentBgColor}, defaulting.`);
            //         currentColorIndex = -1; // To make next color the first one
            //     }
            // }

            const newIndex = (currentIndex + 1) % STATUSES.length;
            const newStatus = STATUSES[newIndex];

            try {
                const response = await fetch(API_ENDPOINT, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ squareId: index, newStatus: newStatus }),
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    console.error('Failed to update status:', response.status, errorData.error);
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
            if (data && Array.isArray(data.status)) {
                console.log('Received initial state:', data.status);
                data.status.forEach((status, i) => {
                    updateSquareStatus(i, status);
                });
            } else {
                 console.error('Invalid initial-state data format:', event.data);
            }
        } catch (e) {
            console.error('Error parsing initial-state event data:', e, event.data);
        }
    });

    eventSource.addEventListener('update-status', (event) => {
        try {
            const data = JSON.parse(event.data);
             if (data && typeof data.squareId === 'number' && typeof data.newStatus === 'string') {
                console.log('Received status update:', data);
                updateSquareStatus(data.squareId, data.newStatus);
            } else {
                console.error('Invalid update-status data format:', event.data);
            }
        } catch (e) {
            console.error('Error parsing update-status event data:', e, event.data);
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