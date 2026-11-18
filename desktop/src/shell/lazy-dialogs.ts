import type { mountExplainDialog as MountExplainDialogFn } from '../explain-dialog';
import type { mountRepairHandoff as MountRepairHandoffFn } from '../repair-handoff';
import type { mountSourceFreshness as MountSourceFreshnessFn } from '../source-freshness';
import type { mountSubmissionMaterials as MountSubmissionMaterialsFn } from '../submission-materials-dialog';

function reportDialogLoadFailure() {
  const status = document.getElementById('status');
  if (status) {
    status.textContent = '对话框组件未能加载，请重试。';
    status.className = 'status error';
  }
}

export function mountSourceFreshness(options: Parameters<typeof MountSourceFreshnessFn>[0]) {
  let instance: ReturnType<typeof MountSourceFreshnessFn> | undefined;
  let loading: Promise<ReturnType<typeof MountSourceFreshnessFn> | undefined> | undefined;
  let disposed = false;
  let closeGeneration = 0;

  async function ensure() {
    if (disposed) return undefined;
    if (instance) return instance;
    loading ??= import('../source-freshness')
      .then(mod => {
        if (disposed) return undefined;
        instance = mod.mountSourceFreshness(options);
        return instance;
      })
      .finally(() => { loading = undefined; });
    return loading;
  }

  return {
    open(opener: HTMLElement | null = null) {
      if (disposed) return;
      if (instance) {
        instance.open(opener);
        return;
      }
      const generation = closeGeneration;
      void ensure().then(ctrl => {
        if (!disposed && generation === closeGeneration) ctrl?.open(opener);
      }).catch(reportDialogLoadFailure);
    },
    close() {
      closeGeneration++;
      instance?.close();
    },
    destroy() {
      disposed = true;
      instance?.destroy();
      instance = undefined;
    },
  };
}

export function mountExplainDialog(options: Parameters<typeof MountExplainDialogFn>[0]) {
  let instance: ReturnType<typeof MountExplainDialogFn> | undefined;
  let loading: Promise<ReturnType<typeof MountExplainDialogFn> | undefined> | undefined;
  let pendingReset = false;

  async function ensure() {
    if (instance) return instance;
    loading ??= import('../explain-dialog')
      .then(mod => {
        instance = mod.mountExplainDialog(options);
        if (pendingReset) {
          pendingReset = false;
          instance.reset();
        }
        return instance;
      })
      .finally(() => { loading = undefined; });
    return loading;
  }

  return {
    reset() {
      if (instance) instance.reset();
      else pendingReset = true;
    },
    open(trigger: HTMLElement) {
      if (instance) {
        instance.open(trigger);
        return;
      }
      void ensure().then(ctrl => ctrl?.open(trigger)).catch(reportDialogLoadFailure);
    },
  };
}

export function mountRepairHandoff(options: Parameters<typeof MountRepairHandoffFn>[0]) {
  let instance: ReturnType<typeof MountRepairHandoffFn> | undefined;
  let loading: Promise<ReturnType<typeof MountRepairHandoffFn> | undefined> | undefined;
  let disposed = false;

  async function ensure() {
    if (disposed) return undefined;
    if (instance) return instance;
    loading ??= import('../repair-handoff')
      .then(mod => {
        if (disposed) return undefined;
        instance = mod.mountRepairHandoff(options);
        return instance;
      })
      .finally(() => { loading = undefined; });
    return loading;
  }

  return {
    open(anchor: HTMLElement, fromReport = false) {
      if (disposed) return;
      if (instance) {
        instance.open(anchor, fromReport);
        return;
      }
      void ensure().then(ctrl => ctrl?.open(anchor, fromReport)).catch(reportDialogLoadFailure);
    },
    refresh() {
      instance?.refresh();
    },
    destroy() {
      disposed = true;
      instance?.destroy();
      instance = undefined;
    },
  };
}

export function mountSubmissionMaterials(options: Parameters<typeof MountSubmissionMaterialsFn>[0]) {
  let instance: ReturnType<typeof MountSubmissionMaterialsFn> | undefined;
  let loading: Promise<ReturnType<typeof MountSubmissionMaterialsFn> | undefined> | undefined;
  let disposed = false;
  let closeGeneration = 0;

  async function ensure() {
    if (disposed) return undefined;
    if (instance) return instance;
    loading ??= import('../submission-materials-dialog')
      .then(mod => {
        if (disposed) return undefined;
        instance = mod.mountSubmissionMaterials(options);
        return instance;
      })
      .finally(() => { loading = undefined; });
    return loading;
  }

  return {
    async prepareOpen() {
      return (await ensure())?.open;
    },
    open(anchor: HTMLElement | null = null) {
      if (disposed) return;
      if (instance) {
        instance.open(anchor);
        return;
      }
      const generation = closeGeneration;
      void ensure().then(ctrl => {
        if (!disposed && generation === closeGeneration) ctrl?.open(anchor);
      }).catch(reportDialogLoadFailure);
    },
    close() {
      closeGeneration++;
      instance?.close();
    },
    refresh() {
      instance?.refresh();
    },
    destroy() {
      disposed = true;
      instance?.destroy();
      instance = undefined;
    },
  };
}
