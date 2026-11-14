/* global document */
const normalize = text => String(text || '').normalize('NFKC').toLocaleLowerCase('zh-CN');

export function mountMemoryFilters(root) {
  const search = root.getElementById('memory-search');
  if (!search) return;
  const cards = [...root.querySelectorAll('.mem-card')];
  const filters = [...root.querySelectorAll('#filters [data-memory-type]')];
  const count = root.getElementById('memory-count');
  const empty = root.getElementById('memory-empty');
  const reset = root.getElementById('memory-reset');
  const entries = cards.map(card => ({
    card,
    type: card.dataset.memoryType,
    text: normalize(`${card.querySelector('.mem-card__body').textContent} ${card.querySelector('.mem-card__meta').textContent}`),
  }));
  let category = 'all';

  function update() {
    const terms = normalize(search.value).trim().split(/\s+/).filter(Boolean);
    const matches = entries.filter(entry => terms.every(term => entry.text.includes(term)));
    const visible = new Set(matches.filter(entry => category === 'all' || entry.type === category));
    entries.forEach(entry => { entry.card.hidden = !visible.has(entry); });
    filters.forEach(filter => {
      const type = filter.dataset.memoryType;
      const active = type === category;
      filter.classList.toggle('chip--accent', active);
      filter.setAttribute('aria-pressed', String(active));
      filter.querySelector('.chip__n').textContent = String(matches.filter(entry => type === 'all' || entry.type === type).length);
    });
    count.textContent = `显示 ${visible.size} 条，共 ${entries.length} 条示例记忆`;
    empty.hidden = visible.size > 0;
    reset.hidden = !terms.length && category === 'all';
  }

  search.addEventListener('input', update);
  search.addEventListener('search', update);
  filters.forEach(filter => filter.addEventListener('click', () => {
    category = filter.dataset.memoryType;
    update();
  }));
  reset.addEventListener('click', () => {
    category = 'all';
    search.value = '';
    update();
    search.focus();
  });
  update();
}

if (typeof document !== 'undefined') mountMemoryFilters(document);
