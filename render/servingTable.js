import { drawBubbleTeaWithContext } from "./bubbleTeaRender.js?v=20260610c";
import { average, max, stringToHue } from "../utils/utils.js";
import {
	createGradient,
	createHighlighter,
	createShadow
} from './layoutUtils.js';

/**
 * measureSvgContent
 *   - Remains the same. Used to measure the bounding box of a <g> element by cloning it off-screen.
 */
export function measureSvgContent(g) {
	// Create an off-screen container
	const offscreenDiv = d3.select("body")
		.append("div")
		.attr("id", "dummy")
		.style("position", "absolute")
		.style("visibility", "hidden");

	// Append the SVG string to the container
	const svg = offscreenDiv.append("svg");
	const gClone = g.node().cloneNode(true);
	svg.node().appendChild(gClone);

	// Measure dimensions
	const bbox = svg.node().getBBox();

	// Clean up
	offscreenDiv.remove();

	return bbox;
}

/**
 * generateLayerOrder:
 *   - Creates an array of single-layer and adjacent-layer combinations,
 *     plus an empty array entry for cross-cutting.
 */
function generateLayerOrder(layers) {
	const layerOrder = [];

	// Combinations of consecutive layers (pairs)
	for (let i = 0; i < layers.length - 1; i++) {
		layerOrder.push([layers[i]]);
		layerOrder.push([layers[i], layers[i + 1]]);
	}
	layerOrder.push([layers[layers.length - 1]]);

	// Add the cross-cutting layer (represented by an empty array)
	layerOrder.push([]);

	return layerOrder;
}

/**
 * categorizeBubbleTeaData:
 *   - Builds a dictionary from "layerName" (string) -> array of bubbleTeaData.
 *   - If a bubbleTeaData doesn't match any key, it goes to the cross-cutting array.
 */
function categorizeBubbleTeaData(bubbleTeaDataArray, context, layerOrder) {
	// Prepare an object keyed by each layer combination string
	const layersMap = {};
	layerOrder.forEach(layer => (layersMap[layer.join(", ")] = []));

	bubbleTeaDataArray.forEach(bubbleTeaData => {
		// Sort the dominant layers in the same order as context.layers
		const key = bubbleTeaData.dominant
			.sort((a, b) => context.layers.indexOf(a) - context.layers.indexOf(b))
			.join(", ");

		if (key in layersMap) {
			layersMap[key].push(bubbleTeaData);
		} else {
			// If not found, we treat it as cross-cutting
			bubbleTeaData.dominant = [];
			layersMap[""].push(bubbleTeaData);
		}
	});

	return layersMap;
}

/**
 * drawCrossCuttingLayer:
 *   - Handles the special cross-cutting layer (empty key ""), placing it first on the right side.
 *   - Returns updated tableWidth, possible grey_area reference, and its total height.
 */
