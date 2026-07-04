// FP 卫兵（V4 扩展命名空间后的防过杀锁）：Taro/wepy 的静态 URL 请求不是动态拼接——
// dynamicRequest 是项目级标记，本夹具的测试断言它为 false，扩展 (?:wx|uni|Taro|wepy) 不得误伤静态写法。
export const noop = () => {
  Taro.request({ url: "https://static.fpguard.test/taro" });
  wepy.request({ url: "wss://static.fpguard.test/ws" });
};
