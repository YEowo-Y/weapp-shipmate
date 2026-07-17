// 已知限制清单（显性负债，2026-07-16 审计 A2）：以下真实调用形态对当前扫描器不可见。
// tests/scanner.test.mjs 以断言钉住"不可见"这一事实——能力扩展后该断言会红，
// 届时把这些形态升级为 labels.json 的 hit 锚点，而不是让盲区继续隐形。
export function knownGaps() {
  // 解构调用：工具封装层常见写法
  const { getLocation } = wx;
  getLocation({ type: "gcj02" });
  // 下标访问
  wx["getClipboardData"]({});
  // 命名空间别名
  const api = wx;
  api.chooseImage({ count: 1 });
  // 展开形态：url 可能藏在 cfg 里，也可能被后续静态 url: 覆盖——为避免误报暂不检测（复核 P2 钉板）
  wx.request({ ...globalThis.cfg });
}
