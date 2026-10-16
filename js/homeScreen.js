import { $ } from './ui.js';
import { figureThumbnail } from './thumbnails.js';
import { createProgressStore } from './progress.js';
import { DEFAULT_FIGURE } from './figures.js';

// The home screen's player chip (your figure and name) and coin count.
export function renderHome(app) {
  const figure = app.figures.getMain() ?? DEFAULT_FIGURE;
  $('#home-figure').src = figureThumbnail(figure, 'head');
  $('#home-name').textContent = figure.name || 'You';
  $('#home-coins b').textContent = createProgressStore().get().coins;
}
