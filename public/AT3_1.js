document.addEventListener('DOMContentLoaded', () => {
  const IMAGE_SRC = [
    ["/src/dageoff_2.png", "/src/dageon_2.png", "/src/dagered.png"],
    ["/src/ergeoff_2.png", "/src/ergeon_2.png", "/src/ergered.png"],
    ["/src/sangeoff.png", "/src/sangeon.png", "/src/sangered.png"],
    ["/src/seigoroff.png", "/src/seigoron.png", "/src/seigorred.png"],
    ["/src/kcOff.png", "/src/kcOn.png", "/src/kcRed.png"]
  ];

  const positions = [
    { x: 100, y: 100 },
    { x: 250, y: 100 },
    { x: 400, y: 100 },
    { x: 550, y: 100 },
    { x: 325, y: 250 }
  ];

  const API_ENDPOINT = "/update-images";
  const SSE_ENDPOINT = "/sse";
  const images = [];

  // Create and insert images
  for (let i = 0; i < IMAGE_SRC.length; i++) {
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
    img.src = IMAGE_SRC[i][0];
    document.body.appendChild(img);
    images.push(img);
  }

  // Drag and click logic
  let dragging = null;
  let dragIndex = null;
  let offsetX = 0;
  let offsetY = 0;
  let wasDragging = false;

  images.forEach((image, i) => {
    image.addEventListener('mousedown', (e) => {
      dragging = image;
      dragIndex = i;
      offsetX = e.clientX - parseInt(image.style.left, 10);
      offsetY = e.clientY - parseInt(image.style.top, 10);
      wasDragging = false;
      image.style.zIndex = Date.now();
    });

    image.addEventListener('click', async (e) => {
      if (!wasDragging) {
        // Cycle to next image in set and sync
        let idx = IMAGE_SRC[i].findIndex(src => image.src.includes(src.split('/').pop()));
        idx = (idx + 1) % IMAGE_SRC[i].length;
        const newSrc = IMAGE_SRC[i][idx];
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

  async function updateImageOnServer(imageId, newSrc) {
    try {
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageId, newSrc }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Failed to update image:', response.status, errorData.error);
      }
    } catch (error) {
      console.error('Error sending update request:', error);
    }
  }

  function setImageSrc(imageId, src) {
    if (images[imageId]) {
      images[imageId].src = src;
    }
  }

  // --- SSE setup ---
  const eventSource = new EventSource(SSE_ENDPOINT);

  eventSource.addEventListener('initial-state', (event) => {
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

  eventSource.addEventListener('update-images', (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data && typeof data.imageId === 'number' && typeof data.newSrc === 'string') {
        setImageSrc(data.imageId, data.newSrc);
      } else {
        console.error('Invalid update-images data format:', event.data);
      }
    } catch (e) {
      console.error('Error parsing update-images event data:', e, event.data);
    }
  });

  eventSource.onopen = () => {
    console.log('SSE connection established');
  };

  eventSource.onerror = (err) => {
    console.error('SSE error:', err);
  };
});