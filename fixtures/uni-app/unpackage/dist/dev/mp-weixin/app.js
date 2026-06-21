// uni-app 编译产物（构建目录）：不应被扫描，否则框架运行时与占位 host 会污染结果。
wx.createSubpackageApp({});
wx.request({ url: "https://danger.example:9000/should-be-ignored" });
