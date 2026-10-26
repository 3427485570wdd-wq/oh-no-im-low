/* Adjustable game fiction. Never use these values for real treatment decisions. */
(() => {
  "use strict";
  const app = window.OhNoImLow;
  const config = Object.freeze({ initial: 3.4, recovery: 4, danger: 3, failure: 2.5,
    searchStepSeconds: 20, searchDrop: .1, waitSeconds: 4, waitDrop: .1,
    responsePerCarb: .06, fadeSeconds: 2 });
  const round = value => Math.round((value + Number.EPSILON) * 10) / 10;
  const create = () => ({ phase: "intro", level: config.initial, searchElapsed: 0,
    waitElapsed: 0, fadeElapsed: 0, pending: null, deferredCarbs: 0, records: [], consumed: [] });
  const start = game => { if (game.phase === "intro") game.phase = "search"; };
  const eat = (game, id) => {
    const food = app.scene.foods.find(item => item.id === id);
    if (game.phase !== "search" || !food || game.consumed.includes(id)) return false;
    const carbs = food.carbs * food.firstResponse + game.deferredCarbs;
    game.pending = { from: game.level,
      to: round(game.level + carbs * config.responsePerCarb - config.waitDrop), foodId: id };
    game.deferredCarbs = food.carbs * (1 - food.firstResponse);
    game.consumed.push(id);
    game.records.push({ id, name: food.name, asset: food.asset, portion: food.portion, carbs: food.carbs });
    game.waitElapsed = 0; game.phase = "waiting";
    return true;
  };
  const tick = (game, seconds, suspended = false) => {
    if (suspended || !Number.isFinite(seconds) || seconds <= 0) return;
    if (game.phase === "search") {
      game.searchElapsed += seconds;
      const steps = Math.floor((game.searchElapsed + 1e-9) / config.searchStepSeconds);
      if (steps) {
        game.level = round(game.level - steps * config.searchDrop);
        game.searchElapsed = Math.max(0, game.searchElapsed - steps * config.searchStepSeconds);
      }
      if (game.level <= config.failure) game.phase = "fading";
    } else if (game.phase === "waiting") {
      game.waitElapsed = Math.min(config.waitSeconds, game.waitElapsed + seconds);
      if (game.waitElapsed >= config.waitSeconds) {
        game.level = game.pending.to;
        game.phase = game.level >= config.recovery ? "recovered"
          : game.level <= config.failure ? "fading" : "search";
      }
    } else if (game.phase === "fading") {
      game.fadeElapsed = Math.min(config.fadeSeconds, game.fadeElapsed + seconds);
      if (game.fadeElapsed >= config.fadeSeconds) game.phase = "gameover";
    }
  };
  const displayLevel = game => game.phase === "waiting"
    ? game.pending.from + (game.pending.to - game.pending.from) * Math.min(1, game.waitElapsed / config.waitSeconds)
    : game.level;
  const ratio = level => Math.max(0, Math.min(1, (level - config.failure) / (config.recovery - config.failure)));
  const totalCarbs = game => round(game.records.reduce((sum, row) => sum + row.carbs, 0));
  app.rules = Object.freeze({ config, create, start, eat, tick, displayLevel, ratio, totalCarbs });
})();
