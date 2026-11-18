import type { Artifact, Project } from '../projects';
import type { RightPanelHostOptions } from './right-panel-renderer';
import type { RightPanelSnapshot, RightPanelTabId } from './right-panel-types';

export type RightPanelOptions = RightPanelHostOptions & {
  host?: HTMLElement | null;
};

/**
 * Minimal startup proxy (~1 kB) that defers React, Base UI, and right-panel state logic
 * into the async `right-panel-renderer` chunk so startup stays under 750 kB.
 */
export function mountRightPanel(
  options: RightPanelOptions = {},
  loadRenderer = () => import('./right-panel-renderer'),
) {
  const host = options.host ?? document.querySelector<HTMLElement>('#desktop-right-panel');
  if (!host) {
    return {
      update(_partial: Partial<RightPanelSnapshot>) {},
      selectTab(_tab: RightPanelTabId) {},
      setArtifact(_artifact: Artifact | null) {},
      syncProject(_project: Project | null, _lastCheckSummary?: string | null) {},
      setDrawerMode(_isDrawer: boolean) {},
      setBusy(_isBusy: boolean) {},
      canClose() { return true; },
      focusFact(_projectId: string, _field: 'collectsSensitive' | 'hasServerDomain') { return false; },
      destroy() {},
    };
  }

  let disposed = false;
  let controller: ReturnType<Awaited<ReturnType<typeof loadRenderer>>['createRightPanelController']> | undefined;
  let loading: Promise<void> | undefined;
  let queuedPartial: Partial<RightPanelSnapshot> | undefined;
  let queuedArtifact: Artifact | null | undefined;
  let queuedProject: { project: Project | null; summary?: string | null } | undefined;
  let queuedDrawer: boolean | undefined;
  let queuedBusy: boolean | undefined;

  function showFallback(failed: boolean) {
    if (disposed || controller) return;
    host!.setAttribute('aria-busy', String(!failed));
    const card = document.createElement('div');
    card.className = `shell-state-card${failed ? ' shell-state-card--error' : ''}`;
    card.setAttribute('role', failed ? 'alert' : 'status');
    const p = document.createElement('p');
    p.className = 'shell-state-card__body';
    p.textContent = failed ? '侧边面板组件未能加载，请重试。' : '正在加载侧边面板…';
    card.append(p);
    if (failed) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'shell-btn';
      retry.dataset.panelRetry = 'true';
      retry.textContent = '重新加载';
      retry.addEventListener('click', () => { void ensureLoaded(); });
      card.append(retry);
    }
    host!.replaceChildren(card);
  }

  async function ensureLoaded() {
    if (disposed || controller || loading) return loading;
    if (host!.getAttribute('aria-busy') !== 'true' || host!.children.length === 0) {
      showFallback(false);
    }
    loading = (async () => {
      try {
        const mod = await loadRenderer();
        if (disposed) return;
        host!.removeAttribute('aria-busy');
        host!.replaceChildren();
        controller = mod.createRightPanelController(host!, options);
        if (queuedDrawer !== undefined) controller.setDrawerMode(queuedDrawer);
        if (queuedBusy !== undefined) controller.setBusy(queuedBusy);
        if (queuedProject !== undefined) controller.syncProject(queuedProject.project, queuedProject.summary);
        if (queuedArtifact !== undefined) controller.setArtifact(queuedArtifact);
        if (queuedPartial !== undefined) controller.update(queuedPartial);
      } catch {
        if (!disposed) showFallback(true);
      } finally {
        loading = undefined;
      }
    })();
    return loading;
  }

  void ensureLoaded();

  return {
    update(partial: Partial<RightPanelSnapshot>) {
      if (controller) controller.update(partial);
      else queuedPartial = { ...queuedPartial, ...partial };
    },
    selectTab(tab: RightPanelTabId) {
      if (controller) controller.selectTab(tab);
      else queuedPartial = { ...queuedPartial, activeTab: tab };
    },
    setArtifact(artifact: Artifact | null) {
      if (controller) controller.setArtifact(artifact);
      else queuedArtifact = artifact;
    },
    syncProject(project: Project | null, summary?: string | null) {
      if (controller) controller.syncProject(project, summary);
      else queuedProject = { project, summary };
    },
    setDrawerMode(isDrawer: boolean) {
      if (controller) controller.setDrawerMode(isDrawer);
      else queuedDrawer = isDrawer;
    },
    setBusy(isBusy: boolean) {
      if (controller) controller.setBusy(isBusy);
      else queuedBusy = isBusy;
    },
    canClose(): boolean {
      return controller ? controller.canClose() : true;
    },
    focusFact(projectId: string, field: 'collectsSensitive' | 'hasServerDomain'): boolean {
      return controller ? controller.focusFact(projectId, field) : false;
    },
    destroy() {
      disposed = true;
      controller?.destroy();
      controller = undefined;
    },
  };
}
