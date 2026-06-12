
import { initPaneResizer } from './ui/resizer.js?v=20260610c';  // if you have a pane resizer
import { initFileUpload } from './ui/fileUpload.js?v=20260611b'; 
import { initAnalyticsPanel } from './ui/analyticsPanel.js?v=20260611a';
import { initReviewDiagramsPanel } from './ui/reviewDiagramsPanel.js?v=20260611a';

document.addEventListener('DOMContentLoaded', () => {
	initPaneResizer();
	initAnalyticsPanel();
	initReviewDiagramsPanel();
	initFileUpload();
});
