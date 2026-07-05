// R3 卫兵（阶段4，D2）：正则字面量的双向锁。
// FN 面：同行正则之后的真实调用必须存活——修复前 /"/  把后续吞进字符串、/\//  把行尾吞进注释，
//        下面两行的 wx.getWeRunData 会从扫描里静默消失。
// FP 面：正则文本里出现的 API 名不是真实调用，不得命中（labels 有 chooseAddress no_hit 锚点）。
export function guard(s, x) {
  const a = s.split(/"/); wx.getWeRunData({});
  const b = x.replace(/\//g, "-"); wx.getWeRunData({});
  const NAME_RE = /wx.chooseAddress/;
  return { a, b, NAME_RE };
}