function drawCrossCuttingLayer({
	items,
	tableWidth,
	bubbleSpacing,
	servingTableG,
	drawBubbleTea
}) {
	let grey_area = null;
	let grey_height = 0;

	if (items.length === 0) {
		return { tableWidth, grey_area, grey_height };
	}

	// We place these cross-cutting items first, aligned to the right
	const layerName = "Cross-cutting";
	const layer_group = servingTableG.insert("g", ":first-child")
		.attr("class", "layer-group")
		.attr("data-layer-name", layerName)
		.attr("x", 0)
		.attr("y", 0);

	const fill = "hsl(0, 0%, 95%)";
	const stroke = "hsl(0, 0%, 40%)";

	// Render each item
	const bboxes = [];
	const groups = items.map(drawBubbleTea)
		.filter(e => e != null)
		.map(tea => {
			const bbox = measureSvgContent(tea);
			bboxes.push(bbox);
			return tea;
		});

	if (bboxes.length > 0) {
		const layerWidth = max(bboxes.map(b => b.width)) + 2 * bubbleSpacing;

		let yOffset = 2 * bubbleSpacing;

		layer_group.attr("transform", `translate(${tableWidth - layerWidth}, 0)`);

		groups.forEach((g, i) => {
			servingTableG.node().append(g.node());
			const bbox = bboxes[i];
			g.attr(
				"transform",
				`translate(${(tableWidth - layerWidth) + (layerWidth - bbox.width) / 2}, ${yOffset + bubbleSpacing / 2})`
			);
			yOffset += bbox.height + bubbleSpacing;
		});

		// Title text
		layer_group.insert("text", ":first-child")
			.attr("x", 10)
			.attr("y", 24)
			.attr("font-size", 20)
			.attr("font-weight", "bold")
			.attr("fill", "white")
			.text(layerName);

		// Title background rect
		layer_group.insert("rect", ":first-child")
			.attr("x", 0)
			.attr("y", 0)
			.attr("width", layerWidth)
			.attr("height", 36)
			.attr("fill", stroke);

		// The main grey area behind everything
		grey_area = layer_group.insert("rect", ":first-child")
			.attr("x", 0)
			.attr("y", 0)
			.attr("width", layerWidth)
			.attr("fill", fill);

		tableWidth -= layerWidth; // shrink the table's available width
		grey_height = yOffset;
	}

	return { tableWidth, grey_area, grey_height };
}

/**
 * drawMainLayers:
 *   - Iterates over the remaining layer keys (excluding ""), 
 *     draws each section with its color, label, and bubble teas.
 *
 * Returns the final updated { totalHeight, lastRect }.
 */
function drawMainLayers({
	layersMap,
	tableWidth,
	bubbleSpacing,
	servingTableG,
	drawBubbleTea,
	totalHeight
}) {
	let last_rect = null;

	// Filter out cross-cutting key: we only want the others
	Object.entries(layersMap)
		.filter(([layerName]) => layerName) // remove "" key
		.forEach(([layerName, items]) => {
			if (items.length === 0) return;

			const layer_group = servingTableG.insert("g", ":first-child")
				.attr("class", "layer-group")
				.attr("data-layer-name", layerName)
				.attr("x", 0)
				.attr("y", 0);

			const layerNames = layerName ? layerName.split(", ") : [];
			const my_hue = average(layerNames.map(stringToHue));
			const fill = layerNames.length > 0
				? `hsl(${my_hue}, 50%, 90%)`
				: "hsl(0, 0%, 90%)";
			const stroke = layerNames.length > 0
				? `hsl(${my_hue}, 90%, 40%)`
				: "hsl(0, 0%, 40%)";

			// Title background
			layer_group.append("rect")
				.attr("x", 0)
				.attr("y", 0)
				.attr("width", tableWidth)
				.attr("height", 36)
				.attr("fill", stroke);

			// Title text
			layer_group.append("text")
				.attr("x", 10)
				.attr("y", 24)
				.attr("font-size", 20)
				.attr("font-weight", "bold")
				.attr("fill", "white")
				.text(layerName);

			// Render each item
			const bboxes = [];
			const groups = items.map(drawBubbleTea)
				.filter(e => e != null)
				.map(tea => {
					const bbox = measureSvgContent(tea);
					bboxes.push(bbox);
					return tea;
				});

			const maxTeaHeight = max(bboxes.map(b => b.height));
			const layerHeight = maxTeaHeight + 2 * bubbleSpacing;
			const layerOffset = totalHeight;

			// Position this layer group
			layer_group.attr("transform", `translate(0, ${totalHeight})`);
			totalHeight += layerHeight + bubbleSpacing;

			let xOffset = bubbleSpacing;
			let yOffset = layerHeight;

			groups.forEach((g, i) => {
				servingTableG.node().append(g.node());
				const bbox = bboxes[i];

				// If we exceed the tableWidth, move to a new row
				if (xOffset + bbox.width + bubbleSpacing > tableWidth) {
					xOffset = bubbleSpacing;
					yOffset += layerHeight;
					totalHeight += layerHeight; // expand total height
				}
				g.attr(
					"transform",
					`translate(${xOffset - bbox.x}, ${layerOffset + yOffset - maxTeaHeight + bubbleSpacing / 2})`
				);
				xOffset += bbox.width + bubbleSpacing;
			});

			// The main rect behind everything for this layer
			last_rect = layer_group.insert("rect", ":first-child")
				.attr("x", 0)
				.attr("y", 0)
				.attr("width", tableWidth)
				.attr("height", yOffset + bubbleSpacing)
				.attr("fill", fill);
		});

	return { totalHeight, lastRect: last_rect };
}

