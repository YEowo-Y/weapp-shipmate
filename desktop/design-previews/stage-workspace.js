/* global document, location, URLSearchParams */
import { getStage, renderStageLinks, stageOverviewMarkup, stageNavigationMarkup } from './stages.js';

const selected = getStage(new URLSearchParams(location.search).get('stage'));
document.title = `${selected.title} · 上线船友`;
document.querySelector('.chrome .sub').textContent = `阶段概览 / ${selected.title}`;
document.getElementById('stageDescription').textContent = `${selected.title}的准备事项、本人操作步骤与官方来源。`;
document.getElementById('spine').innerHTML = renderStageLinks(selected.id);
const content = document.getElementById('stageContent');
if (selected.id === 'filing') {
  content.insertAdjacentHTML('beforeend', stageNavigationMarkup(selected.id));
} else {
  content.innerHTML = stageOverviewMarkup(selected.id);
}

const annotBtn = document.getElementById('annotBtn');
annotBtn.addEventListener('click', () => {
  const enabled = document.body.classList.toggle('annot');
  annotBtn.classList.toggle('active', enabled);
  annotBtn.setAttribute('aria-pressed', String(enabled));
});
