const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({ window: { OhNoImLow: {} } });
vm.runInContext(fs.readFileSync(path.join(root, 'src/hand-gesture.js'), 'utf8'), context);
const Gesture = context.window.OhNoImLow.HandGesture;
function hand(ratio = .8, x = .4, y = .25) {
  const points = Array.from({ length: 21 }, () => ({ x: .5, y: .5, z: 0 }));
  points[0] = { x: .5, y: .75 }; points[5] = { x: .42, y: .52 };
  points[17] = { x: .64, y: .52 }; points[9] = { x: .53, y: .45 }; points[8] = { x, y };
  const palm = (Math.hypot((.42 - .64) * 4 / 3, 0) + Math.hypot((.5 - .53) * 4 / 3, .75 - .45)) / 2;
  points[4] = { x: x + ratio * palm / (4 / 3), y };
  return points;
}
let count = 0;
function check(name, run) { run(); count++; console.log('PASS ' + name); }
check('a closed hand at entry cannot grab until fingers first open', () => {
  const g = new Gesture(); assert.equal(g.update(hand(.1), 0).pressed, false);
  assert.equal(g.update(hand(.1), 100).pressed, false);
  assert.equal(g.update(hand(.8), 200).ready, true);
  assert.equal(g.update(hand(.1), 300).pressed, true);
});
check('pinch uses hysteresis and emits each grab/release just once', () => {
  const g = new Gesture(); g.update(hand(.8), 0);
  assert.equal(g.update(hand(.1), 100).pressed, true);
  const middle = g.update(hand(.35), 200); assert.equal(middle.pinching, true); assert.equal(middle.pressed, false);
  assert.equal(g.update(hand(.1), 300).pressed, false);
  assert.equal(g.update(hand(.6), 400).released, true);
  assert.equal(g.update(hand(.8), 500).released, false);
});
check('tracking loss cancels pinch and requires an open hand on return', () => {
  const g = new Gesture(); g.update(hand(.8), 0); g.update(hand(.1), 100);
  assert.equal(g.update(null, 200).tracked, false);
  assert.equal(g.update(hand(.1), 300).pressed, false);
  g.update(hand(.8), 400); assert.equal(g.update(hand(.1), 500).pressed, true);
});
check('pause disarms a held pinch', () => {
  const g = new Gesture(); g.update(hand(.8), 0); g.update(hand(.1), 100); g.disarm();
  assert.equal(g.update(hand(.1), 200).pressed, false); assert.equal(g.update(hand(.1), 200).pinching, false);
});
check('cursor is mirrored, bounded and smoothed', () => {
  const left = new Gesture().update(hand(.8, .2), 0), right = new Gesture().update(hand(.8, .8), 0);
  assert.ok(left.x > right.x);
  const g = new Gesture(), first = g.update(hand(.8, .8), 0), next = g.update(hand(.8, .2), 16);
  assert.ok(next.x > first.x && next.x < left.x);
  const edge = new Gesture().update(hand(.8, -.2, 1.2), 0);
  assert.equal(edge.x, 1); assert.equal(edge.y, 1);
});
check('pinch ratio is stable across hand size; malformed hands are rejected', () => {
  const g = new Gesture(); const scaled = points => points.map(p => ({ x: .5 + (p.x - .5) * .6, y: .5 + (p.y - .5) * .6 }));
  g.update(scaled(hand(.8)), 0); assert.equal(g.update(scaled(hand(.1)), 100).pressed, true);
  assert.equal(g.update([], 200).tracked, false);
  const invalid = hand(); invalid[8].x = NaN; assert.equal(g.update(invalid, 300).tracked, false);
});
check('local runtime and model hashes match the recorded downloads', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/vendor/mediapipe/manifest.json'), 'utf8'));
  for (const [file, expected] of Object.entries(manifest.files)) {
    const bytes = fs.readFileSync(path.join(root, file));
    assert.equal(bytes.length, expected.bytes); assert.ok(bytes.length < 25 * 1024 * 1024);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), expected.sha256);
  }
});
async function cameraChecks() {
  let resolveMedia, stopped = 0, lastStatus;
  const video = { pause() {}, play: async () => {}, srcObject: null };
  const window = { OhNoImLow: {}, isSecureContext: true, Worker: function () {}, OffscreenCanvas: function () {}, createImageBitmap() {} };
  const environment = vm.createContext({ window, location: { protocol: 'https:' },
    navigator: { mediaDevices: { getUserMedia: () => new Promise(resolve => { resolveMedia = resolve; }) } },
    cancelAnimationFrame() {}, clearInterval, clearTimeout, setTimeout, performance });
  vm.runInContext(fs.readFileSync(path.join(root, 'src/hand-camera.js'), 'utf8'), environment);
  const camera = new window.OhNoImLow.HandCamera(video, () => {}, (state, text) => { lastStatus = [state, text]; });
  const pending = camera.start(); camera.stop();
  resolveMedia({ getTracks: () => [{ stop() { stopped++; } }] }); await pending;
  assert.equal(stopped, 1); assert.equal(video.srcObject, null); assert.equal(camera.running, false);
  console.log('PASS stopping during permission acquisition releases a late stream'); count++;
  environment.navigator.mediaDevices.getUserMedia = async () => { throw Object.assign(new Error('denied'), { name: 'NotAllowedError' }); };
  await camera.start(); assert.equal(lastStatus[0], 'error'); assert.match(lastStatus[1], /权限/);
  assert.equal(camera.stream, null); assert.equal(camera.running, false);
  console.log('PASS permission refusal leaves mouse fallback available without a live stream'); count++;
  console.log(`${count} hand/camera checks passed.`);
}
cameraChecks().catch(error => { console.error(error); process.exitCode = 1; });
