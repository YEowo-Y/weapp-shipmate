import { LucideSvg } from './lucide-svg';
import { InfoHint, PanelEmpty, PanelError, PanelSkeleton } from './right-panel-states';
import type { ChangesPanelState, DevtoolsPanelState, RightPanelCallbacks, RightPanelSnapshot } from './right-panel-types';

export function ChangesTabBody({
  project,
  state,
  callbacks,
}: {
  project: RightPanelSnapshot['project'];
  state: ChangesPanelState;
  callbacks: RightPanelCallbacks;
}) {
  if (state.status === 'loading') return <PanelSkeleton label="正在读取本机修复记录" />;
  if (state.status === 'error') {
    return <PanelError title="无法读取本机改动记录" message={state.message} retryId="changes" onRetry={state.onRetry} />;
  }
  if (!project) {
    return (
      <PanelEmpty
        icon="file-diff"
        title="未选择项目"
        description="选择项目并运行预检后，可在此查看经你确认的本机受限修复与备份点。"
        actionLabel="添加项目文件夹"
        actionIcon="plus"
        actionId="changes-manage-project"
        onAction={callbacks.onManageProject}
      />
    );
  }
  if (state.status === 'empty' || state.operations.length === 0) {
    return (
      <PanelEmpty
        icon="file-diff"
        title="暂无本机修复改动"
        description="上线船友不会自动改写项目文件；每项受限修复都需先预览完整前后文并由你确认。"
        actionLabel="查看本机修复记录"
        actionIcon="rotate-ccw"
        actionId="open-repair-history"
        onAction={callbacks.onOpenRepairHistory}
      />
    );
  }

  return (
    <div className="shell-pane-content">
      <div className="shell-pane-toolbar">
        <strong className="tabular">{state.operations.length} 条本机记录</strong>
        <span className="shell-spacer" />
        <InfoHint label="备份说明" content="每次受限写入前都会在本机保存原文件备份；手动或命令行产生的改动不在其中。" />
      </div>
      <ul className="shell-op-list" role="list">
        {state.operations.map(op => (
          <li key={op.operationId} className="shell-card shell-op-card">
            <div className="shell-op-card__row">
              <LucideSvg name="file-text" />
              <code className="shell-op-card__file">{op.file}</code>
              <time className="tabular shell-op-card__time" dateTime={new Date(op.createdAt).toISOString()}>
                {new Date(op.createdAt).toLocaleString('zh-CN', { hour12: false })}
              </time>
            </div>
            <p className="shell-op-card__summary">{op.summary}</p>
          </li>
        ))}
      </ul>
      <div className="shell-pane-actions">
        <button type="button" className="shell-btn" onClick={callbacks.onOpenRepairHistory}>
          <LucideSvg name="undo-2" size="sm" />
          <span>管理备份与撤销</span>
        </button>
        <button type="button" className="shell-btn shell-btn--plain" onClick={callbacks.onOpenRepair}>
          <span>检查可用修复</span>
        </button>
      </div>
    </div>
  );
}

export function DevtoolsTabBody({
  state,
  callbacks,
}: {
  state: DevtoolsPanelState;
  callbacks: RightPanelCallbacks;
}) {
  if (state.status === 'loading') return <PanelSkeleton label="正在检查微信开发者工具状态" />;
  if (state.status === 'error') {
    return <PanelError title="开发者工具状态读取失败" message={state.message} retryId="devtools" onRetry={state.onRetry} />;
  }

  return (
    <div className="shell-pane-content">
      <div className="shell-card shell-conn-card">
        <span className="shell-dot" aria-hidden="true" />
        <div className="shell-conn-card__copy">
          <strong>微信开发者工具</strong>
          <small>{state.note || '尚未接入本机连接检测 · 当前仅执行静态文件预检'}</small>
        </div>
      </div>

      <section className="shell-sec" aria-labelledby="panel-devtools-scope">
        <div className="shell-sec-h">
          <span id="panel-devtools-scope">连接边界</span>
          <span className="shell-spacer" />
          <InfoHint label="安全边界说明" content="连接检测只检查安装位置、本机服务端口与登录状态，不读取登录凭据或上传密钥，也不会替你提审或发布。" />
        </div>
        <ul className="shell-todo-list" role="list">
          <li>
            <LucideSvg name="shield" size="sm" />
            <span>不读取微信开发者工具登录凭据，也不保存任何会话令牌</span>
          </li>
          <li>
            <LucideSvg name="eye" size="sm" />
            <span>当前可直接使用本机静态代码预检、上线清单与拒因反查</span>
          </li>
          <li>
            <LucideSvg name="upload" size="sm" />
            <span>提审与发布上线始终由你在微信公众平台后台自行操作</span>
          </li>
        </ul>
      </section>

      <div className="shell-pane-actions">
        <button type="button" className="shell-btn shell-btn--primary" data-empty-action="open-tools" onClick={callbacks.onOpenTools}>
          <LucideSvg name="terminal" size="sm" />
          <span>打开本机预检控制台</span>
        </button>
      </div>
    </div>
  );
}
