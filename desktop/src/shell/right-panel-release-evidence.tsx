import { useEffect, useState } from 'react';
import { LucideSvg } from './lucide-svg';
import { InfoHint, PanelEmpty, PanelError, PanelSkeleton } from './right-panel-states';
import {
  isSafeHttpsUrl,
  SUBJECT_LABELS,
  type EvidencePanelState,
  type ReleasePanelState,
  type RightPanelCallbacks,
  type RightPanelSnapshot,
} from './right-panel-types';
import { InteractiveWorkflowBody, type ProjectWorkflowDraft } from './right-panel-workflow';

const SEVERITY_META = {
  blocker: { label: '阻断', tone: 'shell-pill--bad' },
  warning: { label: '提醒', tone: 'shell-pill--warn' },
  info: { label: '提示', tone: 'shell-pill--info' },
} as const;

const CONFIDENCE_LABELS = { high: '高', medium: '中', low: '低' } as const;

export function ReleaseTabBody({
  project,
  artifact,
  isBusy,
  state,
  draftsStore,
  callbacks,
}: {
  project: RightPanelSnapshot['project'];
  artifact?: RightPanelSnapshot['artifact'];
  isBusy?: boolean;
  state: ReleasePanelState;
  draftsStore?: Map<string, ProjectWorkflowDraft>;
  callbacks: RightPanelCallbacks;
}) {
  if (state.status === 'loading') return <PanelSkeleton label="正在读取上线阶段" />;
  if (state.status === 'error') {
    return <PanelError title="无法读取上线阶段" message={state.message} retryId="release" onRetry={state.onRetry} />;
  }
  if (!project || state.status === 'empty') {
    return (
      <PanelEmpty
        icon="folder"
        title="还没有选择项目"
        description="添加小程序项目文件夹后，可按主体类型跟踪准备阶段与本机预检。"
        actionLabel="添加项目文件夹"
        actionIcon="plus"
        actionId="manage-project"
        onAction={callbacks.onManageProject}
      />
    );
  }

  if (state.workflowBasis && state.workflowModel) {
    return (
      <InteractiveWorkflowBody
        key={state.workflowBasis.project.id}
        project={project}
        artifact={artifact}
        isBusy={isBusy}
        state={state}
        workflowBasis={state.workflowBasis}
        workflowModel={state.workflowModel}
        draftsStore={draftsStore}
        callbacks={callbacks}
      />
    );
  }

  const total = Math.max(1, state.totalCount);
  return (
    <div className="shell-pane-content">
      <div className="shell-meter">
        <strong className="tabular">{state.completedCount} / {state.totalCount}</strong>
        <span>阶段已确认或不适用</span>
        <span className="shell-spacer" />
        <InfoHint label="进度说明" content="按你人工确认的事实与本机预检记录汇总，不代表微信官方审核结论。" />
      </div>
      <div className="shell-bar" aria-hidden="true">
        {Array.from({ length: total }).map((_, idx) => {
          const stage = state.stages[idx];
          const done = stage?.status === 'confirmed' || stage?.status === 'not_applicable';
          const current = stage && state.nextAction?.stageId === stage.id;
          return <i key={stage?.id ?? idx} className={done ? 'is-ok' : current ? 'is-now' : undefined} />;
        })}
      </div>

      {state.nextAction ? (
        <div className="shell-card shell-next-card">
          <div className="shell-next-card__copy">
            <small>下一步 · {state.nextAction.title}</small>
            <strong>{state.nextAction.description}</strong>
          </div>
          <button type="button" className="shell-btn shell-btn--primary" onClick={callbacks.onOpenWorkflow}>
            去核对
          </button>
        </div>
      ) : null}

      <section className="shell-sec" aria-labelledby="panel-stages-heading">
        <div className="shell-sec-h">
          <span id="panel-stages-heading">阶段</span>
          <span className="shell-spacer" />
          <button type="button" className="shell-link-btn" onClick={callbacks.onOpenWorkflow}>
            完整视图
          </button>
        </div>
        <ul className="shell-steps" role="list">
          {state.stages.map(stage => {
            const done = stage.status === 'confirmed' || stage.status === 'not_applicable';
            const current = state.nextAction?.stageId === stage.id;
            const icon = done ? 'circle-check' : current ? 'circle-dot' : stage.status === 'unknown' ? 'circle-dashed' : 'circle';
            return (
              <li key={stage.id}>
                <button
                  type="button"
                  className={`shell-step${done ? ' is-ok' : ''}${current ? ' is-now' : ''}`}
                  onClick={callbacks.onOpenWorkflow}
                >
                  <LucideSvg name={icon} />
                  <span className="shell-step__title">{stage.title}</span>
                  <small className="shell-step__meta">{stage.summary}</small>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="shell-sec" aria-labelledby="panel-project-heading">
        <div className="shell-sec-h" id="panel-project-heading">项目</div>
        <dl className="shell-kv">
          <dt>名称</dt>
          <dd>{project.name}</dd>
          <dt>主体</dt>
          <dd>{SUBJECT_LABELS[project.subject] ?? '待确认'}</dd>
          <dt>目录</dt>
          <dd>{project.directoryAvailable === false ? '目录不可用，请重新定位' : '本机目录可用'}</dd>
          <dt>最近报告</dt>
          <dd className="tabular">
            {state.lastCheckSummary ??
              (artifact ? new Date(artifact.createdAt).toLocaleString('zh-CN', { hour12: false }) : '尚未运行预检')}
          </dd>
        </dl>
      </section>
    </div>
  );
}

export function EvidenceTabBody({
  artifactKey,
  state,
  callbacks,
}: {
  artifactKey?: string | null;
  state: EvidencePanelState;
  callbacks: RightPanelCallbacks;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const itemCount = state.status === 'ready' ? state.items.length : 0;

  useEffect(() => {
    setSelectedIndex(0);
  }, [artifactKey]);

  useEffect(() => {
    if (selectedIndex >= itemCount && itemCount > 0) setSelectedIndex(0);
  }, [itemCount, selectedIndex]);

  if (state.status === 'loading') return <PanelSkeleton label="正在解析报告依据" />;
  if (state.status === 'error') {
    return <PanelError title="无法读取规则依据" message={state.message} retryId="evidence" onRetry={state.onRetry} />;
  }
  if (state.status === 'empty' || state.items.length === 0) {
    return (
      <PanelEmpty
        icon="book-open"
        title={state.status === 'empty' && state.hasArtifact ? '当前报告没有结构化发现项' : '尚未选择依据条目'}
        description={
          state.status === 'empty' && state.hasArtifact
            ? '未匹配到结构化条目不代表审核通过，请打开完整报告结合业务事实人工核对。'
            : '运行项目预检或打开已保存报告后，可在此逐条核对官方原文、链接与核验日期。'
        }
        actionLabel={state.status === 'empty' && state.hasArtifact ? '阅读完整报告' : '运行项目预检'}
        actionIcon={state.status === 'empty' && state.hasArtifact ? 'file-text' : 'shield-check'}
        actionId={state.status === 'empty' && state.hasArtifact ? 'open-report' : 'run-check'}
        onAction={state.status === 'empty' && state.hasArtifact ? callbacks.onOpenReport : callbacks.onRunCheck}
      />
    );
  }

  const safeIndex = Math.min(selectedIndex, state.items.length - 1);
  const item = state.items[safeIndex];
  const sev = SEVERITY_META[item.severity] ?? SEVERITY_META.info;

  return (
    <div className="shell-pane-content">
      <div className="shell-pane-toolbar">
        <span className="shell-pane-counter tabular">{safeIndex + 1} / {state.items.length}</span>
        <span className="shell-spacer" />
        <button
          type="button"
          className="shell-icon-btn"
          aria-label="上一项依据"
          data-evidence-prev=""
          disabled={safeIndex <= 0}
          onClick={() => setSelectedIndex(i => Math.max(0, i - 1))}
        >
          <LucideSvg name="chevron-up" />
        </button>
        <button
          type="button"
          className="shell-icon-btn"
          aria-label="下一项依据"
          data-evidence-next=""
          disabled={safeIndex >= state.items.length - 1}
          onClick={() => setSelectedIndex(i => Math.min(state.items.length - 1, i + 1))}
        >
          <LucideSvg name="chevron-down" />
        </button>
      </div>

      <h2 className="shell-ev-title">{item.title}</h2>
      <div className="shell-ev-meta">
        <span className={`shell-pill ${sev.tone}`}>{sev.label}</span>
        {item.confidence ? (
          <span className="shell-pill">
            把握：{CONFIDENCE_LABELS[item.confidence]}
          </span>
        ) : null}
        <InfoHint label="把握度说明" content="把握度仅反映静态扫描线索与规则条款的对应程度，请对照下方官方原文确认。" />
        <code className="shell-ev-id">{item.ruleId}</code>
      </div>

      {item.location ? (
        <section className="shell-sec" aria-labelledby="panel-ev-loc">
          <div className="shell-sec-h" id="panel-ev-loc">位置线索</div>
          <div className="shell-code-loc">
            <code>{item.location}</code>
          </div>
        </section>
      ) : null}

      <section className="shell-sec" aria-labelledby="panel-ev-quote">
        <div className="shell-sec-h" id="panel-ev-quote">官方原文</div>
        <blockquote className="shell-quote">
          {item.sourceQuote || '该条目暂无内联引文，请打开官方链接或完整报告核对。'}
        </blockquote>
        <div className="shell-src-row">
          {isSafeHttpsUrl(item.officialUrl) ? (
            <button
              type="button"
              className="shell-link-btn shell-src-link"
              onClick={() => callbacks.onOpenSource(item.officialUrl!)}
            >
              <LucideSvg name="external-link" size="sm" />
              <span>{item.officialUrl.replace(/^https?:\/\//, '')}</span>
            </button>
          ) : null}
          {item.lastVerified ? <span className="tabular shell-src-date">核验于 {item.lastVerified}</span> : null}
        </div>
      </section>

      {item.requires.length > 0 ? (
        <section className="shell-sec" aria-labelledby="panel-ev-todo">
          <div className="shell-sec-h" id="panel-ev-todo">要做的事</div>
          <ul className="shell-todo-list" role="list">
            {item.requires.map((req, idx) => (
              <li key={idx}>
                <LucideSvg name="circle" size="sm" />
                <span>{req}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="shell-pane-actions">
        <button type="button" className="shell-btn" onClick={callbacks.onOpenReport}>
          <LucideSvg name="book-open" size="sm" />
          <span>阅读完整报告</span>
        </button>
      </div>
    </div>
  );
}
