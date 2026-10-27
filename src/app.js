(() => {
  "use strict";
  const { scene, rules } = window.OhNoImLow, $ = id => document.getElementById(id);
  const stage = $("game-stage"), area = $("stage-area"), foodLayer = $("food-layer");
  const dialog = $("game-dialog"), content = $("panel-content"), items = new Map();
  const pauseButton = $("pause-button"), recordButton = $("record-button"), mouthButton = $("mouth-button");
  const toast = $("feedback"), live = $("announcer");
  let game = rules.create(), drag = null, spaceHeld = false, mouthLatched = false;
  let panel = null, panelBack = null, feedbackLeft = 0, last = performance.now();
  let inputMode = "mouse", handTracked = false, lastHand = null, missingSince = null;
  let cameraState = "off", cameraMessage = "摄像头已关闭", cameraStartControl = null, cameraStatusText = null;
  let hoveredFood = null;
  const gesture = new window.OhNoImLow.HandGesture();
  const camera = new window.OhNoImLow.HandCamera($("hand-video"), onHandSample, onCameraState);
  const suspended = () => dialog.open || document.hidden || (inputMode === "hand" && !handTracked);
  const active = () => game.phase === "search" && !suspended();
  const mouthOpen = () => active() && (spaceHeld || mouthLatched);
  const grams = value => value.toFixed(1).replace(/\.0$/, "");
  const say = message => { live.textContent = message; };
  function feedback(message, seconds = 4) {
    toast.textContent = message; feedbackLeft = seconds; toast.hidden = false; say(message);
  }
  function clearHandHover() {
    if (hoveredFood) hoveredFood.node.classList.remove("hand-hover");
    hoveredFood = null;
  }
  function updateCameraUI() {
    $("input-mode-label").textContent = inputMode === "hand"
      ? cameraState === "loading" ? "正在开启手势…" : handTracked ? "手势已识别" : "手势未就绪" : "鼠标操作";
    $("mode-button").textContent = inputMode === "hand" ? "手势设置" : "开启手势";
    $("input-mode-label").dataset.ready = String(handTracked);
    if (cameraStatusText && cameraStatusText.textContent !== cameraMessage) cameraStatusText.textContent = cameraMessage;
    if (cameraStartControl) cameraStartControl.disabled = !handTracked || !lastHand?.ready;
  }
  function onCameraState(state, message) {
    cameraState = state; cameraMessage = message;
    if (["error", "off", "loading"].includes(state)) {
      handTracked = false; gesture.reset(); lastHand = null; missingSince = performance.now();
      clearHandHover(); closeMouth();
      if (drag?.kind === "hand") finishDrag(true);
    }
    updateCameraUI();
  }
  function onHandSample(points, timestamp, aspect) {
    if (inputMode !== "hand") return;
    const wasTracked = handTracked;
    const sample = gesture.update(points, timestamp, aspect);
    handTracked = sample.tracked; lastHand = sample;
    if (!sample.tracked) {
      if (missingSince === null) missingSince = performance.now();
      if (!["error", "loading"].includes(cameraState)) cameraMessage = "手部暂未识别，游戏已暂停。请把一只手放回摄像头前。";
      clearHandHover(); closeMouth();
      if (drag?.kind === "hand") finishDrag(true);
      updateCameraUI(); return;
    }
    missingSince = null;
    if (!wasTracked) last = performance.now();
    cameraMessage = sample.ready ? "已识别手部，可以开始。食指移动，捏合拿起，松开放下。"
      : sample.pinching ? "正在捏合；开始前请先松开拇指和食指。" : "已识别手部，请先松开拇指和食指。";
    updateCameraUI();
    const cursor = $("hand-cursor");
    cursor.style.left = sample.x * 100 + "%"; cursor.style.top = sample.y * 100 + "%";
    cursor.classList.toggle("is-pinching", sample.pinching);
    if (!active()) { clearHandHover(); return; }
    clearHandHover();
    if (!drag) {
      // Follow the actual tabletop stacking order when small items overlap.
      for (const node of Array.from(foodLayer.children).reverse()) {
        const item = items.get(node.dataset.foodId);
        if (!item || node.hidden || node.disabled) continue;
        if (Math.abs(sample.x - item.x) <= item.width / 2 + .008 && Math.abs(sample.y - item.y) <= item.height / 2 + .008) {
          hoveredFood = item; node.classList.add("hand-hover"); break;
        }
      }
      if (sample.pressed && hoveredFood) beginDrag(hoveredFood, "hand", null, sample.x - hoveredFood.x, sample.y - hoveredFood.y);
    }
    if (drag?.kind === "hand") {
      moveDrag(sample.x - drag.dx, sample.y - drag.dy);
      if (sample.released && drag?.kind === "hand") finishDrag(false);
    }
  }
  function stopHandMode() {
    inputMode = "mouse"; camera.stop(); gesture.reset(); lastHand = null;
    handTracked = false; missingSince = null; clearHandHover(); closeMouth();
    if (drag?.kind === "hand") finishDrag(true);
    updateCameraUI(); last = performance.now();
  }
  function beginCamera() {
    inputMode = "hand"; handTracked = false; lastHand = null; gesture.reset();
    missingSince = performance.now(); clearHandHover(); camera.start();
  }
  function useMouse() {
    stopHandMode(); if (game.phase === "intro") rules.start(game);
    closePanel(); render();
  }
  $("mode-button").addEventListener("click", () => {
    openPanel("camera"); if (inputMode !== "hand" || !camera.running) beginCamera();
  });
  window.addEventListener("pagehide", () => camera.stop(false));
  function place(item) {
    item.node.style.left = item.x * 100 + "%"; item.node.style.top = item.y * 100 + "%";
  }
  for (const food of scene.foods) {
    const node = document.createElement("button");
    node.type = "button"; node.className = "food"; node.dataset.foodId = food.id;
    node.dataset.standing = String(Boolean(food.standing));
    node.setAttribute("aria-label", food.name); node.setAttribute("aria-describedby", "keyboard-help");
    node.style.width = food.width * 100 + "%"; node.style.height = food.height * 100 + "%";
    const shadow = document.createElement("span"); shadow.className = "food-shadow";
    shadow.setAttribute("aria-hidden", "true");
    const image = document.createElement("img"); image.className = "food-art";
    image.src = "./assets/foods/" + food.asset; image.alt = ""; image.draggable = false;
    node.append(shadow, image); foodLayer.append(node);
    const item = { ...food, node }; items.set(food.id, item); place(item);
    node.addEventListener("pointerdown", event => {
      if (!active() || drag || event.button !== 0 || node.disabled) return;
      event.preventDefault(); node.focus({ preventScroll: true });
      const point = toWorld(event);
      beginDrag(item, "pointer", event.pointerId, point.x - item.x, point.y - item.y);
      node.setPointerCapture(event.pointerId);
    });
    node.addEventListener("pointermove", event => {
      if (!drag || drag.id !== food.id || drag.pointerId !== event.pointerId) return;
      const point = toWorld(event); moveDrag(point.x - drag.dx, point.y - drag.dy);
    });
    node.addEventListener("pointerup", event => {
      if (drag && drag.pointerId === event.pointerId && !tryEat()) finishDrag(false);
    });
    node.addEventListener("pointercancel", () => finishDrag(true));
    node.addEventListener("lostpointercapture", () => {
      if (drag && drag.id === food.id && drag.kind === "pointer") finishDrag(true);
    });
    node.addEventListener("keydown", event => {
      if (event.key === "Enter" && active()) {
        event.preventDefault(); if (drag) finishDrag(false); else beginDrag(item, "keyboard");
      }
    });
  }
  function toWorld(event) {
    const box = stage.getBoundingClientRect();
    return { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height };
  }
  function beginDrag(item, kind, pointerId = null, dx = 0, dy = 0) {
    drag = { id: item.id, kind, pointerId, dx, dy, fromX: item.x, fromY: item.y };
    $("drag-layer").append(item.node); item.node.classList.add("is-held");
    item.node.focus({ preventScroll: true });
    item.node.setAttribute("aria-pressed", "true");
    say("已拿起" + item.name + "，送到下方进食区并张嘴。"); renderMouth();
  }
  function moveDrag(x, y) {
    if (!drag || !active()) return;
    const item = items.get(drag.id);
    item.x = Math.max(item.width / 2, Math.min(1 - item.width / 2, x));
    item.y = Math.max(item.height / 2, Math.min(1 - item.height / 2, y));
    place(item); renderMouth(); tryEat();
  }
  function finishDrag(cancelled) {
    if (!drag) return;
    const previous = drag, item = items.get(previous.id);
    const closedMouthDrop = !cancelled && active() && inMouth(item) && !mouthOpen();
    drag = null;
    if (cancelled) { item.x = previous.fromX; item.y = previous.fromY; place(item); }
    item.node.classList.remove("is-held"); item.node.removeAttribute("aria-pressed");
    if (previous.pointerId !== null && item.node.hasPointerCapture(previous.pointerId)) item.node.releasePointerCapture(previous.pointerId);
    foodLayer.append(item.node); renderMouth();
    if (closedMouthDrop) feedback("还没有吃下：拿起食品，按住空格张嘴。", 4);
  }
  function inMouth(item) { return item.x >= .405 && item.x <= .595 && item.y >= .795 && item.y <= .985; }
  function tryEat() {
    if (!drag || !mouthOpen()) return false;
    const item = items.get(drag.id);
    if (!inMouth(item) || !rules.eat(game, item.id)) return false;
    const previous = drag; drag = null;
    if (previous.pointerId !== null && item.node.hasPointerCapture(previous.pointerId)) item.node.releasePointerCapture(previous.pointerId);
    item.node.classList.remove("is-held"); item.node.classList.add("is-eaten");
    item.node.disabled = true; item.node.setAttribute("aria-hidden", "true"); item.node.removeAttribute("aria-pressed");
    closeMouth(); stage.focus({ preventScroll: true }); toast.hidden = true; feedbackLeft = 0;
    say("已吃下" + item.name + "，正在等待本次模拟结果。"); render(); return true;
  }
  function closeMouth() { spaceHeld = false; mouthLatched = false; renderMouth(); }
  function renderMouth() {
    const open = mouthOpen();
    $("mouth-open").setAttribute("display", open ? "inline" : "none");
    $("mouth-closed").setAttribute("display", open ? "none" : "inline");
    mouthButton.setAttribute("aria-pressed", String(open)); mouthButton.setAttribute("aria-label", open ? "闭嘴" : "张嘴");
    mouthButton.classList.toggle("is-target", Boolean(drag && inMouth(items.get(drag.id))));
    $("mouth-prompt").hidden = !(active() && drag && inMouth(items.get(drag.id)) && !open);
  }
  mouthButton.addEventListener("click", () => {
    if (active()) { mouthLatched = !mouthLatched; renderMouth(); tryEat(); }
  });
  document.addEventListener("keydown", event => {
    if (event.code === "Space" && active() && (!event.target.closest("button") || event.target.closest(".food"))) {
      event.preventDefault(); spaceHeld = true; renderMouth(); tryEat();
    }
    if (drag && drag.kind === "keyboard" && active()) {
      const delta = event.shiftKey ? .04 : .015, item = items.get(drag.id);
      const moves = { ArrowLeft: [-delta, 0], ArrowRight: [delta, 0], ArrowUp: [0, -delta], ArrowDown: [0, delta] };
      if (moves[event.key]) { event.preventDefault(); moveDrag(item.x + moves[event.key][0], item.y + moves[event.key][1]); }
      else if (event.key === "Escape") { event.preventDefault(); finishDrag(true); }
    } else if (event.key === "Escape" && !dialog.open && ["search", "waiting", "fading"].includes(game.phase)) {
      event.preventDefault(); openPanel("pause");
    }
  });
  document.addEventListener("keyup", event => { if (event.code === "Space") { spaceHeld = false; renderMouth(); } });
  function autoPause() {
    closeMouth(); finishDrag(true);
    if (!dialog.open && ["search", "waiting", "fading"].includes(game.phase)) openPanel("pause");
    last = performance.now();
  }
  window.addEventListener("blur", autoPause);
  document.addEventListener("visibilitychange", () => { if (document.hidden) autoPause(); last = performance.now(); });
  function action(label, callback, secondary = false) {
    const button = document.createElement("button"); button.type = "button";
    button.className = "candy-button" + (secondary ? " secondary" : "");
    button.textContent = label; button.addEventListener("click", callback); return button;
  }
  function closePanel() {
    if (inputMode === "hand" && !handTracked && ["search", "waiting", "fading"].includes(game.phase)) {
      openPanel("camera"); return;
    }
    gesture.disarm(); clearHandHover();
    dialog.close(); panel = null; panelBack = null; stage.dataset.suspended = "false"; last = performance.now();
    (game.phase === "search" ? stage : recordButton).focus({ preventScroll: true });
  }
  function returnFromPanel() { const back = panelBack; if (back) openPanel(back); else closePanel(); }
  function resetGame() {
    finishDrag(true); closeMouth(); game = rules.create(); rules.start(game);
    for (const item of items.values()) {
      const original = scene.foods.find(food => food.id === item.id); item.x = original.x; item.y = original.y;
      item.node.hidden = false; item.node.disabled = false; item.node.classList.remove("is-eaten");
      item.node.removeAttribute("aria-hidden"); item.node.removeAttribute("aria-pressed"); foodLayer.append(item.node); place(item);
    }
    feedbackLeft = 0; toast.hidden = true; closePanel(); render(); say("新的一局开始了。在桌面中寻找食品。");
  }
  function openPanel(type, back = null) {
    finishDrag(true); closeMouth(); gesture.disarm(); clearHandHover();
    cameraStartControl = null; cameraStatusText = null; panel = type; panelBack = back; stage.dataset.suspended = "true";
    content.replaceChildren(); dialog.dataset.panel = type;
    const icon = document.createElement("div"); icon.className = "panel-emblem"; icon.setAttribute("aria-hidden", "true");
    const heading = document.createElement("h1"); heading.id = "panel-title";
    const subtitle = document.createElement("p"); subtitle.className = "panel-subtitle";
    const body = document.createElement("div"); body.className = "panel-body";
    const buttons = document.createElement("div"); buttons.className = "panel-actions";
    content.append(icon, heading, subtitle, body, buttons);
    if (type === "intro") {
      icon.textContent = "♥"; heading.textContent = "Oh No, I’m Low!";
      subtitle.textContent = "从这张凌乱的桌面开始，用手势或鼠标寻找食品。";
      body.innerHTML = '<ol class="instruction-list"><li><span>01</span><div><strong>食指移动，捏合抓取</strong><p>开启手势后操作，或选择鼠标拖动食品。</p></div></li><li><span>02</span><div><strong>按住空格键张嘴</strong><p>食品进入进食区并张嘴后，会自动吃下整份。</p></div></li><li><span>03</span><div><strong>等待钟表，再看状态</strong><p>未恢复时继续寻找；寻找倒计时会随本次模拟状态更新。</p></div></li></ol><p class="simulation-note">本游戏为简化模拟，不能用于判断真实血糖或决定补糖量。本版支持手势或鼠标，张嘴仍由空格或点击嘴巴控制。</p>';
      buttons.append(action("开启摄像头", () => { openPanel("camera"); beginCamera(); }), action("使用鼠标开始", useMouse, true));
    } else if (type === "camera") {
      const handIcon = document.createElement("img"); handIcon.src = "./assets/ui/hand-control.svg"; handIcon.alt = ""; icon.append(handIcon);
      heading.textContent = "准备好你的手";
      subtitle.textContent = "一只手就够了；先松开拇指和食指，让系统识别。";
      body.innerHTML = '<div class="hand-instructions"><p><strong>食指移动</strong><span>控制桌面上的粉色光标</span></p><p><strong>捏合／松开</strong><span>拿起／放下食品</span></p><p><strong>按住空格</strong><span>张嘴进食</span></p></div>';
      cameraStatusText = document.createElement("p"); cameraStatusText.className = "camera-status";
      cameraStatusText.setAttribute("role", "status"); body.append(cameraStatusText);
      const privacy = document.createElement("p"); privacy.className = "simulation-note";
      privacy.textContent = "画面仅在本机识别，不显示、不保存、不上传。识别丢失时游戏暂停；随时可改用鼠标并关闭摄像头。";
      body.append(privacy);
      cameraStartControl = action(game.phase === "intro" ? "开始寻找" : "继续游戏", () => {
        if (!handTracked || !lastHand?.ready) return;
        if (game.phase === "intro") rules.start(game);
        closePanel(); render();
      });
      cameraStartControl.disabled = true;
      buttons.append(cameraStartControl, action("重新开启摄像头", beginCamera, true), action("改用鼠标", useMouse, true));
      if (game.phase !== "intro") buttons.append(action("重新开始这一局", resetGame, true));
      updateCameraUI();
    } else if (type === "pause") {
      icon.textContent = "Ⅱ"; heading.textContent = "暂停一下"; subtitle.textContent = "寻找、等待和状态变化都已暂停。";
      buttons.append(action("继续游戏", closePanel), action("查看补充记录", () => openPanel("records", "pause"), true));
      if (inputMode === "hand") buttons.append(action("手势设置", () => openPanel("camera"), true));
    } else if (type === "restart") {
      icon.textContent = "↻"; heading.textContent = "重新开始这一局？";
      subtitle.textContent = "桌面食品会回到原位，本局补充记录将清空。";
      buttons.append(action("重新开始", resetGame), action("返回", returnFromPanel, true));
    } else if (type === "records") {
      icon.textContent = "♡"; heading.textContent = "补充记录"; subtitle.textContent = "查看记录时已暂停";
      if (!game.records.length) {
        const empty = document.createElement("p"); empty.className = "empty-record";
        empty.textContent = "本局还没有吃下食品。返回桌面后继续寻找吧。"; body.append(empty);
      } else {
        const table = document.createElement("table");
        table.innerHTML = '<caption class="sr-only">本局已吃食品与碳水记录</caption><thead><tr><th scope="col">食物</th><th scope="col">已吃份量</th><th scope="col">碳水</th></tr></thead>';
        const tbody = document.createElement("tbody");
        for (const row of game.records) {
          const tr = document.createElement("tr"), name = document.createElement("th"); name.scope = "row";
          const image = document.createElement("img"); image.src = "./assets/foods/" + row.asset; image.alt = "";
          const text = document.createElement("span"); text.textContent = row.name; name.append(image, text);
          const portion = document.createElement("td"); portion.textContent = row.portion;
          const carbs = document.createElement("td"); carbs.textContent = grams(row.carbs) + "g";
          tr.append(name, portion, carbs); tbody.append(tr);
        }
        table.append(tbody); const wrap = document.createElement("div"); wrap.className = "record-table";
        wrap.append(table); body.append(wrap);
      }
      const total = document.createElement("p"); total.className = "record-total";
      total.innerHTML = '<span>碳水合计</span><strong>' + grams(rules.totalCarbs(game)) + 'g</strong>'; body.append(total);
      const bars = document.createElement("div"); bars.className = "record-status";
      for (const [label, level] of [["开始时", rules.config.initial], ["当前", rules.displayLevel(game)]]) {
        const row = document.createElement("div"); row.className = "status-row";
        const name = document.createElement("span"); name.textContent = label;
        const bar = document.createElement("span"); bar.className = "mini-track"; bar.setAttribute("role", "img");
        bar.setAttribute("aria-label", label + "的模拟身体状态");
        const fill = document.createElement("span"); fill.style.width = rules.ratio(level) * 100 + "%";
        if (level >= rules.config.recovery) fill.className = "restored";
        bar.append(fill); row.append(name, bar); bars.append(row);
      }
      body.append(bars);
      const note = document.createElement("p"); note.className = "simulation-note";
      note.textContent = "碳水为本游戏预设食品的近似值，实际产品和个人反应会有差异。"; body.append(note);
      buttons.append(action(back === "ending" ? "返回本局结果" : back === "pause" ? "返回暂停界面" : "返回桌面", returnFromPanel));
    } else if (type === "ending") {
      const recovered = game.phase === "recovered";
      icon.textContent = recovered ? "♥" : "♡"; icon.classList.toggle("broken", !recovered);
      heading.textContent = recovered ? "本局状态已恢复" : "GAME OVER";
      subtitle.textContent = recovered ? "你完成了这一局。回头看看，刚刚吃下了什么。" : "本局结束";
      const note = document.createElement("p"); note.className = "simulation-note";
      note.textContent = recovered ? "本局结果来自简化的游戏规则，不代表现实中相同食品会带来相同变化。"
        : "现实中的严重低血糖需要他人协助。失去意识时，不应继续喂食或饮水。";
      body.append(note); buttons.append(action("再玩一次", resetGame), action("查看补充记录", () => openPanel("records", "ending"), true));
      if (inputMode === "hand") buttons.append(action("关闭摄像头", () => { stopHandMode(); openPanel("ending"); }, true));
    }
    if (!dialog.open) dialog.showModal();
    const focusTarget = ["records", "camera"].includes(type) ? heading : buttons.querySelector("button");
    focusTarget.tabIndex = ["records", "camera"].includes(type) ? -1 : 0; focusTarget.focus({ preventScroll: true });
    last = performance.now(); render();
  }
  dialog.addEventListener("cancel", event => {
    event.preventDefault(); if (["records", "restart"].includes(panel)) returnFromPanel(); else if (panel === "pause") closePanel();
  });
  pauseButton.addEventListener("click", () => openPanel("pause"));
  recordButton.addEventListener("click", () => openPanel("records"));
  $("restart-button").addEventListener("click", () => openPanel("restart"));
  function render() {
    const level = rules.displayLevel(game), ratio = rules.ratio(level), isWaiting = game.phase === "waiting";
    const remaining = rules.remainingSearchSeconds(game);
    const timerText = remaining === null ? "--:--"
      : String(Math.floor(remaining / 60)).padStart(2, "0") + ":" + String(remaining % 60).padStart(2, "0");
    const timerLabel = game.phase === "recovered" ? "已恢复"
      : ["fading", "gameover"].includes(game.phase) ? "时间到"
      : suspended() ? "已暂停" : isWaiting ? "等待中" : "寻找倒计时";
    if ($("search-time").textContent !== timerText) $("search-time").textContent = timerText;
    $("search-timer-label").textContent = timerLabel;
    const timerAccess = timerLabel + " " + timerText;
    if ($("search-timer-access").textContent !== timerAccess) $("search-timer-access").textContent = timerAccess;
    stage.dataset.phase = game.phase; stage.dataset.suspended = String(suspended());
    $("ui-status-progress").setAttribute("width", String(Math.max(0, 440 * ratio)));
    $("ui-status-progress").setAttribute("fill", level >= rules.config.recovery ? "#7ce6a1" : level < rules.config.danger ? "#fa6d9e" : "url(#ui-amber)");
    $("status-description").textContent = level >= rules.config.recovery ? "本局模拟状态已恢复" : level < rules.config.danger ? "本局模拟状态正在接近危险" : "本局模拟状态尚未恢复";
    $("waiting-layer").hidden = !isWaiting;
    if (isWaiting) {
      const progress = game.waitElapsed / rules.config.waitSeconds;
      $("clock-progress").style.strokeDashoffset = String(452.389 * progress);
      $("clock-minute").setAttribute("transform", "rotate(" + (360 * progress) + " 120 120)");
    }
    const fade = game.phase === "gameover" ? 1 : game.phase === "fading" ? game.fadeElapsed / rules.config.fadeSeconds : 0;
    $("scene-shade").style.opacity = String(fade * .9);
    pauseButton.disabled = !["search", "waiting", "fading"].includes(game.phase);
    $("restart-button").disabled = game.phase === "intro"; recordButton.disabled = game.phase === "intro";
    mouthButton.disabled = !active();
    $("mode-button").disabled = ["recovered", "gameover"].includes(game.phase);
    $("hand-cursor").hidden = inputMode !== "hand" || !handTracked || !active();
    updateCameraUI();
    $("interaction-hint").textContent = inputMode === "hand" ? "食指移动 · 捏合抓取 · 空格张嘴 · Esc 暂停" : "鼠标拖动食品 · 空格张嘴 · Esc 暂停";
    for (const item of items.values()) {
      const eaten = game.consumed.includes(item.id); item.node.disabled = eaten || !active();
      if (eaten && (!isWaiting || game.pending.foodId !== item.id || game.waitElapsed >= .35)) item.node.hidden = true;
    }
    $("ui-hint-face").textContent = isWaiting ? "稍等片刻" : game.phase === "fading" ? "身体状态正在变差" : inputMode === "hand" ? "食指移动 · 捏合抓取" : "鼠标按住食品 · 拖到嘴边";
    $("ui-hint-hand-mouth").textContent = isWaiting ? "可查看补充记录" : inputMode === "hand" ? "空格张嘴 · 松开放下" : "空格张嘴 · 也可点击嘴巴";
    renderMouth();
  }
  function frame(now) {
    const seconds = Math.max(0, (now - last) / 1000); last = now;
    if (inputMode === "hand" && !handTracked && missingSince !== null && now - missingSince > 250 &&
        !dialog.open && ["search", "waiting", "fading"].includes(game.phase)) openPanel("camera");
    const before = game.phase, beforeLevel = game.level; rules.tick(game, seconds, suspended());
    if (!suspended() && feedbackLeft > 0) { feedbackLeft -= seconds; if (feedbackLeft <= 0) toast.hidden = true; }
    if (game.phase !== before) {
      if (game.phase === "search") feedback(game.level > game.pending.from ? "状态有所改善，继续在桌面寻找。" : "还没有明显改善，继续在桌面寻找。");
      else if (game.phase === "fading") { finishDrag(true); closeMouth(); feedback("身体状态正在变差……", 2); }
      else if (["recovered", "gameover"].includes(game.phase)) { toast.hidden = true; feedbackLeft = 0; openPanel("ending"); }
    } else if (game.phase === "search" && beforeLevel >= rules.config.danger && game.level < rules.config.danger) {
      feedback("身体状态正在变差，继续在桌面寻找。", 5);
    }
    render(); requestAnimationFrame(frame);
  }
  function fitStage() {
    finishDrag(true); const style = getComputedStyle(area);
    const width = area.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const height = area.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    if (width <= 0 || height <= 0) return;
    const scale = Math.min(width / scene.width, height / scene.height);
    stage.style.width = scene.width * scale + "px"; stage.style.height = scene.height * scale + "px";
  }
  if ("ResizeObserver" in window) new ResizeObserver(fitStage).observe(area); else window.addEventListener("resize", fitStage);
  fitStage(); render();
  const ready = image => new Promise((resolve, reject) => {
    if (image.complete) return image.naturalWidth ? resolve() : reject(new Error(image.src));
    image.addEventListener("load", resolve, { once: true }); image.addEventListener("error", reject, { once: true });
  });
  Promise.all(Array.from(stage.querySelectorAll("img"), ready)).then(() => {
    stage.dataset.ready = "true"; $("loading-message").hidden = true; openPanel("intro"); requestAnimationFrame(frame);
  }).catch(() => { $("loading-message").textContent = "有素材未能加载，请检查 assets 文件夹是否完整。"; });
})();
