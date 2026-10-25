# 练习材料验证记录

日期：2026-10-25。此记录仅为维护者对练习目录的本地CLI检查，不是参与者结果、安装器验收、微信运行或官方审核结论。

在仓库根目录执行：

```powershell
node bin/weapp-shipmate.mjs check docs/trial-kit/practice-miniapp --json
```

实际结果：扫描5个支持文件，范围完整、读取错误0，API为`wx.getLocation`，域名0，secretHints空，insecureHosts空。命中：

| 规则ID | 级别 | action_categories |
| --- | --- | --- |
| privacy.getLocation | warning | code、console、manual_check |
| consistency.requiredPrivateInfos | blocker | code、manual_check |

最新复核用Node子进程直接捕获退出码为2，对应故意保留的blocker；不是命令崩溃或练习执行了定位。该引用位于不可达分支，扫描器仍能看到静态线索。合理处理可包括删除不需要的示例；不能由此要求真实业务采集定位或宣称补声明后已合规。

练习全部自写，无第三方复制代码。没有真实AppID、AppSecret或网络地址，没有执行注册、发布、模型调用或微信接口。后续本地修改会改变扫描结果和范围hash，应重跑同一命令记录，不覆盖参与者首次结果。

补充验证：`node bin/weapp-shipmate.mjs guide --json --no-interactive`退出0，无需输入；主体显示“未指定”，提示privacy/domain事实尚未确认、未知不等于不适用，并保留条件自查。这个CLI结果不能代替桌面未知选项的实际试用。

两份示例JavaScript均通过`node --check`；使用只允许空App注册、禁止任何wx属性读取的独立VM检查app.js，结果没有访问wx，页面声明引用的文件均存在。5份参与者JSON均可解析、同意字段为false、全部阶段为not-run。拒因空页面、导出恢复及重开仍需实际桌面执行，不在这份验证记录中声称通过。

练习lint修正后，根目录`npm run lint`退出0。只声明只读的小程序宿主globals，并在不可达教学分支前精确豁免一行`no-constant-condition`；没有修改项目lint规则。通过Node子进程断言再次确认5文件、两条规则、原动作分类和零域名/秘密线索保持不变；隔离VM仍无wx访问。
