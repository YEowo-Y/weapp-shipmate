import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { Project, ProjectFacts } from '../projects';
import type { WorkflowResult, WorkflowStage } from '../shared';
import { LucideSvg } from './lucide-svg';
import { InfoHint } from './right-panel-states';
import {
  isSafeHttpsUrl,
  STAGE_LABELS,
  SUBJECT_LABELS,
  type ReleasePanelState,
  type RightPanelCallbacks,
  type RightPanelSnapshot,
  type WorkflowBasisSnapshot,
} from './right-panel-types';

export type ProjectWorkflowDraft = {
  subject?: string;
  facts: Partial<ProjectFacts>;
  factsBasis?: string;
  notes: Map<string, string>;
  noteBases: Map<string, string>;
  invalidNotes: Set<string>;
  expanded: Set<string>;
  factsOpen?: boolean;
};

function computeFactsBasis(project: Project): string {
  return JSON.stringify([
    project.contextRevision ?? 0,
    project.facts?.businessType ?? '',
    project.facts?.hasPayment ?? null,
    project.facts?.collectsSensitive ?? null,
    project.facts?.hasServerDomain ?? null,
  ]);
}

function computeNoteBasis(basis: WorkflowBasisSnapshot, stage: WorkflowStage | undefined): string {
  return JSON.stringify([
    basis.project.contextRevision ?? 0,
    basis.rulesVersion,
    stage?.confirmation ?? null,
  ]);
}

function formatBoolFact(value: boolean | null | undefined): string {
  return value == null ? '尚未确认' : value ? '是' : '否';
}

