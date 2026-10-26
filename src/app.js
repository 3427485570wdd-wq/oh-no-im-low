(() => {
  "use strict";
  const scene = window.OhNoImLow.scene;
  const area = document.getElementById("stage-area");
  const stage = document.getElementById("game-stage");
  const foodLayer = document.getElementById("food-layer");
  const loadingMessage = document.getElementById("loading-message");

  for (const food of scene.foods) {
    const item = document.createElement("div");
    item.className = "food";
    item.dataset.foodId = food.id;
    item.dataset.standing = String(Boolean(food.standing));
    item.style.left = food.x * 100 + "%";
    item.style.top = food.y * 100 + "%";
    item.style.width = food.width * 100 + "%";
    item.style.height = food.height * 100 + "%";

    const shadow = document.createElement("span");
    shadow.className = "food-shadow";
    shadow.setAttribute("aria-hidden", "true");

    const artwork = document.createElement("img");
    artwork.className = "food-art";
    artwork.src = "./assets/foods/" + food.asset;
    artwork.alt = food.name;
    artwork.draggable = false;
    artwork.decoding = "async";
    item.append(shadow, artwork);
    foodLayer.append(item);
  }

  // Fit the complete composition without cropping, stretching, or scrolling.
  // This viewport fitting is separate from future face-controlled world zoom.
  const fitStage = () => {
    const style = getComputedStyle(area);
    const width = area.clientWidth - parseFloat(style.paddingLeft)
      - parseFloat(style.paddingRight);
    const height = area.clientHeight - parseFloat(style.paddingTop)
      - parseFloat(style.paddingBottom);
    if (width <= 0 || height <= 0) return;
    const scale = Math.min(width / scene.width, height / scene.height);
    stage.style.width = scene.width * scale + "px";
    stage.style.height = scene.height * scale + "px";
  };
  if ("ResizeObserver" in window) {
    new ResizeObserver(fitStage).observe(area);
  } else {
    window.addEventListener("resize", fitStage);
  }
  fitStage();

  const imageReady = (image) => new Promise((resolve, reject) => {
    if (image.complete) {
      return image.naturalWidth ? resolve() : reject(new Error(image.src));
    }
    image.addEventListener("load", resolve, { once: true });
    image.addEventListener("error", () => reject(new Error(image.src)), { once: true });
  });
  Promise.all(Array.from(stage.querySelectorAll("img"), imageReady))
    .then(() => {
      stage.dataset.ready = "true";
      loadingMessage.hidden = true;
    })
    .catch(() => {
      stage.dataset.ready = "error";
      loadingMessage.textContent = "有素材未能加载，请确认 assets 文件夹完整。";
    });
})();
