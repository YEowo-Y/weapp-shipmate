import { validateExplainInput, validateExplainResult } from './shared/explain-contract.js';
import type { Artifact } from './projects';

type Options = {
  invoke<T>(command: string, args: Record<string, unknown>): Promise<T>;
  getProjectId(): string | null;
  isReady(): boolean;
  isBusy(): boolean;
  setBusy(value: boolean): void;
  onArtifact(artifact: Artifact): void;
  onStopError(message: string): void;
  onSettled(): Promise<void>;
};
const aborted = () => Object.assign(new Error('查询已停止，输入已保留。'), { name: 'AbortError' });

/** Bind the existing rejection renderer to the same persisted, cancelable native tools. */
export function createProjectExplain(options: Options) {
  return {
    async query({ query, signal }: { query: string; signal?: AbortSignal }): Promise<unknown> {
      if (signal?.aborted) throw aborted();
      if (!validateExplainInput({ query }).ok) throw new Error('请输入 1–4096 字的拒因原文或关键词。');
      if (!options.isReady()) throw new Error('项目存储尚未就绪，请重新加载项目后重试。');
      if (options.isBusy()) throw new Error('请等待当前操作结束或停止后重试。');
      const projectId = options.getProjectId(), runId = crypto.randomUUID(), request = query.trim();
      let canceled = false, stop: Promise<void> | null = null;
      const cancel = () => {
        if (canceled) return;
        canceled = true;
        stop = options.invoke('run_cancel', { runId }).then(() => {}, () => {
          options.onStopError('停止请求失败，正在等待本地查询结束；结束前不能开始其他项目操作。');
        });
      };
      options.setBusy(true);
      signal?.addEventListener('abort', cancel, { once: true });
      try {
        const artifact = await options.invoke<Artifact>('project_run', { projectId, runId, kind: 'explain', query: request });
        if (canceled || signal?.aborted) throw aborted();
        if (artifact?.projectId !== projectId || options.getProjectId() !== projectId || artifact.runId !== runId || artifact.kind !== 'explain')
          throw new Error('查询成果与当前项目或运行不匹配，请从项目历史重新查看。');
        if (artifact.data?.schemaVersion !== 1 || artifact.data.kind !== 'explain' || !validateExplainResult(artifact.data.result, request).ok)
          throw new Error('查询成果未通过校验，请重试。');
        options.onArtifact(artifact);
        return artifact.data.result;
      } catch (error) {
        if (canceled || signal?.aborted) throw aborted();
        throw error;
      } finally {
        signal?.removeEventListener('abort', cancel);
        // An acknowledgement is not execution completion; release only after both settle.
        await stop;
        options.setBusy(false);
        await options.onSettled();
      }
    },
  };
}
