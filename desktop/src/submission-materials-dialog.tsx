import { createElement, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Checkbox } from './components/ui/checkbox';
import type { Artifact, Project } from './projects';
import { createArtifactDownloader } from './shared/artifact-download.js';
import {
  createSubmissionMaterials,
  exportSubmissionMaterials,
  type MaterialSourceRef,
  type SubmissionMaterialsPack,
} from './shared/submission-materials.js';
import { LucideSvg } from './shell/lucide-svg';
import { isSafeHttpsUrl, type WorkflowBasisSnapshot } from './shell/right-panel-types';
import './submission-materials.css';

type InvokeFn = <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
type MaterialArtifact = Omit<Artifact, 'markdown'>;

export type SubmissionMaterialsOptions = {
  invoke: InvokeFn;
  getProject(): Project | null;
  getArtifact(projectId: string): MaterialArtifact | null | Promise<MaterialArtifact | null>;
  onManageProject?(): void;
  onOpenSource?(url: string): void;
  copyText?(text: string): Promise<void>;
  onDownloadArtifact?(artifact: { text: string; filename: string; mimeType: string }): boolean;
};

type DialogState =
  | { status: 'empty' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; pack: SubmissionMaterialsPack };

function SourceList({
  sources,
  flush = false,
  onOpenSource,
}: {
  sources: MaterialSourceRef[];
  flush?: boolean;
  onOpenSource?(url: string): void;
}) {
  if (!sources.length) return null;
  return (
    <div className={`materials-sources${flush ? ' materials-sources--flush' : ''}`}>
      {sources.map((src, idx) => (
        <div key={`${src.ruleId ?? src.title}-${idx}`}>
          <div>
            <span>{src.ruleId ? `${src.title}（${src.ruleId}）` : src.title}</span>
            {src.lastVerified ? <span> · 核验于 {src.lastVerified}（未实时核验）</span> : null}
            {isSafeHttpsUrl(src.officialUrl) ? (
              <>
                {' · '}
                <button
                  type="button"
                  className="materials-source-link"
                  data-materials-source={src.officialUrl}
                  aria-label={`官方来源 · ${src.title}`}
                  onClick={() => onOpenSource?.(src.officialUrl!)}
                >
                  <span>官方来源</span>
                  <LucideSvg name="external-link" size="sm" />
                </button>
              </>
            ) : null}
          </div>
          {src.quote ? <blockquote className="materials-source-quote">{src.quote}</blockquote> : null}
        </div>
      ))}
    </div>
  );
}