export function InteractiveWorkflowBody({
  project,
  artifact,
  isBusy,
  state,
  workflowBasis,
  workflowModel,
  draftsStore,
  callbacks,
}: {
  project: Project;
  artifact?: RightPanelSnapshot['artifact'];
  isBusy?: boolean;
  state: Extract<ReleasePanelState, { status: 'ready' }>;
  workflowBasis: WorkflowBasisSnapshot;
  workflowModel: WorkflowResult;
  draftsStore?: Map<string, ProjectWorkflowDraft>;
  callbacks: RightPanelCallbacks;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(true);
  const fallbackDraftsRef = useRef<Map<string, ProjectWorkflowDraft>>(new Map());
  const draftsMap = draftsStore ?? fallbackDraftsRef.current;
  const [, bumpRender] = useState(0);
  const [pendingOp, setPendingOp] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; tone: 'neutral' | 'error' }>({
    text: '',
    tone: 'neutral',
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const forceRender = () => {
    if (mountedRef.current) bumpRender(v => v + 1);
  };

  const getDraft = (projectId: string): ProjectWorkflowDraft => {
    let draft = draftsMap.get(projectId);
    if (!draft) {
      draft = {
        facts: {},
        notes: new Map(),
        noteBases: new Map(),
        invalidNotes: new Set(),
        expanded: new Set(),
      };
      draftsMap.set(projectId, draft);
    }
    return draft;
  };

  const activeProject = workflowBasis.project.id === project.id ? workflowBasis.project : project;
  const latestProjectIdRef = useRef(activeProject.id);
  latestProjectIdRef.current = activeProject.id;

  const draft = getDraft(activeProject.id);
  const blocked = Boolean(isBusy || pendingOp || workflowBasis.project.id !== project.id);

  const currentFactsBasis = computeFactsBasis(activeProject);
  const hasFactsConflict = draft.factsBasis !== undefined && draft.factsBasis !== currentFactsBasis;
  const hasFactsDraft = Object.keys(draft.facts).length > 0;

  const unknownFactCount =
    (['hasPayment', 'collectsSensitive', 'hasServerDomain'] as const).filter(
      key => activeProject.facts?.[key] == null,
    ).length + (activeProject.facts?.businessType?.trim() ? 0 : 1);

  const isFactsOpen = hasFactsConflict || (draft.factsOpen ?? unknownFactCount > 0);
  const selectedSubject = draft.subject ?? activeProject.subject ?? 'personal';
  const isSubjectDirty = selectedSubject !== activeProject.subject;

  const businessValue = draft.facts.businessType ?? activeProject.facts?.businessType ?? '';
  const readTriState = (key: 'hasPayment' | 'collectsSensitive' | 'hasServerDomain'): string => {
    const val = Object.hasOwn(draft.facts, key) ? draft.facts[key] : activeProject.facts?.[key];
    return val == null ? 'unknown' : String(val);
  };

  const nextAction = workflowModel.nextAction;
  const nextStage = nextAction ? workflowModel.stages.find(s => s.id === nextAction.stageId) : undefined;
  const nextNeedsFact = nextStage?.applicability === null;

  const runOperation = async (fn: (isStillActive: () => boolean) => Promise<void>) => {
    if (blocked) return;
    const expectedProjectId = activeProject.id;
    const isStillActive = () => mountedRef.current && latestProjectIdRef.current === expectedProjectId;
    setPendingOp(true);
    try {
      await fn(isStillActive);
    } catch (err) {
      if (isStillActive()) {
        setStatusMessage({
          text: String(err instanceof Error ? err.message : err),
          tone: 'error',
        });
      }
    } finally {
      if (mountedRef.current) setPendingOp(false);
    }
  };

  const handleNextStepClick = () => {
    if (!nextAction || blocked) return;
    if (nextNeedsFact) {
      flushSync(() => {
        draft.factsOpen = true;
        forceRender();
      });
      const factsDetails = rootRef.current?.ownerDocument.getElementById(
        'panel-workflow-facts',
      ) as HTMLDetailsElement | null;
      if (factsDetails) factsDetails.open = true;
      const field =
        nextAction.stageId === 'privacy'
          ? 'collectsSensitive'
          : nextAction.stageId === 'domain'
            ? 'hasServerDomain'
            : 'businessType';
      const target = rootRef.current?.ownerDocument.getElementById(`panel-workflow-${field}`);
      target?.focus({ preventScroll: true });
      target?.scrollIntoView?.({ block: 'nearest' });
      return;
    }
    flushSync(() => {
      draft.expanded.add(nextAction.stageId);
      forceRender();
    });
    const stageDetails = rootRef.current?.querySelector<HTMLDetailsElement>(
      `details.shell-stage[data-stage="${nextAction.stageId}"]`,
    );
    if (stageDetails) stageDetails.open = true;
    const summary = rootRef.current?.ownerDocument.getElementById(`panel-stage-summary-${nextAction.stageId}`);
    summary?.focus({ preventScroll: true });
    summary?.scrollIntoView?.({ block: 'nearest' });
  };

  const handleSubjectSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (blocked || !isSubjectDirty || !callbacks.onSaveSubject) return;
    const savingProjectId = activeProject.id;
    const targetSubject = selectedSubject;
    void runOperation(async isStillActive => {
      const ok = await callbacks.onSaveSubject!(savingProjectId, targetSubject);
      if (ok) {
        delete draft.subject;
        if (isStillActive()) {
          setStatusMessage({ text: '项目主体已保存，阶段要求与类目线索已按新主体更新。', tone: 'neutral' });
        }
      } else if (isStillActive()) {
        setStatusMessage({
          text: '未能保存主体类型，请先处理项目设置中的未保存更改并确认项目目录可用后重试。',
          tone: 'error',
        });
      }
    });
  };

  const updateFactDraft = (
    key: 'businessType' | 'hasPayment' | 'collectsSensitive' | 'hasServerDomain',
    rawValue: string,
  ) => {
    if (blocked) return;
    draft.factsBasis ??= currentFactsBasis;
    if (key === 'businessType') {
      draft.facts.businessType = rawValue;
    } else {
      draft.facts[key] = rawValue === 'unknown' ? null : rawValue === 'true';
    }
    forceRender();
  };

  const handleFactsSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (blocked || !callbacks.onSaveFacts) return;
    if (hasFactsConflict) {
      setStatusMessage({
        text: '已保存事实已变化，草稿已保留。请先处理冲突，不能覆盖新事实。',
        tone: 'error',
      });
      return;
    }
    const nextFacts: ProjectFacts = {
      businessType: businessValue.trim(),
      hasPayment: readTriState('hasPayment') === 'unknown' ? null : readTriState('hasPayment') === 'true',
      collectsSensitive:
        readTriState('collectsSensitive') === 'unknown' ? null : readTriState('collectsSensitive') === 'true',
      hasServerDomain:
        readTriState('hasServerDomain') === 'unknown' ? null : readTriState('hasServerDomain') === 'true',
    };
    const expectedRevision = activeProject.revision;
    const savingProjectId = activeProject.id;
    void runOperation(async isStillActive => {
      await callbacks.onSaveFacts!(savingProjectId, expectedRevision, nextFacts);
      draft.facts = {};
      delete draft.factsBasis;
      if (isStillActive()) {
        setStatusMessage({
          text: '项目事实已保存。可更新上线清单，历史报告仍保留原有内容。',
          tone: 'neutral',
        });
      }
    });
  };

  const handleFactsDiscard = () => {
    if (blocked) return;
    draft.facts = {};
    delete draft.factsBasis;
    setStatusMessage({ text: '已放弃事实草稿，显示当前已保存事实。', tone: 'neutral' });
    forceRender();
    rootRef.current?.ownerDocument.getElementById('panel-workflow-businessType')?.focus({ preventScroll: true });
  };

  const handleExport = () => {
    if (blocked || !callbacks.onExportWorkflow) return;
    try {
      const ok = callbacks.onExportWorkflow(workflowBasis);
      setStatusMessage({
        text: ok ? '已发起下载，清单仅包含已保存的事实与确认记录。' : '无法下载准备清单，请重试。',
        tone: ok ? 'neutral' : 'error',
      });
    } catch {
      setStatusMessage({ text: '无法下载准备清单，请重新加载后重试。', tone: 'error' });
    }
  };

  const handleGenerateGuide = () => {
    if (blocked || !callbacks.onGenerateGuide) return;
    if (hasFactsDraft) {
      setStatusMessage({ text: '请先保存项目事实，再更新上线清单。', tone: 'error' });
      return;
    }
    const targetProjectId = activeProject.id;
    void runOperation(async isStillActive => {
      if (isStillActive()) {
        setStatusMessage({ text: '正在根据已保存事实生成上线清单…', tone: 'neutral' });
      }
      await callbacks.onGenerateGuide!(targetProjectId);
      if (isStillActive()) {
        setStatusMessage({ text: '新上线清单已保存，可在「依据」标签或左侧「运行与报告」中查看。', tone: 'neutral' });
      }
    });
  };

  const handleStageAction = (stage: WorkflowStage, nextState: 'confirmed' | 'not_applicable' | 'pending') => {
    if (blocked || !callbacks.onConfirmStage) return;
    const savedNoteBasis = draft.noteBases.get(stage.id);
    const staleNote =
      savedNoteBasis !== undefined && savedNoteBasis !== computeNoteBasis(workflowBasis, stage);
    if (staleNote) {
      setStatusMessage({ text: '旧备注的依据已变化，请先放弃旧备注并重新核对。', tone: 'error' });
      return;
    }
    if (
      nextState !== 'pending' &&
      (stage.blockedBy.length > 0 || stage.applicability !== (nextState === 'confirmed'))
    ) {
      setStatusMessage({
        text: '请先确认适用事实并完成前置阶段；仅不适用阶段可标记不适用。',
        tone: 'error',
      });
      return;
    }
    const noteText = (draft.notes.get(stage.id) ?? '').trim();
    if (nextState === 'not_applicable' && !noteText) {
      flushSync(() => {
        draft.expanded.add(stage.id);
        draft.invalidNotes.add(stage.id);
        setStatusMessage({ text: '请填写不适用原因，再标记不适用。', tone: 'error' });
        forceRender();
      });
      const stageDetails = rootRef.current?.querySelector<HTMLDetailsElement>(
        `details.shell-stage[data-stage="${stage.id}"]`,
      );
      if (stageDetails) stageDetails.open = true;
      rootRef.current?.ownerDocument.getElementById(`panel-stage-note-${stage.id}`)?.focus({ preventScroll: true });
      return;
    }

    const savingProjectId = activeProject.id;
    const expectedRevision = activeProject.revision;
    const expectedRulesVersion = workflowBasis.rulesVersion;
    void runOperation(async isStillActive => {
      await callbacks.onConfirmStage!({
        projectId: savingProjectId,
        expectedRevision,
        expectedRulesVersion,
        stageId: stage.id,
        state: nextState,
        note: noteText,
      });
      draft.notes.delete(stage.id);
      draft.noteBases.delete(stage.id);
      draft.invalidNotes.delete(stage.id);
      if (isStillActive()) {
        setStatusMessage({ text: '已保存。人工标记仅用于本项目本机准备记录。', tone: 'neutral' });
      }
    });
  };

  const total = Math.max(1, workflowModel.stages.length);
  const completedCount = workflowModel.stages.filter(
    s => s.status === 'confirmed' || s.status === 'not_applicable',
  ).length;

  const factsSummaryText = hasFactsConflict
    ? '已保存事实已变化 · 草稿待核对'
    : `${unknownFactCount ? `${unknownFactCount} 项待补充` : '已填写，仍需人工核对'}${hasFactsDraft ? ' · 有未保存更改' : ''}`;

  return (
    <div ref={rootRef} className="shell-pane-content">
      <div className="shell-meter">
        <strong className="tabular">{completedCount} / {workflowModel.stages.length}</strong>
        <span>阶段已确认或不适用</span>
        <span className="shell-spacer" />
        <InfoHint label="进度说明" content="按你人工确认的事实与本机预检记录汇总，不代表微信官方审核结论。" />
      </div>
      <div className="shell-bar" aria-hidden="true">
        {Array.from({ length: total }).map((_, idx) => {
          const stage = workflowModel.stages[idx];
          const done = stage?.status === 'confirmed' || stage?.status === 'not_applicable';
          const current = stage && nextAction?.stageId === stage.id;
          return <i key={stage?.id ?? idx} className={done ? 'is-ok' : current ? 'is-now' : undefined} />;
        })}
      </div>

      <p
        id="panel-workflow-status"
        className="shell-wf-status"
        role="status"
        aria-live="polite"
        data-tone={statusMessage.tone}
        hidden={!statusMessage.text}
      >
        {statusMessage.text}
      </p>

      {nextAction ? (
        <div className="shell-card shell-next-card">
          <div className="shell-next-card__copy">
            <small>下一步 · {nextAction.title}</small>
            <strong>{nextAction.description}</strong>
          </div>
          <button
            type="button"
            id="panel-workflow-next-btn"
            className="shell-btn shell-btn--primary"
            disabled={blocked}
            onClick={handleNextStepClick}
          >
            {nextNeedsFact ? '补充项目事实' : '去核对'}
          </button>
        </div>
      ) : (
        <div className="shell-card shell-next-card">
          <div className="shell-next-card__copy">
            <small>全部阶段已标记</small>
            <strong>所有阶段已人工标记，请仍以微信公众平台实际状态为准。</strong>
          </div>
        </div>
      )}

      {/* Inline Subject Switcher (explicit submit per modern-web-guidance `forms`) */}
      <form className="shell-wf-subject" aria-label="项目主体类型" onSubmit={handleSubjectSubmit}>
        <label htmlFor="panel-workflow-subject" className="shell-wf-label">主体类型</label>
        <div className="shell-wf-subject__row">
          <select
            id="panel-workflow-subject"
            name="subject"
            className="shell-wf-select"
            value={selectedSubject}
            disabled={blocked || !callbacks.onSaveSubject}
            onChange={e => {
              draft.subject = e.target.value;
              forceRender();
            }}
          >
            <option value="personal">个人</option>
            <option value="individual_business">个体工商户</option>
            <option value="enterprise">企业</option>
          </select>
          <button
            type="submit"
            id="panel-workflow-subject-save"
            className="shell-btn"
            disabled={blocked || !isSubjectDirty || !callbacks.onSaveSubject}
          >
            保存主体
          </button>
        </div>
      </form>

      {/* Collapsible Project Facts Disclosure */}
      <details
        id="panel-workflow-facts"
        className="shell-wf-facts"
        open={isFactsOpen}
        onToggle={e => {
          const nextOpen = (e.currentTarget as HTMLDetailsElement).open;
          if (draft.factsOpen !== nextOpen) {
            draft.factsOpen = nextOpen;
            forceRender();
          }
        }}
      >
        <summary className="shell-wf-facts__summary">
          <LucideSvg name="chevron-right" size="sm" className="shell-wf-chevron" />
          <span>项目事实</span>
          <small id="panel-workflow-facts-summary" className="shell-wf-facts__meta">{factsSummaryText}</small>
        </summary>
        <form id="panel-workflow-facts-form" className="shell-wf-form" onSubmit={handleFactsSubmit}>
          <div className="shell-wf-field">
            <label htmlFor="panel-workflow-businessType" className="shell-wf-label">实际业务</label>
            <textarea
              id="panel-workflow-businessType"
              name="businessType"
              className="shell-wf-textarea"
              rows={2}
              maxLength={1000}
              placeholder="例如：餐饮门店预约，到店付款"
              aria-describedby="panel-workflow-facts-note"
              value={businessValue}
              disabled={blocked}
              onChange={e => updateFactDraft('businessType', e.target.value)}
            />
          </div>

          <div className="shell-wf-grid">
            <div className="shell-wf-field">
              <label htmlFor="panel-workflow-hasPayment" className="shell-wf-label">是否涉及支付</label>
              <select
                id="panel-workflow-hasPayment"
                name="hasPayment"
                className="shell-wf-select"
                value={readTriState('hasPayment')}
                disabled={blocked}
                onChange={e => updateFactDraft('hasPayment', e.target.value)}
              >
                <option value="unknown">尚未确认</option>
                <option value="true">是</option>
                <option value="false">否</option>
              </select>
            </div>
            <div className="shell-wf-field">
              <label htmlFor="panel-workflow-collectsSensitive" className="shell-wf-label">是否收集敏感信息</label>
              <select
                id="panel-workflow-collectsSensitive"
                name="collectsSensitive"
                className="shell-wf-select"
                value={readTriState('collectsSensitive')}
                disabled={blocked}
                onChange={e => updateFactDraft('collectsSensitive', e.target.value)}
              >
                <option value="unknown">尚未确认</option>
                <option value="true">是</option>
                <option value="false">否</option>
              </select>
            </div>
            <div className="shell-wf-field">
              <label htmlFor="panel-workflow-hasServerDomain" className="shell-wf-label">是否使用服务器域名</label>
              <select
                id="panel-workflow-hasServerDomain"
                name="hasServerDomain"
                className="shell-wf-select"
                value={readTriState('hasServerDomain')}
                disabled={blocked}
                onChange={e => updateFactDraft('hasServerDomain', e.target.value)}
              >
                <option value="unknown">尚未确认</option>
                <option value="true">是</option>
                <option value="false">否</option>
              </select>
            </div>
          </div>

          <p id="panel-workflow-facts-note" className="shell-wf-hint">
            未知不会视为“否”。业务与支付仅提供规则线索，不能自动判断资质。事实变更后，旧确认需重新核对。
          </p>

          <div
            id="panel-workflow-facts-conflict"
            className="shell-wf-conflict"
            role="status"
            hidden={!hasFactsConflict}
          >
            {hasFactsConflict ? (
              <>
                <p>
                  {`已保存事实已变化，草稿保留但暂不能保存。当前已保存：业务「${activeProject.facts?.businessType || '未填写'}」；支付：${formatBoolFact(activeProject.facts?.hasPayment)}；敏感信息：${formatBoolFact(activeProject.facts?.collectsSensitive)}；服务器域名：${formatBoolFact(activeProject.facts?.hasServerDomain)}。`}
                </p>
                <button
                  type="button"
                  id="panel-workflow-facts-discard"
                  className="shell-btn"
                  disabled={blocked}
                  onClick={handleFactsDiscard}
                >
                  放弃草稿，使用已加载事实
                </button>
              </>
            ) : null}
          </div>

          <div className="shell-wf-actions">
            <button
              type="submit"
              id="panel-workflow-save-facts"
              className="shell-btn shell-btn--primary"
              disabled={blocked || hasFactsConflict || !callbacks.onSaveFacts}
            >
              保存项目事实
            </button>
            <button
              type="button"
              id="panel-workflow-generate-guide"
              className="shell-btn"
              aria-describedby="panel-workflow-guide-note"
              disabled={blocked || hasFactsDraft || !callbacks.onGenerateGuide}
              onClick={handleGenerateGuide}
            >
              更新上线清单
            </button>
            <button
              type="button"
              id="panel-workflow-export"
              className="shell-btn"
              disabled={blocked || !callbacks.onExportWorkflow}
              onClick={handleExport}
            >
              导出准备清单
            </button>
          </div>
          <p id="panel-workflow-guide-note" className="shell-wf-hint">
            {hasFactsDraft
              ? '请先保存项目事实，再更新上线清单。'
              : '根据已保存事实生成新清单；导出仅包含已保存记录。'}
          </p>
        </form>
      </details>

      {/* Non-exclusive 8-stage accordion (`flow.yaml` order, zero headings inside <summary>) */}
      <section className="shell-sec" aria-labelledby="panel-stages-heading">
        <div className="shell-sec-h">
          <span id="panel-stages-heading">阶段（共 {workflowModel.stages.length} 步）</span>
          <span className="shell-spacer" />
          <button
            type="button"
            id="panel-workflow-open-full"
            className="shell-link-btn"
            onClick={callbacks.onOpenWorkflow}
          >
            完整视图
          </button>
        </div>

        <div className="shell-stage-list">
          {workflowModel.stages.map((stage, index) => {
            const done = stage.status === 'confirmed' || stage.status === 'not_applicable';
            const current = nextAction?.stageId === stage.id;
            const icon = done
              ? 'circle-check'
              : current
                ? 'circle-dot'
                : stage.status === 'unknown'
                  ? 'circle-dashed'
                  : 'circle';
            const isOpen = draft.expanded.has(stage.id);
            const noteValue = draft.notes.get(stage.id) ?? '';
            const savedNoteBasis = draft.noteBases.get(stage.id);
            const staleNote =
              savedNoteBasis !== undefined && savedNoteBasis !== computeNoteBasis(workflowBasis, stage);
            const isNoteInvalid = draft.invalidNotes.has(stage.id);
            const noteHintId = `panel-stage-note-hint-${stage.id}`;
            const noteErrorId = `panel-stage-error-${stage.id}`;

            const seenSources = new Set<string>();
            const uniqueSources = stage.sources.filter(src => {
              if (!isSafeHttpsUrl(src.url) || seenSources.has(src.url)) return false;
              seenSources.add(src.url);
              return true;
            });

            return (
              <details
                key={stage.id}
                className={`shell-stage${done ? ' is-ok' : ''}${current ? ' is-now' : ''}`}
                data-stage={stage.id}
                data-state={stage.status}
                open={isOpen}
                onToggle={e => {
                  const nextOpen = (e.currentTarget as HTMLDetailsElement).open;
                  if (draft.expanded.has(stage.id) !== nextOpen) {
                    if (nextOpen) draft.expanded.add(stage.id);
                    else draft.expanded.delete(stage.id);
                    forceRender();
                  }
                }}
              >
                <summary
                  id={`panel-stage-summary-${stage.id}`}
                  className="shell-stage__summary"
                  aria-current={current ? 'step' : undefined}
                >
                  <LucideSvg name={icon} className="shell-stage__status-ic" />
                  <span className="shell-stage__num tabular" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="shell-stage__title">{stage.title}</span>
                  <small className="shell-stage__meta">{STAGE_LABELS[stage.status] ?? stage.status}</small>
                  <LucideSvg name="chevron-right" size="sm" className="shell-wf-chevron" />
                </summary>

                <div className="shell-stage__body">
                  <p className="shell-stage__action">{stage.action}</p>
                  {stage.blockedBy.length > 0 ? (
                    <p className="shell-wf-hint">
                      前置阶段待核对：
                      {stage.blockedBy
                        .map(id => workflowModel.stages.find(item => item.id === id)?.title ?? id)
                        .join('、')}
                    </p>
                  ) : null}
                  <p className="shell-wf-hint">{stage.coverage.note}</p>

                  {stage.items.length > 0 ? (
                    <ul className="shell-stage__items" role="list">
                      {stage.items.map(item => (
                        <li key={item.ruleId} className="shell-stage__item">
                          <strong>{item.title}</strong>
                          {item.conditional ? (
                            <p className="shell-wf-hint">
                              {item.signal.length
                                ? `条件线索：${item.signal.join('、')}；请人工判断是否适用。`
                                : '请先核对是否使用相关接口、组件或配置；条件成立时再处理本项要求。'}
                            </p>
                          ) : null}
                          {item.requires.map((req, reqIdx) => (
                            <p key={reqIdx} className="shell-stage__req">{req}</p>
                          ))}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {uniqueSources.length > 0 ? (
                    <div className="shell-stage__sources">
                      {uniqueSources.map(src => (
                        <div key={src.url} className="shell-src-row">
                          <button
                            type="button"
                            className="shell-link-btn shell-src-link"
                            aria-label={`官方来源 · ${stage.title}`}
                            onClick={() => callbacks.onOpenSource(src.url)}
                          >
                            <LucideSvg name="external-link" size="sm" />
                            <span>官方来源</span>
                          </button>
                          {src.lastVerified ? (
                            <span className="tabular shell-src-date">核验于 {src.lastVerified}</span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {stage.confirmation ? (
                    <p className="shell-wf-hint tabular">
                      {`上次记录：${new Date(stage.confirmation.recordedAt).toLocaleString('zh-CN', { hour12: false })} · ${stage.confirmation.note || '无备注'}`}
                    </p>
                  ) : null}

                  <div className="shell-wf-field">
                    <label htmlFor={`panel-stage-note-${stage.id}`} className="shell-wf-label">
                      核对备注或不适用原因
                    </label>
                    <textarea
                      id={`panel-stage-note-${stage.id}`}
                      className="shell-wf-textarea"
                      rows={2}
                      maxLength={2000}
                      placeholder="核对备注；标记不适用时必须填写原因"
                      aria-invalid={isNoteInvalid ? 'true' : 'false'}
                      aria-describedby={isNoteInvalid ? `${noteHintId} ${noteErrorId}` : noteHintId}
                      value={noteValue}
                      disabled={blocked}
                      onChange={e => {
                        const nextVal = e.target.value;
                        if (!staleNote && nextVal === '') {
                          draft.notes.delete(stage.id);
                          draft.noteBases.delete(stage.id);
                        } else {
                          if (!draft.noteBases.has(stage.id)) {
                            draft.noteBases.set(stage.id, computeNoteBasis(workflowBasis, stage));
                          }
                          draft.notes.set(stage.id, nextVal);
                        }
                        if (nextVal.trim() && draft.invalidNotes.delete(stage.id)) {
                          if (statusMessage.tone === 'error') {
                            setStatusMessage({ text: '', tone: 'neutral' });
                          }
                        }
                        forceRender();
                      }}
                    />
                    {isNoteInvalid ? (
                      <p id={noteErrorId} className="shell-wf-error">
                        <span role="img" aria-label="错误">!</span> 请填写不适用原因后再标记不适用。
                      </p>
                    ) : null}
                    <p id={noteHintId} className="shell-wf-hint">
                      {staleNote
                        ? '项目依据、规则或本阶段记录已变化。旧备注已保留，暂不能提交；请先复制需要保留的文字，放弃旧备注后重新核对。'
                        : '未保存的备注仅在本次应用运行期间保留。'}
                    </p>
                  </div>

                  {staleNote ? (
                    <button
                      type="button"
                      id={`panel-stage-note-discard-${stage.id}`}
                      className="shell-btn"
                      disabled={blocked}
                      onClick={() => {
                        draft.notes.delete(stage.id);
                        draft.noteBases.delete(stage.id);
                        draft.invalidNotes.delete(stage.id);
                        if (statusMessage.tone === 'error') {
                          setStatusMessage({ text: '', tone: 'neutral' });
                        }
                        forceRender();
                        rootRef.current?.ownerDocument
                          .getElementById(`panel-stage-note-${stage.id}`)
                          ?.focus({ preventScroll: true });
                      }}
                    >
                      放弃旧备注，重新核对
                    </button>
                  ) : null}

                  <div className="shell-wf-actions">
                    {(
                      [
                        ['confirmed', 'confirm', '人工确认'],
                        ['not_applicable', 'not-applicable', '标记不适用'],
                        ['pending', 'reset', '撤销确认'],
                      ] as const
                    ).map(([actionState, slug, label]) => {
                      const actionBlocked =
                        staleNote ||
                        (actionState !== 'pending' &&
                          (stage.blockedBy.length > 0 ||
                            stage.applicability !== (actionState === 'confirmed')));
                      return (
                        <button
                          key={actionState}
                          type="button"
                          id={`panel-stage-${slug}-${stage.id}`}
                          className="shell-btn"
                          aria-label={`${label} · ${stage.title}`}
                          data-workflow-blocked={actionBlocked ? 'true' : undefined}
                          disabled={blocked || actionBlocked || !callbacks.onConfirmStage}
                          title={
                            staleNote
                              ? '请先处理旧备注并重新核对。'
                              : actionBlocked
                                ? '请先确认适用事实并完成前置阶段；仅不适用阶段可标记不适用。'
                                : undefined
                          }
                          onClick={() => handleStageAction(stage, actionState)}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      </section>

      {/* Category & Qualification Clues */}
      <section className="shell-sec" aria-labelledby="panel-categories-heading">
        <div className="shell-sec-h" id="panel-categories-heading">类目与资质线索</div>
        {workflowModel.categoryCandidates.length === 0 ? (
          <p className="shell-wf-hint">
            暂无匹配线索。请根据实际业务对照官方服务类目，未匹配不表示无需资质。
          </p>
        ) : (
          <div className="shell-wf-clues">
            {workflowModel.categoryCandidates.map(candidate => (
              <article key={candidate.ruleId} className="shell-card shell-wf-clue">
                <strong className="shell-wf-clue__title">{candidate.title}</strong>
                <p className="shell-wf-hint">{candidate.reason}</p>
                {candidate.requires.map((req, idx) => (
                  <p key={idx} className="shell-stage__req">{req}</p>
                ))}
                {isSafeHttpsUrl(candidate.official_url) ? (
                  <div className="shell-src-row">
                    <button
                      type="button"
                      className="shell-link-btn shell-src-link"
                      aria-label={`官方来源 · ${candidate.title}`}
                      onClick={() => callbacks.onOpenSource(candidate.official_url!)}
                    >
                      <LucideSvg name="external-link" size="sm" />
                      <span>官方来源</span>
                    </button>
                    {candidate.last_verified ? (
                      <span className="tabular shell-src-date">核验于 {candidate.last_verified}</span>
                    ) : null}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Project Summary Card */}
      <section className="shell-sec" aria-labelledby="panel-project-heading">
        <div className="shell-sec-h" id="panel-project-heading">项目</div>
        <dl className="shell-kv">
          <dt>名称</dt>
          <dd>{activeProject.name}</dd>
          <dt>主体</dt>
          <dd>{SUBJECT_LABELS[activeProject.subject] ?? '待确认'}</dd>
          <dt>目录</dt>
          <dd>{activeProject.directoryAvailable === false ? '目录不可用，请重新定位' : '本机目录可用'}</dd>
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
