<template>
  <view class="page">
    uni-app 夹具
    <!-- 内联 SVG 的 xmlns 是命名空间标识，不是请求域名，不应被当成明文请求 -->
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>
  </view>
</template>

<script>
export default {
  methods: {
    onLoad() {
      uni.getLocation({ type: "gcj02" });   // 已在 manifest mp-weixin 声明 → 不应误报缺声明
      uni.chooseImage({ count: 1 });          // 相册/图片 → 应命中 privacy.choosePhotoVideo（uni≡wx）
      uni.request({ url: "https://api.example.com/data" });
      uni.connectSocket({ url: `wss://${wsHost}/live` }); // 模板字面量 host → 应被拒，不进域名
    },
  },
};
</script>