/**
 * finalizeTable:
 *   - Inserts a rect behind everything, adjusts cross-cutting rect height if needed,
 *     and applies the dropShadow filter.
 */
function finalizeTable({
	servingTableG,
	tableWidth,
	totalHeight,
	lastRect,
	grey_area,
	grey_height,
	svgWidth
}) {
	const final_height = max([grey_height, totalHeight]);

	// Insert a big rect behind everything for background
	servingTableG.insert("rect", ":first-child")
		.attr("x", 0)
		.attr("y", 0)
		.attr("width", tableWidth)
		.attr("height", final_height)
		.attr("fill", lastRect ? lastRect.attr("fill") : "hsl(0, 0%, 90%)");

	// If we had a cross-cutting grey_area, set its height
	if (grey_area) {
		grey_area.attr("height", final_height);
	}

	servingTableG
		.attr("x", 0)
		.attr("y", 0)
		.attr("width", svgWidth)
		.attr("height", final_height)
		.attr("filter", "url(#dropShadow)");

	return final_height;
}

/**
 * drawServingTableWithContext:
 *   - Orchestrates rendering of multiple bubble teas (packages),
 *     grouped by layer or cross-cutting, into a single <svg>.
 */
export const drawServingTableWithContext = (context) => (bubbleTeaDataArray) => {
	// 1) Precompute layer order from context.layers (skipping the first 'null'?)
	const layerOrder = generateLayerOrder(context.layers.slice(1));

	// 2) Build a map from layerKey -> array of bubbleTeaData
	const layersMap = categorizeBubbleTeaData(bubbleTeaDataArray, context, layerOrder);

	// 3) Create <svg> and main <g> for the serving table
	const svgWidth = 1200;
	let tableWidth = svgWidth;
	const bubbleSpacing = 30; // Spacing between groups
	let totalHeight = 0;

	const servingTable = d3.create("svg");
	const servingTableG = servingTable
		.append("g")
		.attr("id", "serving-table")
		.attr("x", 0)
		.attr("y", 0);

	// Insert <defs> for shadows & gradients
	servingTable.append("defs");
	createShadow(servingTable);
	createGradient(servingTable);
	createHighlighter(servingTable);

	// 4) Handle the cross-cutting layer (key == "")
	const drawBubbleTea = drawBubbleTeaWithContext(context);
	const crossCuttingItems = layersMap[""];
	const {
		tableWidth: newTableWidth,
		grey_area,
		grey_height
	} = drawCrossCuttingLayer({
		items: crossCuttingItems,
		tableWidth,
		bubbleSpacing,
		servingTableG,
		drawBubbleTea
	});
	tableWidth = newTableWidth; // updated

	// 5) Handle all main layers
	const { totalHeight: newTotalHeight, lastRect } = drawMainLayers({
		layersMap,
		tableWidth,
		bubbleSpacing,
		servingTableG,
		drawBubbleTea,
		totalHeight
	});
	totalHeight = newTotalHeight;

	// 6) Finalize the table layout (background, filter, cross-cutting rect, etc.)
	finalizeTable({
		servingTableG,
		tableWidth,
		totalHeight,
		lastRect,
		grey_area,
		grey_height,
		svgWidth
	});

	return servingTable;
};
