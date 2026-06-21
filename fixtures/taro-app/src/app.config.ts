// Taro 的应用配置是 TS 模块（非 JSON）：隐私接口声明在此处的 requiredPrivateInfos。
export default defineAppConfig({
  pages: ["pages/index/index"],
  requiredPrivateInfos: ["getLocation"],
  window: { navigationBarTitleText: "taro 夹具" },
});
