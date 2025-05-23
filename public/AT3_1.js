document.body.style.margin   = 0
document.body.style.overflow = `hidden`

const cnv = document.getElementById (`cnv_element`)
cnv.width = innerWidth
cnv.height = innerHeight
cnv.style.backgroundColor = `#fffaec`

const ctx = cnv.getContext (`2d`)

let mouseX = innerWidth / 2
let mouseY = innerHeight / 2

document.addEventListener (`mousemove`, e => {
   mouseX = e.clientX
   mouseY = e.clientY
})

const imageSets = [
  ["/src/dageoff_2.png", "/src/dageon_2.png", "/src/dagered_2.png"],
  ["/src/dageoff_2.png", "/src/dageon_2.png", "/src/dagered_2.png"],
  ["/src/dageoff_2.png", "/src/dageon_2.png", "/src/dagered_2.png"],
  ["/src/ergeoff_2.png", "/src/ergeon_2.png", "/src/ergered_2.png"],
  ["/src/ergeoff_2.png", "/src/ergeon_2.png", "/src/ergered_2.png"],
]
// let currentImageIndex = 0

const loadedImages = imageSets.map(set =>
  set.map(src => {
    const img = new Image()
    img.src = src
    return img
  })
)

let objects = [
  { x: innerWidth / 2 - 300, y: innerHeight / 2, setIndex: 0, imgIndex:0 },
  { x: innerWidth / 2 - 100, y: innerHeight / 2, setIndex: 1, imgIndex:0 },
  { x: innerWidth / 2 + 100, y: innerHeight / 2, setIndex: 2, imgIndex:0 },
  { x: innerWidth / 2 + 300, y: innerHeight / 2, setIndex: 3, imgIndex:0 },
  { x: innerWidth / 2, y: innerHeight / 2 + 200, setIndex: 4, imgIndex:0 },
]

let draggingIndex = null;
let offsetX = 0;
let offsetY = 0;
let wasDragging = false;

let particles = []

function spawnParticles(x, y) {
  for (let i = 0; i < 30; i++) {
    const angle = Math.random() * Math.PI * 2
    const speed = Math.random() * 3
    particles.push({
      x: x,
      y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      alpha: 1,
      color: `hsl(${Math.random() * 360}, 100%, 50%)`,
    })
  }
}
// const img = new Image ()
// img.src = imageSources[currentImageIndex]

// let isDragging = false;
// let wasDragging = false;

cnv.addEventListener (`mousedown`, (e) => {
  // currentImageIndex = (currentImageIndex + 1) % imageSources.length
  // img.src = imageSources[currentImageIndex]
  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];
    const img = loadedImages[obj.setIndex][obj.imgIndex];
    const imgW = 210;
    const imgH = 210 * (img.height / img.width);
    const imgLeft = obj.x - imgW / 2;
    const imgTop = obj.y - imgH / 2;
    if (
      e.clientX >= imgLeft &&
      e.clientX <= imgLeft + imgW &&
      e.clientY >= imgTop &&
      e.clientY <= imgTop + imgH
    ) {
      draggingIndex = i;
      offsetX = e.clientX - obj.x;
      offsetY = e.clientY - obj.y;
      wasDragging = false;
      const picked = objects.splice(i, 1)[0];
      objects.push(picked);
      draggingIndex = objects.length - 1;
      break;
    }
  }  
  // const imgW = 2100
  // const imgH = 2100 * (img.height / img.width)
  // const imgLeft = mouseX - imgW / 2
  // const imgTop = mouseY - imgH / 2
  

  // {
  //   isPickedUp = !isPickedUp
  // } else if (!isPickedUp) {
  //   currentImageIndex = (currentImageIndex + 1) % imageSources.length
  //   img.src = imageSources[currentImageIndex]
  // }
})

document.addEventListener (`mousemove`, e => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  if (draggingIndex !== null) {
    objects[draggingIndex].x = e.clientX - offsetX;
    objects[draggingIndex].y = e.clientY - offsetY;
    wasDragging = true;
  }
});

document.addEventListener (`mouseup`, () => {
  draggingIndex = null;
  // currentImageIndex = (currentImageIndex + 1) % imageSources.length
  // img.src = imageSources[currentImageIndex]
});

cnv.addEventListener (`click`, () => {
  if (!wasDragging) {
    // currentImageIndex = (currentImageIndex + 1) % imageSources.length;
    // img.src = imageSources[currentImageIndex];
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i];
      const img = loadedImages[obj.setIndex][obj.imgIndex];
      const imgW = 210;
      const imgH = 210 * (img.height / img.width);
      const imgLeft = obj.x - imgW / 2;
      const imgTop = obj.y - imgH / 2;
      if (
        mouseX >= imgLeft &&
        mouseX <= imgLeft + imgW &&
        mouseY >= imgTop &&
        mouseY <= imgTop + imgH
      ) {
        obj.imgIndex = (obj.imgIndex + 1) % loadedImages[obj.setIndex].length;
        spawnParticles(obj.x, obj.y)
        break;
      }
    }
  }
  wasDragging = false;
});

function draw_frame(ms) {
  ctx.clearRect(0, 0, cnv.width, cnv.height);

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    ctx.globalAlpha = p.globalAlpha
    ctx.fillStyle = p.color
    ctx.fillRect(p.x, p.y, 4, 4)
    ctx.globalAlpha = 1
    p.x += p.vx
    p.y += p.vy
    if (p.alpha <= 0) particles.splice(i, 1)
  }

  for (const obj of objects) {
    const img = loadedImages[obj.setIndex][obj.imgIndex]
    const imgW = 210
    const imgH = 210 * (img.height / img.width)
    ctx.drawImage(img, obj.x - imgW / 2, obj.y - imgH / 2, imgW, imgH)
  }
  // const imgW = 2100
  // const imgH = 2100 * (img.height / img.width)
  // ctx.drawImage(img, mouseX - imgW / 2, mouseY - imgH / 2, imgW, imgH)
  requestAnimationFrame (draw_frame)
}
draw_frame ();

onresize = () => {
  cnv.width = innerWidth
  cnv.height = innerHeight
}

