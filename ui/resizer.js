/**
 * initPaneResizer:
 *   - Sets up a "drag" to resize two panes:
 *       - #chart-container (leftPane)
 *       - #sidebar (rightPane)
 *     with a .resizer handle between them.
 *
 * Usage in index.js (or main.js):
 *   import { initPaneResizer } from './ui/resizer.js';
 *   document.addEventListener('DOMContentLoaded', () => {
 *     initPaneResizer();
 *   });
 */
export function initPaneResizer() {
	const resizer = document.querySelector('.resizer');
	const leftPane = document.querySelector('#chart-container');
	const rightPane = document.querySelector('#sidebar');

	if (!resizer || !leftPane || !rightPane) {
		console.warn("Resizer: missing elements. Make sure .resizer, #chart-container, and #sidebar exist in the DOM.");
		return;
	}

	// When the user presses mouse button down on the resizer
	resizer.addEventListener('mousedown', (e) => {
		// Change the cursor and disable text selection
		document.body.style.cursor = 'ew-resize';
		document.body.style.userSelect = 'none';

		// Get the starting horizontal position
		const startX = e.clientX;
		// Current width of the right pane
		const startSidebarWidth = rightPane.offsetWidth;

		// On every mouse move, resize the sidebar
		const onMouseMove = (evt) => {
			const dx = -(evt.clientX - startX);
			const newSidebarWidth = Math.min(480, Math.max(240, startSidebarWidth + dx));

			// Update the sidebar's width
			rightPane.style.width = `${newSidebarWidth}px`;
			document.documentElement.style.setProperty("--sidebar-width", `${newSidebarWidth}px`);
		};

		// Stop the drag when user lets go of the mouse
		const onMouseUp = () => {
			document.removeEventListener('mousemove', onMouseMove);
			document.removeEventListener('mouseup', onMouseUp);
			document.body.style.cursor = '';
			document.body.style.userSelect = '';
		};

		// Attach the listeners
		document.addEventListener('mousemove', onMouseMove);
		document.addEventListener('mouseup', onMouseUp);
	});
}
