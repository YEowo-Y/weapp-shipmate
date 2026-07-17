// 动态 URL 走廊夹具（2026-07-16 审计 A1）：三种真实高频形态，修复前 dynamicRequest=false
// 且无任何「可能漏报域名」注记——正是 scanner.mjs 自注释定义的"合规工具最坏的失效模式"。
// 注意：本文件不得出现静态可提取域名之外的隐私 API（known-gaps.js 另测不可见调用形态）。
const BASE_HOST = "api.example.com";
const wsHost = "ws.example.com";
Page({
  onLoad() {
    // 形态①：模板字面量插值——现代 uni-app/Taro 项目最常见的 URL 构造方式
    wx.request({ url: `https://${BASE_HOST}/api/list` });
    // 形态②：引号前缀拼接——scheme 是字面量、host 在变量里
    uni.connectSocket({ url: "wss://" + wsHost + "/live" });
    // 形态③：变量配置对象——url 完全不在调用点
    const cfg = { url: this.buildUrl() };
    Taro.uploadFile(cfg);
    // 反例（防过杀）：无插值的模板字面量是静态 URL，host 必须被正常提取
    wepy.request({ url: `https://static-template.example.com/api` });
  },
});
