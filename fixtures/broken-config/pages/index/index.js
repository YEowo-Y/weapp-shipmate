// 坏配置夹具（V3）：调用了位置接口，但 app.json 非法（未加引号的值，超出尾逗号容错）。
// 期望：consistency.requiredPrivateInfos 不得反向断言"未声明"产出 blocker 误报；
// check 报告须带"配置解析失败、一致性核验已跳过"的显式注记。
Page({
  onLoad() {
    wx.getLocation({ type: "wgs84" });
  },
});
