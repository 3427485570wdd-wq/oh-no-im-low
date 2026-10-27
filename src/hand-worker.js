/* Classic worker: MediaPipe's classic WASM loader uses importScripts. */
"use strict";
let landmarker = null;
const root = new URL("../", self.location.href);
self.onmessage = async ({ data }) => {
  if (data.type === "init") {
    try {
      importScripts(new URL("assets/vendor/mediapipe/vision_bundle.js", root).href);
      const vision = await self.Vision.FilesetResolver.forVisionTasks(
        new URL("assets/vendor/mediapipe/wasm", root).href, false);
      landmarker = await self.Vision.HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: new URL("assets/models/hand_landmarker.task", root).href, delegate: "CPU" },
        canvas: new OffscreenCanvas(640, 480), runningMode: "VIDEO", numHands: 1,
        minHandDetectionConfidence: .6, minHandPresenceConfidence: .6, minTrackingConfidence: .6
      });
      self.postMessage({ type: "ready" });
    } catch (error) { self.postMessage({ type: "error", message: String(error.message || error) }); }
  } else if (data.type === "frame") {
    try {
      if (!landmarker) throw new Error("Hand model is not ready.");
      const result = landmarker.detectForVideo(data.bitmap, data.timestamp);
      self.postMessage({ type: "result", points: result.landmarks[0] || null, timestamp: data.timestamp, aspect: data.aspect });
    } catch (error) { self.postMessage({ type: "error", message: String(error.message || error) }); }
    finally { data.bitmap.close(); }
  }
};
