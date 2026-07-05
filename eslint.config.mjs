// E5：最小 lint 配置（flat config，eslint:recommended 级）——社区 PR 已开放征集（CONTRIBUTING），
// 静态错误类（未定义变量/不可达代码/重复键）不该靠人工审查兜底。
// 只管代码质量事实，不管风格（风格由 .editorconfig 与评审裁量）。
import js from "@eslint/js";

export default [
  {
    ignores: [
      "node_modules/**",
      "build/**",       // 打包暂存副本
      "desktop/**",     // 桌面轨已搁置（D4），恢复时单独配置
      "fixtures/**",    // 扫描对象样本：故意含 wx/Taro 等未定义全局与非常规写法
      "coverage/**",
      ".omc/**",
      ".omx/**",
      ".serena/**",
    ],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        // 仓库实际用到的 Node 全局（纯 ESM，无需完整 env 预设）
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        URL: "readonly",
        fetch: "readonly",
        AbortController: "readonly",
        performance: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
];
