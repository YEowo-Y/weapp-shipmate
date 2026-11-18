import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "dist", "target", "runtime", "gen", "vendor"].includes(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function stripCodeComments(source) {
  return source.replace(
    /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\*[\s\S]*?\*\/|\/\/.*$/gm,
    (match) => (match.startsWith("/") ? "" : match),
  );
}

test("正式桌面运行链（desktop/src、server、scripts、index.html）零 design-previews 依赖", () => {
  const html = readFileSync(join(ROOT, "desktop/index.html"), "utf8");
  assert.doesNotMatch(
    html,
    /(?:href|src)\s*=\s*["'][^"']*design-previews[^"']*["']/i,
    "desktop/index.html 不得从 design-previews 加载样式或脚本",
  );

  const violations = [];
  const candidateFiles = [join(ROOT, "desktop/vite.config.ts")];
  for (const dir of ["desktop/src", "desktop/server", "desktop/scripts"]) {
    walk(join(ROOT, dir), candidateFiles);
  }
  for (const file of candidateFiles) {
    if (!/\.(?:[cm]?js|d?\.[cm]?ts|tsx?|css)$/.test(file)) continue;
    const rel = relative(ROOT, file).replace(/\\/g, "/");
    const code = stripCodeComments(readFileSync(file, "utf8"));
    if (/design-previews/.test(code)) {
      violations.push(rel);
    }
  }
  assert.deepEqual(violations, [], `正式桌面源码仍含 design-previews 引用: ${violations.join(", ")}`);
});

test("ESLint 覆盖 desktop/** 且禁止正式桌面模块导入 design-previews", async () => {
  const configModule = await import(new URL("../eslint.config.mjs", import.meta.url));
  const flatConfig = configModule.default;
  assert.ok(Array.isArray(flatConfig), "eslint.config.mjs 必须导出 flat config 数组");

  const globalIgnores = flatConfig.flatMap((entry) =>
    Object.keys(entry).length === 1 && Array.isArray(entry.ignores) ? entry.ignores : [],
  );
  assert.ok(
    !globalIgnores.includes("desktop/**"),
    "eslint.config.mjs 不得再整体忽略 desktop/**",
  );

  const hasDesignPreviewsBan = flatConfig.some((entry) => {
    const rule = entry.rules?.["no-restricted-imports"];
    return JSON.stringify(rule ?? "").includes("design-previews");
  });
  assert.ok(hasDesignPreviewsBan, "eslint.config.mjs 必须配置禁止导入 *design-previews* 的门禁规则");

  const { ESLint } = await import("eslint");
  const eslint = new ESLint({ cwd: ROOT });
  for (const probePath of [
    "desktop/src/probe.ts",
    "desktop/src/probe.mts",
    "desktop/vite.config.ts",
    "desktop/scripts/probe.js",
  ]) {
    const [result] = await eslint.lintText(
      "import { createIcon } from '../design-previews/components/icons.js';\nexport const probe = 1;\n",
      { filePath: join(ROOT, probePath) },
    );
    assert.ok(
      result.messages.some((m) => m.ruleId === "no-restricted-imports"),
      `ESLint 必须拦截 ${probePath} 对 design-previews 的导入`,
    );
  }
});

test("desktop 类型检查启用 checkJs 并淘汰已迁入模块的通配遮蔽声明", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "desktop/package.json"), "utf8"));
  assert.ok(pkg.scripts?.typecheck, "desktop/package.json 必须提供 typecheck 脚本");
  for (const cfg of ["tsconfig.json", "tsconfig.ts.json", "tsconfig.node.json"]) {
    assert.match(pkg.scripts.typecheck, new RegExp(cfg.replace(/\./g, "\\.")), `typecheck 必须覆盖 ${cfg}`);
  }

  const rawTsconfig = readFileSync(join(ROOT, "desktop/tsconfig.json"), "utf8");
  const tsconfig = JSON.parse(stripCodeComments(rawTsconfig));
  assert.equal(tsconfig.compilerOptions?.allowJs, true, "desktop/tsconfig.json 必须开启 allowJs");
  assert.equal(tsconfig.compilerOptions?.checkJs, true, "desktop/tsconfig.json 必须开启 checkJs");

  const tsStrict = JSON.parse(stripCodeComments(readFileSync(join(ROOT, "desktop/tsconfig.ts.json"), "utf8")));
  assert.equal(tsStrict.compilerOptions?.noImplicitAny, true, "desktop/tsconfig.ts.json 必须对 TS/TSX 保持 noImplicitAny: true");
  assert.equal(tsStrict.compilerOptions?.useUnknownInCatchVariables, true, "desktop/tsconfig.ts.json 必须保持 useUnknownInCatchVariables: true");
  assert.ok(Array.isArray(tsStrict.include) && tsStrict.include.includes("vite.config.ts"), "desktop/tsconfig.ts.json 必须严格覆盖 vite.config.ts");

  const uncheckedNodeFiles = [];
  const nocheckFiles = [];
  for (const dir of ["desktop/src", "desktop/server", "desktop/scripts"]) {
    for (const file of walk(join(ROOT, dir))) {
      const content = readFileSync(file, "utf8");
      if (/\/\/\s*@ts-nocheck\b/.test(content)) {
        nocheckFiles.push(relative(ROOT, file).replace(/\\/g, "/"));
      }
      if ((dir === "desktop/server" || dir === "desktop/scripts") && /\.[cm]?js$/.test(file)) {
        if (!/\/\/\s*@ts-check\b/.test(content.slice(0, 256))) {
          uncheckedNodeFiles.push(relative(ROOT, file).replace(/\\/g, "/"));
        }
      }
    }
  }
  assert.deepEqual(nocheckFiles, [], `禁止用 // @ts-nocheck 绕过类型门禁: ${nocheckFiles.join(", ")}`);
  assert.deepEqual(uncheckedNodeFiles, [], `desktop/server 与 desktop/scripts 必须启用 // @ts-check: ${uncheckedNodeFiles.join(", ")}`);

  const sharedDtsPath = join(ROOT, "desktop/src/shared.d.ts");
  if (existsSync(sharedDtsPath)) {
    const sharedDts = stripCodeComments(readFileSync(sharedDtsPath, "utf8"));
    assert.doesNotMatch(
      sharedDts,
      /declare\s+module\s+['"]\*[^'"]*\.js['"]/,
      "desktop/src/shared.d.ts 不得再用 declare module '*.js' 遮蔽已迁入 src 的模块",
    );
  }
});

