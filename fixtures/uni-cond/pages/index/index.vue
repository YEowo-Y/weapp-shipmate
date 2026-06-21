<template>
  <view>
    <!-- #ifdef H5 -->
    <image src="https://h5-only.example/banner.png" />
    <!-- #endif -->
    <!-- #ifdef MP-WEIXIN -->
    <button open-type="chooseAvatar">头像</button>
    <!-- #endif -->
  </view>
</template>

<script>
// uni-app 条件编译：编译到微信时只保留 MP-WEIXIN / 含微信的分支，剔除 H5 / APP-* 分支。
export default {
  methods: {
    go() {
      // #ifdef MP-WEIXIN
      uni.getClipboardData({}); // 微信端 → 保留
      // #endif
      // #ifdef APP-PLUS
      uni.scanCode({}); // App 端 → 剔除
      // #endif
      // #ifndef MP-WEIXIN
      uni.getRecorderManager(); // 非微信端 → 剔除
      // #endif
      // #ifndef APP-NVUE
      uni.getSystemInfoSync(); // 非 nvue（含微信）→ 保留
      // #endif
      // #ifdef VUE3
      uni.getStorageSync("k"); // 非平台标记（vue 版本）→ 保留，不按平台剔除
      // #endif
    },
  },
};
</script>
