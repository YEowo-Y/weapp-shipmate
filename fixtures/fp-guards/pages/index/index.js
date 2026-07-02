// FP 卫兵夹具：真实项目的常见写法不应误报（对应 scanner 的五个可信度修复回归锁）。
// 注意：本夹具内不得出现任何真实的动态拼接请求——dynamicRequest 是项目级标记，
// 测试断言它为 false。
Page({
  onLoad() {
    // 静态 URL（冒号后带空格，最常见写法）→ 不是动态拼接请求
    wx.request({ url: "https://static.fpguard.test/api" });
    // header/method 前置的封装写法 → 嵌套对象不应挡住 url 匹配，明文 http 仍须被识别
    wx.request({ method: "POST", header: { "content-type": "application/json" }, url: "http://plain.fpguard.test/v1" });
    // 文案/日志里引用 API 名 → 不是真实调用
    console.log("如需定位请授权 wx.getLocation 接口");
  },
});
