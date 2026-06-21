// 边界夹具：验证扫描器的可信度修复——注释里的 API 不应被当成真实调用；
// 带端口 / userinfo 的请求域名应被归一为裸 host（否则安全交叉核验会被绕过）。
Page({
  onLoad() {
    // wx.getLocation({ type: "gcj02" })  ← 注释掉的调用，注释剥离后不应命中
    /* wx.getFuzzyLocation()  块注释里的调用同样不应命中 */

    // 真实调用：应正常命中
    wx.getUserProfile({ desc: "展示用户信息" });

    // 带端口 → host 须归一为 api.example.com（不是 api.example.com:8443）
    wx.request({ url: "https://api.example.com:8443/data" });
    // 带 userinfo → host 须归一为 cdn.example.com（不是 user@cdn.example.com）
    wx.request({ url: "https://user@cdn.example.com/asset" });

    // 明文 http 在请求 url: → 算明文请求；在媒体 src → 不算（微信只对 4 个网络 API 强制 https）
    wx.request({ url: "http://plain.req.test/data" });
    const poster = { src: "http://img.media.test/p.png" };
    return poster;
  },
});