function CopyActionButton({
  id,
  label,
  ariaLabel,
  variant = 'outline',
  getText,
  copyFn,
  onAnnounce,
  dataAttr,
}: {
  id?: string;
  label: string;
  ariaLabel?: string;
  variant?: 'primary' | 'outline';
  getText(): string;
  copyFn(text: string): Promise<void>;
  onAnnounce(message: string): void;
  dataAttr?: string;
}) {
  const [feedback, setFeedback] = useState<{ state: 'idle' | 'copied' | 'failed'; text: string }>({
    state: 'idle',
    text: '',
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyEpoch = useRef(0);

  useEffect(() => {
    return () => {
      copyEpoch.current++;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = async () => {
    const content = getText();
    if (!content) return;
    const epoch = ++copyEpoch.current;
    if (timerRef.current) clearTimeout(timerRef.current);
    let ok: boolean;
    try {
      await copyFn(content);
      ok = true;
    } catch {
      ok = false;
    }
    if (epoch !== copyEpoch.current) return;
    const msg = ok ? '已复制' : '复制失败，请重试或导出文件';
    setFeedback({ state: ok ? 'copied' : 'failed', text: msg });
    onAnnounce(msg);
    timerRef.current = setTimeout(() => {
      setFeedback({ state: 'idle', text: '' });
    }, 2000);
  };

  return (
    <span className="materials-copy-wrap">
      <button
        type="button"
        id={id}
        aria-label={ariaLabel}
        data-copy-draft={dataAttr}
        className={`materials-btn${variant === 'primary' ? ' materials-btn--primary' : ''}`}
        data-copied={feedback.state === 'copied' ? '' : undefined}
        data-failed={feedback.state === 'failed' ? '' : undefined}
        onClick={() => {
          void handleCopy();
        }}
      >
        <LucideSvg name={feedback.state === 'copied' ? 'check' : 'copy'} size="sm" />
        <span>{label}</span>
      </button>
      <span
        className="materials-copy-tip"
        aria-hidden="true"
        data-visible={feedback.state !== 'idle' ? 'true' : 'false'}
        data-failed={feedback.state === 'failed' ? 'true' : undefined}
      >
        {feedback.text}
      </span>
    </span>
  );
}

function SubmissionMaterialsView({
  state,
  checkedIds,
  actionNotice,
  copyNotice,
  onCopyNotice,
  onToggleCheck,
  onRetry,
  onClose,
  onSelectProject,
  onOpenSource,
  onExport,
  copyFn,
}: {
  state: DialogState;
  checkedIds: Set<string>;
  actionNotice: { text: string; error?: boolean };
  copyNotice: string;
  onCopyNotice(message: string): void;
  onToggleCheck(id: string, checked: boolean): void;
  onRetry(): void;
  onClose(): void;
  onSelectProject(): void;
  onOpenSource?(url: string): void;
  onExport(format: 'markdown' | 'json'): void;
  copyFn(text: string): Promise<void>;
}) {
  return (
    <div className="materials-root">
      <header className="materials-header">
        <div className="materials-header__titles">
          <h2 id="materials-title">提审材料包</h2>
          <p id="materials-description">
            依据已保存项目事实与本机预检整理字段映射、待确认草稿和自查清单；提审与发布须由你本人在微信公众平台完成，本工具不采集或保存任何账号密码。
          </p>
        </div>
        <button
          type="button"
          id="materials-close"
          className="materials-icon-btn"
          aria-label="关闭提审材料包"
          onClick={onClose}
        >
          <LucideSvg name="x" />
        </button>
      </header>

      <div className="materials-body scroll">
        {state.status === 'empty' ? (
          <div className="materials-state-card">
            <strong>未选择项目</strong>
            <p className="materials-section__hint">
              请先选择或添加小程序项目，并在「上线 → 项目事实」保存业务事实后生成提审材料包。
            </p>
            <button
              type="button"
              id="materials-select-project"
              className="materials-btn materials-btn--primary"
              onClick={onSelectProject}
            >
              <LucideSvg name="folder-open" size="sm" />
              <span>选择或添加项目</span>
            </button>
          </div>
        ) : state.status === 'loading' ? (
          <div className="materials-state-card" role="status" aria-busy="true" aria-label="正在整理提审材料包">
            <div className="shell-skel shell-skel--w72" />
            <div className="shell-skel shell-skel--w92" />
            <div className="shell-skel shell-skel--w54" />
          </div>
        ) : state.status === 'error' ? (
          <div className="materials-state-card materials-state-card--error" role="alert">
            <strong>无法整理提审材料包</strong>
            <p className="materials-section__hint">{state.message}</p>
            <button type="button" id="materials-retry" className="materials-btn" onClick={onRetry}>
              <LucideSvg name="refresh-cw" size="sm" />
              <span>重新加载</span>
            </button>
          </div>
        ) : (
          <>
            <div className="materials-toolbar">
              <span className="materials-toolbar__meta tabular">
                {state.pack.meta.projectName} · {state.pack.meta.subjectLabel} · 已自查 {checkedIds.size} /{' '}
                {state.pack.checklist.length} 项
              </span>
              <CopyActionButton
                id="materials-copy-all"
                label="复制材料包 Markdown"
                variant="primary"
                getText={() => exportSubmissionMaterials(state.pack, 'markdown', { checkedIds }).text}
                copyFn={copyFn}
                onAnnounce={onCopyNotice}
              />
              <button
                type="button"
                id="materials-export-md"
                className="materials-btn"
                onClick={() => onExport('markdown')}
              >
                <span>导出 Markdown</span>
              </button>
              <button
                type="button"
                id="materials-export-json"
                className="materials-btn"
                onClick={() => onExport('json')}
              >
                <span>导出 JSON</span>
              </button>
            </div>

            {actionNotice.text ? (
              <p
                id="materials-export-status"
                className="materials-section__hint"
                role="status"
                data-error={actionNotice.error ? 'true' : 'false'}
              >
                {actionNotice.text}
              </p>
            ) : null}

            {state.pack.meta.warnings.length > 0 ? (
              <ul className="materials-warnings">
                {state.pack.meta.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            ) : null}

            <section id="materials-section-fields" className="materials-section" aria-labelledby="materials-fields-heading">
              <div className="materials-section__header">
                <h3 id="materials-fields-heading">一、字段映射</h3>
                <p className="materials-section__hint">对照微信公众平台后台入口核实每项配置状态</p>
              </div>
              <div
                tabIndex={0}
                role="region"
                aria-labelledby="materials-fields-heading"
                className="table-wrapper materials-table-wrapper"
              >
                <table className="materials-table">
                  <thead>
                    <tr>
                      <th scope="col">微信后台字段</th>
                      <th scope="col">后台位置</th>
                      <th scope="col">当前状态</th>
                      <th scope="col">项目映射内容</th>
                      <th scope="col">核对要点与来源</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.pack.fieldMappings.map(row => (
                      <tr key={row.id}>
                        <th scope="row">{row.consoleField}</th>
                        <td>{row.consolePath}</td>
                        <td>{row.currentStatus}</td>
                        <td>{row.mappedValue}</td>
                        <td>
                          <div>{row.notes}</div>
                          <SourceList sources={row.sources} flush onOpenSource={onOpenSource} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section id="materials-section-drafts" className="materials-section" aria-labelledby="materials-drafts-heading">
              <div className="materials-section__header">
                <h3 id="materials-drafts-heading">二、待确认草稿</h3>
                <p className="materials-section__hint">草稿含待补充占位提示，须结合实际功能人工改定后自行填入微信后台</p>
              </div>
              <div className="materials-draft-list">
                {state.pack.draftItems.map(draft => (
                  <article key={draft.id} className="materials-draft-card">
                    <div className="materials-draft-card__head">
                      <div>
                        <h4>{draft.title}</h4>
                        <span className="materials-section__hint">填写位置：{draft.targetLocation}</span>
                      </div>
                      <div className="materials-copy-wrap">
                        <span className="materials-badge">待人工核对与补全</span>
                        <CopyActionButton
                          dataAttr={draft.id}
                          label="复制草稿"
                          ariaLabel={`复制草稿 · ${draft.title}`}
                          getText={() => draft.draftText}
                          copyFn={copyFn}
                          onAnnounce={onCopyNotice}
                        />
                      </div>
                    </div>
                    <pre className="materials-draft-pre">{draft.draftText}</pre>
                    {draft.placeholders.length > 0 ? (
                      <ul className="materials-placeholders">
                        {draft.placeholders.map((ph, idx) => (
                          <li key={idx}>{ph}</li>
                        ))}
                      </ul>
                    ) : null}
                    <SourceList sources={draft.sources} flush onOpenSource={onOpenSource} />
                  </article>
                ))}
              </div>
            </section>

            <section
              id="materials-section-checklist"
              className="materials-section"
              aria-labelledby="materials-checklist-heading"
            >
              <div className="materials-section__header">
                <h3 id="materials-checklist-heading">三、提审前检查清单</h3>
                <p className="materials-section__hint">勾选仅作当前会话自查备忘，不代表审核结果</p>
              </div>
              <div className="materials-checklist">
                {state.pack.checklist.map(item => {
                  const checked = checkedIds.has(item.id);
                  return (
                    <div key={item.id} className="materials-check-item">
                      <label className="materials-check-row">
                        <Checkbox
                          aria-labelledby={`materials-check-${item.id}`}
                          data-checklist-id={item.id}
                          checked={checked}
                          onCheckedChange={next => onToggleCheck(item.id, next)}
                        />
                        <span className="materials-check-copy">
                          <strong id={`materials-check-${item.id}`}>{item.title}</strong>
                          <span>{item.detail}</span>
                        </span>
                      </label>
                      <SourceList sources={item.sources} onOpenSource={onOpenSource} />
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>

      <span id="materials-copy-status" className="sr-only" role="status">{copyNotice}</span>
      <footer className="materials-footer">
        <span>本机生成 · 不采集账号密码 · 不会替你提审或发布</span>
        <button type="button" id="materials-done" className="materials-btn" onClick={onClose}>
          关闭
        </button>
      </footer>
    </div>
  );
}

export function mountSubmissionMaterials(options: SubmissionMaterialsOptions) {
  const existing = document.getElementById('desktop-materials') as HTMLDialogElement | null;
  const dialog = existing ?? document.createElement('dialog');
  dialog.id = 'desktop-materials';
  dialog.className = 'materials-dialog';
  dialog.setAttribute('aria-labelledby', 'materials-title');
  dialog.setAttribute('aria-describedby', 'materials-description');
  if (!existing) {
    document.body.append(dialog);
  }

  const root = createRoot(dialog);
  const downloader = options.onDownloadArtifact ? null : createArtifactDownloader({ documentRef: document });
  const checkedByProject = new Map<string, Set<string>>();

  let disposed = false;
  let loadEpoch = 0;
  let trigger: HTMLElement | null = null;
  let state: DialogState = { status: 'empty' };
  let actionNotice: { text: string; error?: boolean } = { text: '' };
  let copyNotice = '';

  const copyFn =
    options.copyText ??
    (async (text: string) => {
      await navigator.clipboard.writeText(text);
    });

  function getCheckedSet(projectId: string | null): Set<string> {
    if (!projectId) return new Set();
    let set = checkedByProject.get(projectId);
    if (!set) {
      set = new Set();
      checkedByProject.set(projectId, set);
    }
    return set;
  }

  function render() {
    if (disposed) return;
    const projectId = state.status === 'ready' ? state.pack.meta.projectId : options.getProject()?.id ?? null;
    const activeChecks = getCheckedSet(projectId);
    const currentChecked = new Set(state.status === 'ready'
      ? state.pack.checklist.filter(item => activeChecks.has(item.id)).map(item => item.id)
      : []);
    flushSync(() => {
      root.render(
        createElement(SubmissionMaterialsView, {
          state,
          checkedIds: currentChecked,
          actionNotice,
          copyNotice,
          onCopyNotice(message) {
            copyNotice = copyNotice === message ? `${message}\u00A0` : message;
            render();
          },
          onToggleCheck(id, checked) {
            if (!projectId) return;
            const set = getCheckedSet(projectId);
            if (checked) set.add(id);
            else set.delete(id);
            render();
          },
          onRetry() {
            void loadMaterials();
          },
          onClose() {
            dialog.close();
          },
          onSelectProject() {
            dialog.close();
            options.onManageProject?.();
          },
          onOpenSource: options.onOpenSource,
          onExport(format) {
            if (state.status !== 'ready') return;
            try {
              const exported = exportSubmissionMaterials(state.pack, format, {
                checkedIds: getCheckedSet(state.pack.meta.projectId),
              });
              const ok = options.onDownloadArtifact
                ? options.onDownloadArtifact(exported)
                : Boolean(downloader?.download(exported));
              if (!ok) throw new Error('未能发起文件下载，请重试。');
              actionNotice = {
                text: `已发起 ${format === 'json' ? 'JSON' : 'Markdown'} 导出，请在下载目录查看。`,
                error: false,
              };
            } catch (err) {
              actionNotice = {
                text: err instanceof Error ? err.message : '导出失败，请重试。',
                error: true,
              };
            }
            render();
          },
          copyFn,
        }),
      );
    });
  }

  function hasNativeBridge() {
    const win = document.defaultView as (Window & { __TAURI_INTERNALS__?: { invoke?: unknown } }) | null;
    return typeof win?.__TAURI_INTERNALS__?.invoke === 'function';
  }

  async function loadMaterials() {
    const project = options.getProject();
    const token = ++loadEpoch;
    actionNotice = { text: '' };
    copyNotice = '';

    if (!project) {
      state = { status: 'empty' };
      render();
      return;
    }

    if (!hasNativeBridge()) {
      state = {
        status: 'error',
        message: '提审材料包需要在桌面应用中读取本机项目与规则目录。',
      };
      render();
      return;
    }

    state = { status: 'loading' };
    render();

    try {
      const [wfBasis, artifact] = await Promise.all([
        options.invoke<WorkflowBasisSnapshot>('project_workflow', { projectId: project.id }),
        Promise.resolve().then(() => options.getArtifact(project.id)).catch(() => undefined),
      ]);
      if (disposed || token !== loadEpoch) return;
      if (!wfBasis?.project || wfBasis.project.id !== project.id) {
        throw new Error('返回的项目资料与当前选择不一致，请重试。');
      }
      const pack = createSubmissionMaterials({
        project: wfBasis.project,
        catalog: wfBasis.catalog,
        rulesVersion: wfBasis.rulesVersion,
        confirmations: wfBasis.confirmations,
        artifact,
      });
      if (artifact === undefined) pack.meta.warnings.push('未能读取本机预检报告，本次仅依据已保存项目事实与规则目录整理。');
      state = { status: 'ready', pack };
      render();
    } catch {
      if (disposed || token !== loadEpoch) return;
      state = {
        status: 'error',
        message: '无法读取当前项目的已保存资料，请重试。',
      };
      render();
    }
  }

  const visible = (element: Element | null): element is HTMLElement =>
    element instanceof HTMLElement && element.isConnected && !element.closest('[hidden], [inert]') &&
    element.getClientRects().length > 0;

  const onDialogClose = () => {
    if (dialog.open) return;
    loadEpoch++;
    dialog.returnValue = '';
    const active = document.activeElement;
    if (!disposed && (active === document.body || dialog.contains(active) || !visible(active))) {
      const fallback = document.getElementById(trigger?.id === 'desktop-materials-open' ? 'desktop-sidebar-expand' : 'desktop-panel-toggle');
      const target = [trigger, fallback, document.getElementById('desktop-panel-toggle')].find(visible);
      target?.focus({ preventScroll: true });
    }
    trigger = null;
  };

  dialog.addEventListener('close', onDialogClose);
  render();

  return {
    open(anchor: HTMLElement | null = null) {
      if (disposed) return;
      if (dialog.open) {
        void loadMaterials();
        return;
      }
      trigger = anchor;
      void loadMaterials();
      dialog.showModal();
      dialog.querySelector<HTMLElement>('#materials-close')?.focus({ preventScroll: true });
    },
    close() {
      if (!disposed && dialog.open) dialog.close();
    },
    refresh() {
      if (!disposed && dialog.open) {
        void loadMaterials();
      }
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      loadEpoch++;
      dialog.removeEventListener('close', onDialogClose);
      downloader?.dispose();
      checkedByProject.clear();
      root.unmount();
      dialog.remove();
    },
  };
}
