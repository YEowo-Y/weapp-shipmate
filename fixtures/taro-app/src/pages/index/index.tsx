import Taro, { getWeRunData } from "@tarojs/taro";
import { View } from "@tarojs/components";

// Taro（React）页面写 .tsx，API 走 Taro.*；编译到微信即 wx.*。
// R4：具名导入（摇树惯用法）——此前 API_RE 只认命名空间形式，getWeRunData() 这类调用整类不可见。
export default function Index() {
  const onTap = () => {
    getWeRunData({}); // 具名导入调用 → 应映射为 wx.getWeRunData 命中 privacy.werun
    Taro.getLocation({ type: "gcj02" }); // 已在 app.config 声明 → 不应误报缺声明
    Taro.chooseImage({ count: 1 });        // 相册/图片 → 应命中 privacy.choosePhotoVideo
    Taro.request({ url: "https://api.example.com/data" });
    // 动态拼接请求（V4）：此前 REQUEST_DYNAMIC_RE 漏 Taro 命名空间，"可能漏报域名"注记不出。
    const base = "https://api.example.com";
    Taro.request({ url: base + "/v2/data" });
  };
  return <View onClick={onTap}>taro 夹具</View>;
}
