/* global document */
const NEXT_ACTIONS = {
  'privacy.getLocation': { href: 'diff-review.html?from=audit.html', label: '审阅声明改动示例' },
  'domain.request-whitelist': { href: 'guided-step.html', label: '核对域名配置步骤' },
  'domain.https-wss-only': { href: 'guided-step.html', label: '核对域名配置步骤' },
  'payment.requires-merchant': { href: 'https://pay.weixin.qq.com/static/applyment_guide/applyment_index.shtml', label: '核对微信支付主体准入 ↗', external: true },
  'category.medical-hint': { href: 'category-advisor.html', label: '核对业务类目与资质' },
};

export function auditNextAction(rule) {
  return Object.hasOwn(NEXT_ACTIONS, rule) ? { ...NEXT_ACTIONS[rule] } : null;
}

export function mountAudit(root) {
  for (const body of root.querySelectorAll('.acard__body')) {
    if (body.querySelector('.audit-evidence')) continue;
    const details = root.createElement('details');
    details.className = 'audit-evidence';
    const summary = root.createElement('summary');
    summary.textContent = '查看依据与核验记录';
    details.append(summary);
    [...body.children].slice(2).forEach(child => details.append(child));
    const destination = auditNextAction(body.querySelector('.rule-id')?.textContent.trim());
    if (destination) {
      const next = root.createElement('div'); next.className = 'journey-next';
      const link = root.createElement('a'); link.href = destination.href; link.textContent = destination.label;
      if (destination.external) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
      next.append(link); body.append(next);
    }
    // Native details owns expansion. Viewport changes never overwrite user choice.
    body.append(details);
  }
}

if (typeof document !== 'undefined') {
  mountAudit(document);
  document.querySelectorAll('.feedback-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id   = btn.dataset.feedback;
      const toast = document.getElementById('toast-' + id);
      if (!toast) return;
      toast.textContent = '已演示反馈，未发送';
      toast.classList.add('show');
      btn.disabled = true;

      setTimeout(() => { toast.classList.remove('show'); btn.disabled = false; }, 4000);
    });
  });
}
