// E5：最小 lint 配置（flat config，eslint:recommended 级）——社区 PR 已开放征集（CONTRIBUTING），
// 静态错误类（未定义变量/不可达代码/重复键）不该靠人工审查兜底。
// 只管代码质量事实，不管风格（风格由 .editorconfig 与评审裁量）。
import { createRequire } from "node:module";
import js from "@eslint/js";

const requireDesktop = createRequire(new URL("./desktop/package.json", import.meta.url));
/** @type {any} */
let cachedBabelParser = null;
function getBabelParser() {
  if (!cachedBabelParser) {
    try {
      // 复用 desktop 已锁定的 @babel/parser（由 @vitejs/plugin-react -> @babel/core 传递提供），零新增依赖
      cachedBabelParser = requireDesktop("@babel/parser");
    } catch (cause) {
      throw new Error("对 TypeScript 文件运行 lint 前请先执行 npm ci --prefix desktop。", { cause });
    }
  }
  return cachedBabelParser;
}

function normalizeAstRanges(node, seen = new WeakSet()) {
  if (!node || typeof node !== "object" || seen.has(node)) return;
  seen.add(node);
  if (Array.isArray(node)) {
    for (const item of node) normalizeAstRanges(item, seen);
    return;
  }
  if (typeof node.start === "number" && typeof node.end === "number" && !node.range) {
    node.range = [node.start, node.end];
  }
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "range" || key === "tokens" || key === "comments") continue;
    normalizeAstRanges(node[key], seen);
  }
}

const tsEstreeParser = {
  meta: { name: "desktop-babel-estree-ts", version: "1.0.0" },
  parse(code, options = {}) {
    const filePath = options.filePath || "";
    const isDts = /\.d\.[cm]?ts$/.test(filePath);
    const plugins = ["estree", ["typescript", { dts: isDts }]];
    if (!isDts && (filePath.endsWith(".tsx") || filePath.endsWith(".jsx"))) plugins.push("jsx");
    const ast = getBabelParser().parse(code, {
      sourceType: "module",
      ranges: true,
      tokens: true,
      plugins,
    });
    normalizeAstRanges(ast.program);
    const comments = (ast.comments || []).map((c) => ({
      type: c.type === "CommentBlock" ? "Block" : "Line",
      value: c.value,
      range: [c.start, c.end],
      loc: c.loc,
    }));
    const tokens = (ast.tokens || [])
      .filter(
        (t) =>
          t.type !== "CommentLine" &&
          t.type !== "CommentBlock" &&
          t.type?.label !== "eof",
      )
      .map((t) => ({
        type: t.type?.keyword
          ? "Keyword"
          : t.type?.label === "name"
            ? "Identifier"
            : t.type?.label === "string"
              ? "String"
              : t.type?.label === "num"
                ? "Numeric"
                : "Punctuator",
        value: code.slice(t.start, t.end),
        range: [t.start, t.end],
        loc: t.loc,
      }));
    return Object.assign(ast.program, { comments, tokens });
  },
};

export default [
  {
    ignores: [
      "**/node_modules/**",
      "build/**",          // 打包暂存副本
      "desktop/dist/**",   // 桌面构建产物
      "desktop/src-tauri/**", // Tauri/Rust 源码、便携 runtime 与编译目录
      "desktop/**/vendor/**", // 已审计第三方捆绑包
      "**/*.d.{ts,mts,cts}", // 纯类型声明文件由 tsc --noEmit 把关
      "fixtures/**",       // 扫描对象样本：故意含 wx/Taro 等未定义全局与非常规写法
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
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      parser: tsEstreeParser,
    },
    rules: {
      // TS/TSX 的全局符号、函数重载与未使用局部变量由 tsc --noEmit (strict + noUnusedLocals/Parameters) 精确把关
      "no-undef": "off",
      "no-unused-vars": "off",
      "no-dupe-class-members": "off",
      "no-redeclare": "off",
    },
  },
  {
    files: ["desktop/**/*.{js,mjs,cjs,ts,tsx,mts,cts}"],
    ignores: ["desktop/design-previews/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["*design-previews*"],
              message: "正式桌面模块不得从 design-previews 导入，请使用 desktop/src/shared。",
            },
          ],
        },
      ],
    },
  },
];
