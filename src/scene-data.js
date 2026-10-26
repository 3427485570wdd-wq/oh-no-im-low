/* Positions use the original tabletop coordinates. Portions are game presets. */
window.OhNoImLow = window.OhNoImLow || {};
window.OhNoImLow.scene = {
  version: "0.2.0",
  width: 1672,
  height: 941,
  // Centers and dimensions are fractions of the world layer, independent of UI.
  foods: [
    { id: "F03", name: "盒装果汁", asset: "juice-carton.svg",
      x: .43, y: .27, width: .063, height: .18, standing: true,
      portion: "1盒，约125mL", carbs: 15, firstResponse: 1 },
    { id: "F05", name: "无糖樱桃汽水", asset: "zero-sugar-soda.svg",
      x: .31, y: .31, width: .074, height: .204, standing: true,
      portion: "1罐，330mL", carbs: 0, firstResponse: 1 },
    { id: "F04", name: "巧克力豆饼干", asset: "chocolate-chip-cookie.svg",
      x: .72, y: .42, width: .114, height: .15,
      portion: "1块，约11g", carbs: 7.3, firstResponse: .4 },
    { id: "F06", name: "草莓软糖袋（左）", asset: "strawberry-gummy-packet.svg",
      x: .628, y: .461, width: .071, height: .075,
      portion: "1包，20g", carbs: 15.3, firstResponse: 1 },
    { id: "F07", name: "草莓软糖袋（右）", asset: "strawberry-gummy-packet.svg",
      x: .71, y: .51, width: .075, height: .085,
      portion: "1包，20g", carbs: 15.3, firstResponse: 1 },
    { id: "F02", name: "心形盒软糖", asset: "heart-gummy-box.svg",
      x: .54, y: .60, width: .082, height: .105,
      portion: "1盒，10g", carbs: 7.7, firstResponse: 1 },
    { id: "F01", name: "袋装硬糖", asset: "hard-candy-bag.svg",
      x: .66, y: .60, width: .105, height: .15,
      portion: "1袋，18g（约3颗）", carbs: 16.5, firstResponse: 1 }
  ]
};
