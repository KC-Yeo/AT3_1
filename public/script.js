document.addEventListener('DOMContentLoaded', () => {
    // array for houses to be stored
    const squares = [];

    // for loop to loop through the array
    for (let i = 0; i < 5; i++) {

        // template literal for square ids
        const square = document.getElementById(`square-${i}`);
        if (square) {
            squares.push(square);
        } else {

            // print error in console if square id not found
            console.error(`Square with ID square-${i} not found.`);
        }
    }

    // for houses and their status: "in", "out", "waiting"
    // to call them from folder easily
    const STATUSES= ["in", "out", "waiting"];

    // network request
    const API_ENDPOINT = "/update-status";
    const SSE_ENDPOINT = "/sse";

    // subfolder that hols the images' status in these names separately
    const HOUSES = [ "Seng", "Meng", "Weng", "Fei", "KC" ]

    // Function to update a house's status
    function updateSquareStatus(squareId, newStatus) {
        const squareElement = document.getElementById (`square-${squareId}`);

        if (squareElement) {

            // template literal to call for images in the 'HOUSES' function and which status 
            const imagePath = `/src/${ HOUSES[squareId] }/${ newStatus }.png`;

            // to get the images
            squareElement.src = imagePath;
            console.log(`Updated square=${squareId} to ${imagePath}`);
        } else {
            console.error(`Error: Element with ID 'square-${squareId}' not found for update`);
        }
    }

    // Attach click listeners to images
    squares.forEach((square, index) => {
        square.addEventListener('click', () => {

            // to split the pathway to change it to string format :o, then index number is the image
            const currentStatus = square.src.split('/').pop().split('.')[0];

            // to get the index
            const currentIndex = STATUSES.indexOf(currentStatus);

            // to loop through index and re-loop to index 0
            const newIndex = (currentIndex + 1) % STATUSES.length;
            const newStatus = STATUSES[newIndex];

            // calling the network connection
            fetch(API_ENDPOINT, {

                // specify http method
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },

                // attach requested body with squareId and newStatus
                body: JSON.stringify({ squareId: index, newStatus }),

                // to handle the respinse when received
            }).then(async response => {
                
                // to check if the HTTP response status is succesfully 
                if (!response.ok) {
                    const errorData = await response.json();
                    console.error('Failed to update status:', response.status, errorData.error);
                }

            // to catch if there's any other error
            }).catch(error => {
                console.error('Error sending update request:', error);
            });
        });
    });

    // establish sse conection
    const eventSource = new EventSource(SSE_ENDPOINT);

    // call for initial state
    eventSource.addEventListener('initial-state', (event) => {
        try {

            // send information with JSON
            const data = JSON.parse(event.data);

            // validate data format to inital state array
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

    // for any real-time updates from users
    eventSource.addEventListener('update-status', (event) => {
        try {
            const data = JSON.parse(event.data);

            // validate different type of data for specific update
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
    };
});