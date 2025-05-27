document.addEventListener('DOMContentLoaded', () => {
    // Image sets for cycling
    const IMAGE_SETS = [
        ["/src/dageoff_2.png", "/src/dageon_2.png", "/src/dagered.png"],
        ["/src/ergeoff_2.png", "/src/ergeon_2.png", "/src/ergered.png"],
        ["/src/sangeoff.png", "/src/sangeon.png", "/src/sangered.png"],
        ["/src/seigoroff.png", "/src/seigoron.png", "/src/seigorred.png"],
        ["/src/kcOff.png", "/src/kcOn.png", "/src/kcRed.png"],
        ]

    // Initial positions for each image set
    const positions = [
        { x: 100, y: 100},
        { x: 250, y: 100},
        { x: 400, y: 100},
        { x: 550, y: 100},
        { x: 325, y: 250}
    ];

    // Create and insert images
    const images = []
    for (let i = 0; i < IMAGE_SETS.length; i++) {
        const img = document.createElement('img');
        img.id = `image-${i}`;
        img.className = 'sync-image';
        img.style.position = 'absolute';
        img.style.left = positions[i].x + 'px';
        img.style.top = positions[i].y + 'px';
        img.style.width = '120px';
        img.style.height = '120px';
        img.style.cursor = 'pointer';
        img.draggable = false;
        document.body.appendChild(img);
        images.push(img);
    }

    // Drag and click logic
    let dragging = null;
    let dragIndex = null;
    let offsetX = 0;
    let offsetY = 0;
    let wasDragging = false;

    images.forEach((img, i) => {
        img.addEventListener('mousedown', (e) => {
            dragging = img;
            dragIndex = i;
            offsetX = e.clientX = parseInt(img.style.left, 10);
            offsetY = e.clientY - parseInt(img.style.top, 10);
            wasDragging = false;
            img.style.zIndex = Date.now();
        });

        img.addEventListener('click', async (e) => {
            if (!wasDragging) {
                // Cycle to next image in set and sync
                let idx = IMAGE_SETS[i].findIndex(src => img.src.includes(src.split('/').pop()));
                idx = (idx + 1) % IMAGE_SETS[i].length;
                const mewSrc = IMAGE_SETS[i][idx];
                await updateImageOnServer(i, newSrc);
            }
        });
    });

    document.addEventListener('mousemove', (e) => {
        if (dragging && dragIndex !== null) {
            dragging.style.left = (e.clientX - offsetX) + 'px';
            dragging.style.top = (e.clientY - offsetY) + 'px';
            wasDragging = true;
        }
    });

    document.addEventListener('mouseup', () => {
        dragging = null;
        dragIndex = null;
        setTimeout(() => { wasDragging = false; }, 0);
    });

    // --- Real-time updates via SSE ---
    const SSE_ENDPOINT = "/sse";
    const API_ENDPOINT = "/update-image";

    async function updateImageOnServer(imageID, newSrc) {
        try {
            const response = await fetch(API_ENDPOINT, {
                methof: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageID, newSrc }),
            });
            if (!response.ok) {
                const errorData = await response.json();
                console.error('Error to update image:', response.status, errorData);
            }
        } catch (error) {
            console.error('Error updating image on server:', error); 
        }
    }

    function setImageSrc(imageID, src) {
        if (images[imageID]) {
            images[imageID].src = src;
        }
    }

    // Setup SSE connection
    const eventSource = new EventSource(SSE_ENDPOINT);

    eventSource.addEventListener('initial=state', (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data && Array.isArray(data.imageSrcs)) {
                data.imageSrcs.forEach((src, i) => setImageSrc(i, src));
            } else {
                console.error('Invalid initial-state data format:', event.data);
            }
        } catch (e) {
            console.error('Error parsing initial-state event data:', e, event.data);
        }
    });

    eventSource.addEventListener('image-update', (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data && data.imageID !== undefined && data.newSrc) {
                setImageSrc(data.imageID, data.newSrc);
            } else {
                console.error('Invalid image-update data format:', event.data);
            }
        } catch (e) {
            console.error('Error parsing image-update event data:', e, event.data);
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