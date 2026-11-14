/* global document, location, history, URLSearchParams */
const DESTINATIONS = {
  new: {
    url: 'main-four-region.html',
    label: '进入上线工作台',
    description: '打开示例项目，查看上线阶段、对话和预检结果。',
  },
  live: {
    url: 'health-dashboard.html',
    label: '查看健康检查示例',
    description: '打开示例健康报告，了解风险详情与复查路径。',
  },
};

export function mountOnboarding(root, navigate = url => { location.href = url; }, search = '', onChoice = () => {}) {
  const form = root.getElementById('onboarding-form');
  if (!form) return;
  const params = new URLSearchParams(search);
  if (params.has('status')) {
    const restored = params.get('status') === 'live' ? 'live' : 'new';
    for (const value of ['new', 'live']) {
      const control = root.querySelector(`input[name="status"][value="${value}"]`);
      if (control) control.checked = value === restored;
    }
  }
  const destination = () => root.querySelector('input[name="status"]:checked')?.value === 'live'
    ? DESTINATIONS.live : DESTINATIONS.new;
  const update = () => {
    const selected = destination();
    onChoice(selected === DESTINATIONS.live ? 'live' : 'new');
    const settings = root.getElementById('onboarding-settings');
    if (settings) settings.href = `settings.html?from=${encodeURIComponent(`first-run.html?status=${selected === DESTINATIONS.live ? 'live' : 'new'}`)}#key`;
    root.getElementById('start-label').textContent = selected.label;
    root.getElementById('start-description').textContent = selected.description;
  };
  form.addEventListener('change', update);
  form.addEventListener('submit', event => {
    event.preventDefault();
    navigate(destination().url);
  });
  update();
}

if (typeof document !== 'undefined') mountOnboarding(document, undefined, location.search, choice => {
  history.replaceState(history.state, '', `${location.pathname}?status=${choice}${location.hash}`);
});
