// 反例夹具：故意演示两个安全错误——前端硬编码密钥 + 前端直连微信服务端 API。
// 下面的密钥值是占位假串，仅供测试，非真实凭据。
const appSecret = "FAKE_PLACEHOLDER_NOT_A_REAL_SECRET";

Page({
  onLoad() {
    // 错误：access_token 应在后端获取，前端直连会泄露 AppSecret。
    wx.request({ url: "https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&secret=" + appSecret });
  },
});
