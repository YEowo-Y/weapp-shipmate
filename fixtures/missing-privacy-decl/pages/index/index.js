// 缺失声明夹具：调用位置接口但 app.json 未声明 requiredPrivateInfos——
// consistency.requiredPrivateInfos（blocker）的召回锚点，语料中该规则此前只有 no_hit 反例。
Page({
  onLoad() {
    wx.getLocation({ type: "gcj02" });
  },
});
