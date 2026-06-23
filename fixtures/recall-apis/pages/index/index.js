// 召回夹具：验证隐私规则的召回补齐（§15.2 info-match-recall-gaps）。
// getFuzzyLocation（模糊位置，8 个位置接口之一）→ privacy.getLocation
// getRealtimePhoneNumber（实时手机号）→ privacy.getPhoneNumber
// getFuzzyLocation 已在 app.json 的 requiredPrivateInfos 声明 → consistency 须静默（反例）。
Page({
  onLoad() {
    wx.getFuzzyLocation({ type: "wgs84" });
    wx.getRealtimePhoneNumber({});
  },
});
