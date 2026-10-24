# 拒因结果阅读与会话衔接

## 范围与依据

本轮补齐查询后阅读、复制、加入当前会话的路径。复用 Web Awesome、Lucide、原生 details/dialog、既有 appendRecord 和 IndexedDB 会话存储；不引入依赖或第二套状态协议。

- Cherry Studio 官方聊天说明与截图：https://cherryai.com/docs/en/cherrystudio/preview/chat/ 。借鉴独立会话记录、保留上下文以及紧凑的正文/操作分区。
- Claude 成果使用说明：https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them 。借鉴可独立阅读与后续复用的结果，不照搬与本项目无关的功能。
- 当前原生基线：`.omx/artifacts/desktop-model-native/run-2026-10-21T17-20-15-875Z/explain-result.png`。主要问题：输入占首屏过半；已完成结果缺少明确去向。

## 修改顺序

1. 锁定已有查询、停止、错误恢复和保留草稿行为，增加查询区折叠、复制重试、过期异步反馈与结果保存测试。
2. 成功匹配后收起查询表单，摘要可键盘展开；空结果和错误保持可编辑。结果操作采用现有按钮与图标。
3. 校验后的结果生成安全 Markdown；复制与加入当前会话各自反馈。会话保存复用已有报告接口，不发起模型请求，不替换草稿，不重复加入同一结果。
4. 当前页面、原生窄屏与键盘路径实际检查，补齐刷新/重启后结果找回验收。

## 验证与交付边界

- 已发现命令：`npm test`、`npm run lint`、显式 lint 共享 JS、`npm --prefix desktop run build`、`npm --prefix desktop run tauri build -- --debug --no-bundle`、`node scripts/desktop-native-e2e.mjs`。
- 行为风险 medium：本地、可逆的结果呈现与已有保存入口集成；不改身份、网络权限、模型协议或存储格式。
- 验证内容：真规则查询、无命中、失败恢复、copy 失败重试/晚返回、草稿不变、保存不发请求、重复操作、跨重启、窄屏无溢出、焦点恢复。
- 浏览器已可访问，本轮使用 CUA 检查；原生协议模型部分使用已有明确标记的 fixture。发布安装包与真实付费模型不在本轮交付声明内。
- 回退只涉及本轮 UI/控制器增量，既有会话数据格式保持兼容。
