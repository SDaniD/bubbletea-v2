/**
 * calculatePositions
 *   - Computes (x, y) positions for a set of bubbles laid out in 
 *     a two-row arrangement, or your custom logic for a grid-like layout.
 *
 * @param {number} numPies - Number of pie charts (bubbles) to place.
 * @param {number} bubbleRadius - Radius of each bubble.
 * @param {number} padding - Space between bubbles.
 * @returns {Array<[number, number]>} - An array of [x, y] coordinates.
 */
export function calculatePositions(numPies, bubbleRadius, padding) {
	const numCols = Math.ceil(Math.sqrt(numPies));
	const twoRowNumCols = numCols * 2 - 1;

	return Array.from({ length: numPies }, (_, index) => {
		const drow = Math.floor(index / twoRowNumCols);
		const irow = Math.floor((index % twoRowNumCols) / numCols);
		const x = bubbleRadius / 2 + padding * 1.5 + irow * ((bubbleRadius + padding) / 2) + (index % twoRowNumCols - irow * numCols) * (bubbleRadius + padding);
		const y = bubbleRadius * 2.5 + padding * 1.5 + (drow * 2 + irow) * (bubbleRadius + padding / 3);
		return [x, y];
	});
}

/**
 * calculateLayoutDimensions
 *   - Based on the positions array, determines how wide/tall the final
 *     layout should be to fit all bubbles.
 *
 * @param {Array<[number, number]>} positions - Array of [x, y] coords from calculatePositions().
 * @param {number} bubbleRadius - Radius of each bubble.
 * @param {number} padding - Spacing between bubbles.
 * @returns {{ layoutWidth: number, layoutHeight: number }}
 */
export function calculateLayoutDimensions(positions, bubbleRadius, padding) {
	const maxX = Math.max(...positions.map(pos => pos[0])) + bubbleRadius / 2 + padding * 1.5;
	const maxY = Math.max(...positions.map(pos => pos[1])) + bubbleRadius / 2 + padding * 1.5;
	return { layoutWidth: maxX, layoutHeight: maxY };
}

/**
 * drawLayoutContainer
 *   - Draws a background “container” shape (like a stylized cup) 
 *     that encloses the entire bubble layout.
 *
 * @param {number} width - The overall width of the layout.
 * @param {number} height - The overall height of the layout.
 * @param {number} bubbleRadius - Radius of each bubble (used to shape the top).
 * @param {number} padding - Spacing from edges.
 * @param {string} fill - Fill color for the container shape.
 * @param {string} stroke - Stroke color for the container shape.
 * @returns {d3.Selection<SVGGElement, unknown, null, undefined>} - A D3 selection of the container <g>.
 */
export function drawLayoutContainer(width, height, bubbleRadius, padding, fill, stroke) {
	const bottomCornerRadius = 20;
	const g = d3.create("svg:g").attr("class", "package-container");
	g.append("rect")
		.attr("x", padding / 2)
		.attr("y", padding / 2)
		.attr("width", width - padding)
		.attr("height", bubbleRadius)
		.attr("fill", stroke)
		.attr("stroke", stroke)
		.attr("stroke-width", "2pt");

	g.append("path")
		.attr("d", `
			M${padding / 2},${padding / 2 + bubbleRadius}
			h${width - padding}
			v${height - bottomCornerRadius - padding - bubbleRadius}
			a${bottomCornerRadius},${bottomCornerRadius} 0 0 1 -${bottomCornerRadius},${bottomCornerRadius}
			h-${width - 2 * bottomCornerRadius - padding}
			a${bottomCornerRadius},${bottomCornerRadius} 0 0 1 -${bottomCornerRadius},-${bottomCornerRadius}
			V${padding / 2 + bubbleRadius} Z
		`)
		.attr("fill", fill)
		.attr("stroke", stroke)
		.attr("stroke-width", "2pt");
	return g;
}

/**
 * createShadow
 *   - Adds a “dropShadow” <filter> to the <defs> section of an SVG.
 *     Typically used so you can do .attr("filter", "url(#dropShadow)") 
 *     on an element.
 *
 * @param {d3.Selection<SVGSVGElement, unknown, null, undefined>} svg - A D3 selection of the <svg> to which we add <defs>.
 */
