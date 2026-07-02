// 合成测试夹具：触发隐私 API、静态域名、动态域名、请求白名单等命中。
Page({
  onLoad() {
    wx.getUserProfile({ desc: "展示用户信息" });
    wx.getLocation({ type: "gcj02" });
    wx.getClipboardData({}); // 触发剪贴板隐私接口预检

    // 静态字面量域名
    wx.request({ url: "https://api.example.com/data" });

    // 动态拼接 URL（应触发 dynamicRequest 标记，静态扫描可能漏报域名）；
    // header 前置：动态判定须能越过嵌套对象。
    const base = "https://dyn.example.org";
    wx.request({ header: { "x-trace": "1" }, url: base + "/dynamic" });
  },
});
