// 类型声明 shim：只有类型、无运行时调用，不应被当成真实 API 使用。
declare const uni: {
  addInterceptor(name: string): void;
};
