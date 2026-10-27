(() => {
  "use strict";
  class HandCamera {
    constructor(video, onResult, onState) {
      this.video = video; this.onResult = onResult; this.onState = onState;
      this.generation = 0; this.running = false; this.state = "off";
    }
    notify(state, message) { this.state = state; this.onState(state, message); }
    stop(notify = true) {
      this.generation++; this.running = false;
      cancelAnimationFrame(this.animation); clearInterval(this.watchdog);
      this.cancelLoading?.(); this.cancelLoading = null;
      this.worker?.terminate(); this.worker = null;
      for (const track of this.stream?.getTracks() || []) track.stop();
      this.stream = null; this.video.pause(); this.video.srcObject = null;
      this.busy = false;
      if (notify) this.notify("off", "摄像头已关闭");
    }
    async start() {
      this.stop(false);
      const token = this.generation;
      this.notify("loading", "正在开启摄像头并加载手部识别…");
      try {
        if (!window.isSecureContext || location.protocol === "file:") throw new Error("context");
        if (!navigator.mediaDevices?.getUserMedia || !window.Worker || !window.OffscreenCanvas || !window.createImageBitmap) throw new Error("unsupported");
        const stream = await navigator.mediaDevices.getUserMedia({ audio: false,
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } } });
        if (token !== this.generation) { stream.getTracks().forEach(track => track.stop()); return; }
        this.stream = stream; this.video.srcObject = stream;
        for (const track of stream.getVideoTracks()) track.addEventListener("ended", () => {
          if (token === this.generation) this.fail("摄像头已断开，可以重新开启或改用鼠标。");
        });
        await this.video.play();
        if (token !== this.generation) return;
        const worker = new Worker("./src/hand-worker.js"); this.worker = worker;
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("timeout")), 30000);
          const finish = callback => value => { clearTimeout(timer); this.cancelLoading = null; callback(value); };
          this.cancelLoading = finish(() => reject(new Error("cancelled")));
          worker.onerror = finish(() => reject(new Error("worker")));
          worker.onmessage = ({ data }) => {
            if (data.type === "ready") finish(resolve)();
            else if (data.type === "error") finish(reject)(new Error("model"));
          };
          worker.postMessage({ type: "init" });
        });
        if (token !== this.generation) return;
        worker.onmessage = ({ data }) => {
          if (token !== this.generation) return;
          this.busy = false; this.lastResult = performance.now();
          if (data.type === "error") return this.fail("手部识别暂时中断，可以重新开启或改用鼠标。");
          if (data.type === "result") this.onResult(data.points, data.timestamp, data.aspect);
        };
        worker.onerror = () => this.fail("手部识别暂时中断，可以重新开启或改用鼠标。");
        this.running = true; this.lastFrame = -1; this.lastSent = 0; this.lastResult = performance.now();
        this.notify("searching", "把一只手放到摄像头前，先松开拇指和食指。");
        const loop = async now => {
          if (!this.running || token !== this.generation) return;
          this.animation = requestAnimationFrame(loop);
          if (document.hidden || this.busy || now - this.lastSent < 66 || this.video.readyState < 2 || this.video.currentTime === this.lastFrame) return;
          this.busy = true; this.lastFrame = this.video.currentTime; this.lastSent = now;
          try {
            const bitmap = await createImageBitmap(this.video);
            if (!this.running || token !== this.generation) { bitmap.close(); return; }
            worker.postMessage({ type: "frame", bitmap, timestamp: now,
              aspect: this.video.videoWidth / this.video.videoHeight }, [bitmap]);
          } catch { if (token === this.generation) this.fail("无法读取摄像头画面，可以重新开启或改用鼠标。"); }
        };
        this.animation = requestAnimationFrame(loop);
        this.watchdog = setInterval(() => {
          if (!document.hidden && this.running && performance.now() - this.lastResult > 900) this.onResult(null, performance.now(), 4 / 3);
        }, 250);
      } catch (error) {
        if (token !== this.generation) return;
        const messages = {
          context: "手势模式需要HTTPS或本地预览地址；直接打开文件时请先使用鼠标。",
          unsupported: "当前浏览器不支持此手势模式，建议使用新版Chrome，或继续用鼠标。",
          NotAllowedError: "未获得摄像头权限，可以允许访问后重试，或继续用鼠标。",
          NotFoundError: "没有找到摄像头，可以连接摄像头后重试，或继续用鼠标。",
          NotReadableError: "摄像头暂时无法使用，可能正被其他应用占用。可以重试或改用鼠标。",
          timeout: "模型加载时间较长，请重试或先使用鼠标。"
        };
        this.fail(messages[error.name] || messages[error.message] || "手部识别未能启动，请检查模型文件后重试，或先使用鼠标。");
      }
    }
    fail(message) { this.stop(false); this.notify("error", message); }
  }
  window.OhNoImLow.HandCamera = HandCamera;
})();
