const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({ window: {} });
for (const file of ['scene-data.js', 'game-rules.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'src', file), 'utf8'), context);
}
const { rules } = context.window.OhNoImLow;
const newGame = () => { const game = rules.create(); rules.start(game); return game; };
let checks = 0;
function check(name, run) { run(); checks++; console.log('PASS ' + name); }
check('juice recovers only after the complete wait', () => {
  const g = newGame(); assert.equal(rules.eat(g, 'F03'), true);
  rules.tick(g, 3.5); assert.equal(g.phase, 'waiting'); assert.ok(rules.displayLevel(g) < g.pending.to);
  rules.tick(g, .5); assert.equal(g.phase, 'recovered'); assert.equal(g.records.length, 1);
});
check('one food cannot be billed twice or eaten while waiting', () => {
  const g = newGame(); rules.eat(g, 'F02'); assert.equal(rules.eat(g, 'F06'), false);
  rules.tick(g, 4); assert.equal(rules.eat(g, 'F02'), false); assert.equal(g.records.length, 1);
});
check('small portion continues on the same table; record total is exact', () => {
  const g = newGame(); rules.eat(g, 'F02'); rules.tick(g, 4);
  assert.equal(g.phase, 'search'); assert.equal(g.level, 3.8);
  rules.eat(g, 'F01'); rules.tick(g, 4);
  assert.equal(g.phase, 'recovered'); assert.equal(rules.totalCarbs(g), 24.2);
});
check('zero soda has no carbohydrate response; background decline remains', () => {
  const g = newGame(); rules.eat(g, 'F05'); rules.tick(g, 4);
  assert.equal(g.level, 3.3); assert.equal(rules.totalCarbs(g), 0); assert.equal(g.phase, 'search');
});
check('cookie response carries to the next wait without rebilling carbs', () => {
  const g = newGame(); rules.eat(g, 'F04'); rules.tick(g, 4);
  assert.equal(g.level, 3.5); rules.eat(g, 'F05'); rules.tick(g, 4);
  assert.equal(g.level, 3.7); assert.equal(g.deferredCarbs, 0); assert.equal(rules.totalCarbs(g), 7.3);
});
check('two matching packets are independent portions', () => {
  const g = newGame(); rules.tick(g, rules.config.searchStepSeconds * 6); rules.eat(g, 'F06'); rules.tick(g, 4);
  assert.equal(g.phase, 'search'); assert.equal(rules.eat(g, 'F07'), true);
  rules.tick(g, 4); assert.equal(rules.totalCarbs(g), 30.6); assert.equal(g.consumed.length, 2);
});
check('pause freezes both wait and accumulated search time', () => {
  const g = newGame(); rules.tick(g, rules.config.searchStepSeconds - 1); rules.tick(g, 50, true);
  assert.equal(g.level, 3.4); assert.equal(g.searchElapsed, rules.config.searchStepSeconds - 1);
  rules.eat(g, 'F02'); rules.tick(g, 1); rules.tick(g, 50, true);
  assert.equal(g.waitElapsed, 1); rules.tick(g, 3); assert.equal(g.phase, 'search');
  rules.tick(g, 1); assert.equal(g.level, 3.7);
});
check('extreme decline fades before GAME OVER; fade also pauses', () => {
  const g = newGame(); rules.tick(g, rules.config.initialSearchSeconds); assert.equal(g.phase, 'fading');
  assert.equal(rules.eat(g, 'F01'), false); rules.tick(g, 1); rules.tick(g, 20, true);
  assert.equal(g.phase, 'fading'); rules.tick(g, 1); assert.equal(g.phase, 'gameover');
});
check('a fresh game clears history, pending response and consumed food', () => {
  const first = newGame(); rules.eat(first, 'F04'); const next = newGame();
  assert.equal(next.records.length, 0); assert.equal(next.consumed.length, 0);
  assert.equal(next.pending, null); assert.equal(next.deferredCarbs, 0);
});
check('search countdown matches the failure boundary and freezes while paused', () => {
  const g = newGame(); assert.equal(rules.remainingSearchSeconds(g), 60);
  rules.tick(g, 1.2); assert.equal(rules.remainingSearchSeconds(g), 59);
  rules.tick(g, 30, true); assert.equal(rules.remainingSearchSeconds(g), 59);
  rules.tick(g, 18.8); assert.equal(rules.remainingSearchSeconds(g), 40);
  rules.tick(g, 40); assert.equal(g.phase, 'fading'); assert.equal(rules.remainingSearchSeconds(g), 0);
});
check('countdown freezes during waiting and updates only after settlement', () => {
  const g = newGame(); rules.tick(g, 2); rules.eat(g, 'F02');
  assert.equal(rules.remainingSearchSeconds(g), 58);
  rules.tick(g, 2); assert.equal(rules.remainingSearchSeconds(g), 58);
  rules.tick(g, 2); assert.equal(rules.remainingSearchSeconds(g), 85);
  rules.eat(g, 'F01'); rules.tick(g, 4);
  assert.equal(g.phase, 'recovered'); assert.equal(rules.remainingSearchSeconds(g), null);
});
check('all fixed UI bindings exist and HTML IDs are unique', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'Duplicate HTML/SVG ID');
  for (const [, id] of app.matchAll(/\$\("([^"]+)"\)/g)) assert.ok(ids.includes(id), 'Missing UI node: ' + id);
});
check('every referenced local asset exists and stays below the deployment limit', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const assets = [...html.matchAll(/(?:src|href)="(\.\/[^"?#]+)"/g)].map(match => match[1]);
  for (const food of context.window.OhNoImLow.scene.foods) assets.push('assets/foods/' + food.asset);
  for (const file of new Set(assets)) {
    const stat = fs.statSync(path.join(root, file));
    assert.ok(stat.isFile(), file); assert.ok(stat.size < 25 * 1024 * 1024, 'Oversize file: ' + file);
  }
});
console.log(`${checks} checks passed.`);
