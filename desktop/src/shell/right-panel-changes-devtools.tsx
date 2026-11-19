import { LucideSvg } from './lucide-svg';
import { InfoHint, PanelEmpty, PanelError, PanelSkeleton } from './right-panel-states';
import type { ChangesPanelState, DevtoolsConnectionStatus, DevtoolsPanelState, RightPanelCallbacks, RightPanelSnapshot } from './right-panel-types';

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

const DEVTOOLS_GUIDANCE: Record<
  DevtoolsConnectionStatus | 'empty' | 'browser' | 'loading' | 'error',
  { title: string; detail: string }
> = {
  empty: {
    title: '尚未检测',
    detail: '按需检查本机安装、运行、服务端口与登录状态。',
  },
  browser: {
    title: '请在 Windows 桌面应用中检测',
    detail: '也可在微信开发者工具内手动核对服务端口和登录状态。',
  },
  loading: {
    title: '正在检查微信开发者工具状态',
    detail: '',
  },
  error: {
    title: '开发者工具状态读取失败',
    detail: '请重新检测，或在微信开发者工具内核对服务端口和登录状态。',
  },
  not_detected: {
    title: '未检测到安装',
    detail: '已安装时可以手动选择安装目录，或查看官方下载。',
  },
  not_running: {
    title: '请先打开工具',
    detail: '打开微信开发者工具后重新检测。',
  },
  port_unavailable: {
    title: '请检查服务端口',
    detail: '在微信开发者工具的「设置 → 安全设置」中核对服务端口，然后重新检测。',
  },
  signed_out: {
    title: '请在工具内登录',
    detail: '在微信开发者工具内完成登录后重新检测。',
  },
  ready: {
    title: '已就绪',
    detail: '服务端口可用，微信开发者工具已登录。',
  },
  manual_check: {
    title: '请手动核对',
    detail: '在微信开发者工具内核对服务端口和登录状态，保留现有访问令牌设置。',
  },
  unsupported: {
    title: '请手动核对',
    detail: '在微信开发者工具内核对服务端口和登录状态。本机检测适用于 Windows 桌面应用。',
  },
};

export function DevtoolsTabBody({
  state,
  callbacks,
}: {
  state: DevtoolsPanelState;
  callbacks: RightPanelCallbacks;
}) {
  const checking = state.status === 'loading';
  const current = state.status === 'loading' ? state.previous : state;
  const result = current?.status === 'result' ? current : null;
  const initialStatus = callbacks.onCheckDevtools ? 'empty' : 'browser';
  const fallbackStatus = current?.status === 'error' ? 'error' : initialStatus;
  const guidance = DEVTOOLS_GUIDANCE[checking ? 'loading' : (result?.connection ?? fallbackStatus)];

  return (
    <div className="shell-pane-content">
      <div className="shell-card shell-conn-card">
        <span className="shell-dot" aria-hidden="true" />
        <div className="shell-conn-card__copy">
          <strong>微信开发者工具</strong>
          <div id="panel-devtools-status" role="status" aria-atomic="true">
            <small>
              {guidance.title}
              {!checking && result?.version ? ` · 版本 ${result.version}` : null}
            </small>
            {guidance.detail ? <small>{guidance.detail}</small> : null}
          </div>
        </div>
      </div>

      {callbacks.onCheckDevtools ? (
        <div className="shell-pane-actions" aria-busy={checking || undefined}>
          <button
            type="button"
            className="shell-btn shell-btn--primary"
            data-devtools-action="check"
            aria-disabled={checking || undefined}
            onClick={() => callbacks.onCheckDevtools?.(false)}
          >
            <LucideSvg name={checking ? 'loader-circle' : 'refresh-cw'} size="sm" className={checking ? 'shell-ic--spin' : undefined} />
            <span>{checking ? '正在检测…' : current?.status === 'empty' ? '检测连接' : '重新检测'}</span>
          </button>
          {result?.connection === 'not_detected' || result?.connection === 'manual_check' ? (
            <button
              type="button"
              className="shell-btn"
              data-devtools-action="choose-install"
              aria-disabled={checking || undefined}
              onClick={() => callbacks.onCheckDevtools?.(true)}
            >
              <LucideSvg name="folder-open" size="sm" />
              <span>选择安装目录</span>
            </button>
          ) : null}
          {result?.connection === 'not_detected' ? (
            <button
              type="button"
              className="shell-btn shell-btn--plain"
              data-devtools-action="download"
              onClick={() => callbacks.onOpenSource('https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html')}
            >
              查看官方下载
            </button>
          ) : null}
        </div>
      ) : null}

      <section className="shell-sec" aria-labelledby="panel-devtools-scope">
        <div className="shell-sec-h">
          <span id="panel-devtools-scope">连接边界</span>
          <InfoHint label="安全边界说明" content="连接检测由你发起并在本机完成。登录凭据由微信开发者工具自行管理。" />
        </div>
        <ul className="shell-todo-list" role="list">
          <li>
            <LucideSvg name="shield" size="sm" />
            <span>登录与服务端口设置在微信开发者工具内完成</span>
          </li>
          <li>
            <LucideSvg name="upload" size="sm" />
            <span>在微信公众平台后台自行提审与发布</span>
          </li>
        </ul>
      </section>

      <div className="shell-pane-actions">
        <button
          type="button"
          className={callbacks.onCheckDevtools ? 'shell-btn' : 'shell-btn shell-btn--primary'}
          data-empty-action="open-tools"
          onClick={callbacks.onOpenTools}
        >
          <LucideSvg name="terminal" size="sm" />
          <span>打开本机预检控制台</span>
        </button>
      </div>
    </div>
  );
}