test("静态预览服务器 _serve.mjs 受控挂载 /src/shared/ 且拦截目录穿越", async (t) => {
  const serveModule = await import(new URL("../desktop/design-previews/_serve.mjs", import.meta.url));
  assert.equal(typeof serveModule.createPreviewServer, "function", "_serve.mjs 应导出 createPreviewServer 且导入时不强占固定端口");
  const preview = serveModule.createPreviewServer();
  preview.server.listen(0, "127.0.0.1");
  await once(preview.server, "listening");
  t.after(() => preview.close());

  const origin = `http://127.0.0.1:${preview.server.address().port}`;
  assert.equal((await fetch(`${origin}/main-four-region.html`)).status, 200);
  assert.equal((await fetch(`${origin}/app.css`)).status, 200);

  const sharedCss = await fetch(`${origin}/src/shared/app.css`);
  assert.equal(sharedCss.status, 200);
  assert.equal(await sharedCss.text(), readFileSync(join(ROOT, "desktop/src/shared/app.css"), "utf8"));

  const brandSvg = await fetch(`${origin}/src/shared/components/brands/google-color.svg`);
  assert.equal(brandSvg.status, 200);

  assert.equal((await fetch(`${origin}/src/shared/`)).status, 403);
  assert.equal((await fetch(`${origin}/src/shared/%2e%2e%2fmain.ts`)).status, 403);
  assert.equal((await fetch(`${origin}/%2e%2e%2fpackage.json`)).status, 403);
});
