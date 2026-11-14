/* global document, window */
export const HEALTH_MONITORS = Object.freeze(['运营规范', '服务类目', '隐私指引', '服务器域名', 'ICP 备案']);

// Replays already visible sample rows. It never calls a scanner or changes a finding.
export function createHealthReplay({ schedule = callback => setTimeout(callback, 350), clearSchedule = clearTimeout, onChange = () => {} } = {}) {
  let state = { status: 'idle', completed: 0, reviewed: false, source: 'local-demo', verified: false };
  let timer; let generation = 0; let disposed = false;
  const emit = () => onChange({ ...state });
  function next(run) {
    timer = schedule(() => {
      if (disposed || run !== generation || state.status !== 'running') return;
      state.completed++;
      if (state.completed === HEALTH_MONITORS.length) state.status = 'completed';
      emit();
      if (state.status === 'running') next(run);
    });
  }
  return {
    getState: () => ({ ...state }),
    start() {
      if (disposed || state.status === 'running') return false;
      state = { ...state, status: 'running', completed: 0 };
      const run = ++generation;
      emit(); next(run); return true;
    },
    stop() {
      if (disposed || state.status !== 'running') return false;
      ++generation; clearSchedule(timer); state.status = 'stopped'; emit(); return true;
    },
    toggleReviewed() {
      if (disposed || state.status === 'running') return false;
      state.reviewed = !state.reviewed; emit(); return true;
    },
    dispose() { disposed = true; ++generation; clearSchedule(timer); },
  };
}

export function mountHealth(root, host) {
  const replayButton = root.getElementById('healthReplay');
  if (!replayButton) return;
  const status = root.getElementById('healthStatus');
  const reviewed = root.getElementById('healthReviewed');
  const progress = root.getElementById('healthProgress');
  const replay = createHealthReplay({ onChange(state) {
    const running = state.status === 'running';
    replayButton.textContent = running ? '停止回放' : '回放检查示例';
    reviewed.disabled = running;
    reviewed.setAttribute('aria-pressed', String(state.reviewed));
    reviewed.textContent = state.reviewed ? '撤销已阅读标记' : '标记为已阅读';
    progress.value = state.completed;
    progress.hidden = state.status === 'idle';
    status.classList.toggle('is-working', running);
    const readingStatus = state.reviewed ? '已在本页标记为阅读，不代表风险已解决。' : '未标记为阅读。本地示例，尚未扫描或验证真实项目。';
    const replayStatus = state.status === 'stopped' ? '已停止示例回放，当前展示内容保留。未执行扫描。' : state.status === 'completed' ? '示例回放完成。' : '';
    status.textContent = running ? `正在展示：${HEALTH_MONITORS[state.completed]} · ${state.completed} / ${HEALTH_MONITORS.length}`
      : `${replayStatus}${readingStatus}`;
  } });
  replayButton.addEventListener('click', () => replay.getState().status === 'running' ? replay.stop() : replay.start());
  reviewed.addEventListener('click', () => replay.toggleReviewed());
  // The browser may restore this page with the same controls from its back/forward cache.
  host.addEventListener('pagehide', () => replay.stop());
  return replay;
}

if (typeof document !== 'undefined') mountHealth(document, window);
