/* Hand input only: no camera, DOM or game-state dependencies. */
(() => {
  "use strict";
  const clamp = value => Math.max(0, Math.min(1, value));
  const distance = (a, b, aspect) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
  class HandGesture {
    constructor() { this.reset(); }
    reset() { this.point = null; this.lastTime = null; this.disarm(); }
    disarm() { this.armed = false; this.pinching = false; }
    update(points, timestamp, aspect = 4 / 3) {
      if (!Number.isFinite(aspect) || aspect <= 0) aspect = 4 / 3;
      if (!Array.isArray(points) || points.length !== 21 ||
          points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
        this.reset(); return { tracked: false, pressed: false, released: false };
      }
      const palm = (distance(points[5], points[17], aspect) + distance(points[0], points[9], aspect)) / 2;
      if (palm < .035) { this.reset(); return { tracked: false, pressed: false, released: false }; }
      const pinchRatio = distance(points[4], points[8], aspect) / palm;
      const wasPinching = this.pinching;
      if (pinchRatio > .45) { this.pinching = false; this.armed = true; }
      else if (this.armed && pinchRatio < .28) this.pinching = true;
      // Mirror horizontal motion. The central camera area reaches the whole table.
      const target = { x: clamp((1 - points[8].x - .08) / .84), y: clamp((points[8].y - .10) / .80) };
      const dt = this.lastTime === null ? 16 : Math.max(0, Math.min(100, timestamp - this.lastTime));
      const alpha = 1 - Math.exp(-dt / 65);
      this.point = this.point ? { x: this.point.x + alpha * (target.x - this.point.x),
        y: this.point.y + alpha * (target.y - this.point.y) } : target;
      this.lastTime = timestamp;
      return { tracked: true, ...this.point, pinching: this.pinching,
        pressed: !wasPinching && this.pinching, released: wasPinching && !this.pinching,
        ready: this.armed && !this.pinching };
    }
  }
  window.OhNoImLow.HandGesture = HandGesture;
})();