export function createShadow(svg) {
	const defs = svg.select("defs");
	const filter = defs.append("filter")
		.attr("id", "dropShadow")
		.attr("x", "-50%")
		.attr("y", "-50%")
		.attr("width", "200%")
		.attr("height", "200%");

	// Create the shadow blur
	filter.append("feGaussianBlur")
		.attr("in", "SourceAlpha")
		.attr("stdDeviation", 32) // Soft blur for the shadow
		.attr("result", "blur");

	// Offset the shadow
	filter.append("feOffset")
		.attr("in", "blur")
		.attr("dx", 0) // Horizontal offset
		.attr("dy", 16) // Vertical offset
		.attr("result", "offsetBlur");

	// Add a slight gradient to the shadow color
	filter.append("feFlood")
		.attr("flood-color", "rgba(0, 0, 0, 0.25)") // Subtle black with opacity
		.attr("result", "shadowColor");

	filter.append("feComposite")
		.attr("in", "shadowColor")
		.attr("in2", "offsetBlur")
		.attr("operator", "in")
		.attr("result", "coloredShadow");

	// Merge the shadow with the original graphic
	filter.append("feMerge")
		.selectAll("feMergeNode")
		.data(["coloredShadow", "SourceGraphic"])
		.enter()
		.append("feMergeNode")
		.attr("in", d => d);
}

/**
 * createHighlighter
 *   - Adds a “highlight” <filter> to the <defs> section. 
 *     Typically used for “focus” or “selection” highlighting 
 *     (e.g., .attr("filter", "url(#highlight)")).
 *
 * @param {d3.Selection<SVGSVGElement, unknown, null, undefined>} svg - A D3 selection of the <svg>.
 */
export function createHighlighter(svg) {
	const defs = svg.select("defs");
	const filter = defs.append("filter")
		.attr("id", "highlight")
		.attr("x", "-50%")
		.attr("y", "-50%")
		.attr("width", "200%")
		.attr("height", "200%");

	// Create a morphology-based outline (halo)
	filter.append("feMorphology")
		.attr("in", "SourceGraphic")
		.attr("operator", "dilate")
		.attr("radius", 5)
		.attr("result", "expanded");

	// Add a blur to the expanded region
	filter.append("feGaussianBlur")
		.attr("in", "expanded")
		.attr("stdDeviation", 2) // Adjust for more or less blur
		.attr("result", "blurredHalo");

	// Color the halo
	filter.append("feFlood")
		.attr("flood-color", "hsl(30, 100%, 50%)")
		.attr("flood-opacity", 1)
		.attr("result", "haloColor");

	// Combine the halo color with the blurred outline
	filter.append("feComposite")
		.attr("in", "haloColor")
		.attr("in2", "blurredHalo")
		.attr("operator", "in")
		.attr("result", "halo");

	// Merge the halo and the original graphic
	filter.append("feMerge")
		.selectAll("feMergeNode")
		.data(["halo", "SourceGraphic"])
		.enter()
		.append("feMergeNode")
		.attr("in", d => d);
}

/**
 * createGradient
 *   - Adds a radial “gradient” <defs> that can be used for “shine” or other visual effects.
 *
 * @param {d3.Selection<SVGSVGElement, unknown, null, undefined>} svg - A D3 selection of the <svg>.
 */
export function createGradient(svg) {
	const defs = svg.select("defs");
	const grad = defs
		.append("svg:radialGradient")
		.attr("gradientUnits", "objectBoundingBox")
		.attr("cx", "25%")
		.attr("cy", "25%")
		.attr("r", "100%")
		.attr("id", "gradient");

	grad
		.append("stop")
		.attr("offset", "0%")
		.style("stop-color", "hsl(0, 0%, 100%")
		.style("stop-opacity", 0.7);
	grad
		.append("stop")
		.attr("offset", "75%")
		.style("stop-color", "hsl(0, 0%, 100%")
		.style("stop-opacity", 0);
}
