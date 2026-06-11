import { classesOf, pkgDepsOf } from "../model/nodes.js";

const CLASSIFICATION_COLORS = {
	well_separated: "#16a34a",
	mostly_separated: "#d97706",
	layer_bridging: "#dc2626",
	unclassified: "#6b7280"
};

let activeContext = null;

function numberProperty(node, key, fallback = 0) {
	const value = Number(node.property(key));
	return Number.isFinite(value) ? value : fallback;
}

function allPackages(context) {
	return context.graph.nodes(node => node.hasLabel("Container") && !node.hasLabel("Structure"));
}

function layerNameOfPackage(pkg) {
	return pkg.property("layer") ||
		pkg.property("dominant_layer") ||
		pkg.property("dominantLayer") ||
		"Unassigned";
}

function packageMetrics(pkg) {
	const dependencies = pkgDepsOf(pkg);
	return {
		node: pkg,
		name: pkg.property("simpleName") || pkg.property("qualifiedName") || pkg.id(),
		qualifiedName: pkg.property("qualifiedName") || pkg.id(),
		layer: layerNameOfPackage(pkg),
		classification: pkg.property("classification") || "unclassified",
		classCount: numberProperty(pkg, "class_count", classesOf(pkg).length),
		priorityScore: numberProperty(pkg, "architecture_review_priority_score", 0),
		outgoingCount: numberProperty(pkg, "distinct_outgoing_package_count", dependencies.outgoing.length),
		incomingCount: numberProperty(pkg, "distinct_incoming_package_count", dependencies.incoming.length),
		outgoing: dependencies.outgoing
	};
}

function packageRows() {
	return activeContext ? allPackages(activeContext).map(packageMetrics) : [];
}

function selectPackage(node) {
	if (!activeContext || !node) return;
	const element = document.getElementById(node.id());
	if (!element) return;
	activeContext.dispatcher.call("select", element, node, element);
}

function clearDiagramHighlights() {
	d3.selectAll(".diagram-package-match").classed("diagram-package-match", false);
	d3.selectAll(".diagram-package-boundary-match").classed("diagram-package-boundary-match", false);
}

function highlightPackages(packages) {
	clearDiagramHighlights();
	packages.forEach(node => {
		const packageElement = d3.select(document.getElementById(node.id()));
		packageElement.classed("diagram-package-match", true);
		packageElement.select("g").classed("diagram-package-boundary-match", true);
	});
}

function renderLegend(parent) {
	const legend = parent.append("div").attr("class", "diagram-legend");
	[
		["well_separated", "well separated"],
		["mostly_separated", "mostly separated"],
		["layer_bridging", "layer bridging"]
	].forEach(([key, label]) => {
		const item = legend.append("span").attr("class", "diagram-legend-item");
		item.append("span")
			.attr("class", "diagram-legend-dot")
			.style("background-color", CLASSIFICATION_COLORS[key]);
		item.append("span").text(label);
	});
}

/**
 * renderRiskMatrix:
 *   - Plots packages by size and ARPS score to reveal high-priority packages quickly.
 *   - Uses color for classification and point size for dependency breadth.
 */
function renderRiskMatrix(parent, rows) {
	const card = parent.append("section").attr("class", "diagram-card");
	card.append("h3").text("Package Risk Matrix");
	card.append("p")
		.attr("class", "diagram-help")
		.text("X = package size, Y = ARPS score, color = classification, size = dependency breadth.");

	if (!rows.length) {
		card.append("p").attr("class", "analytics-empty").text("No package data available.");
		return;
	}

	renderLegend(card);

	const width = 520;
	const height = 230;
	const margin = { top: 12, right: 18, bottom: 40, left: 46 };
	const innerWidth = width - margin.left - margin.right;
	const innerHeight = height - margin.top - margin.bottom;
	const maxClassCount = Math.max(1, ...rows.map(row => row.classCount));
	const maxDependencyBreadth = Math.max(1, ...rows.map(row => row.outgoingCount + row.incomingCount));
	const x = d3.scaleLinear().domain([0, maxClassCount]).nice().range([0, innerWidth]);
	const y = d3.scaleLinear().domain([0, 100]).range([innerHeight, 0]);
	const radius = d3.scaleSqrt().domain([0, maxDependencyBreadth]).range([4, 13]);

	const svg = card.append("svg")
		.attr("class", "diagram-chart")
		.attr("viewBox", `0 0 ${width} ${height}`);
	const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

	g.append("g")
		.attr("transform", `translate(0,${innerHeight})`)
		.call(d3.axisBottom(x).ticks(6));
	g.append("g").call(d3.axisLeft(y).ticks(5));

	g.append("text")
		.attr("x", innerWidth / 2)
		.attr("y", innerHeight + 34)
		.attr("text-anchor", "middle")
		.attr("class", "diagram-axis-label")
		.text("Class count");
	g.append("text")
		.attr("transform", "rotate(-90)")
		.attr("x", -innerHeight / 2)
		.attr("y", -34)
		.attr("text-anchor", "middle")
		.attr("class", "diagram-axis-label")
		.text("ARPS score");

	g.selectAll("line.diagram-risk-threshold")
		.data([30, 60])
		.enter()
		.append("line")
		.attr("class", "diagram-risk-threshold")
		.attr("x1", 0)
		.attr("x2", innerWidth)
		.attr("y1", value => y(value))
		.attr("y2", value => y(value));

	g.selectAll("circle")
		.data(rows)
		.enter()
		.append("circle")
		.attr("cx", row => x(row.classCount))
		.attr("cy", row => y(row.priorityScore))
		.attr("r", row => radius(row.outgoingCount + row.incomingCount))
		.attr("fill", row => CLASSIFICATION_COLORS[row.classification] || CLASSIFICATION_COLORS.unclassified)
		.attr("fill-opacity", 0.78)
		.attr("stroke", "#ffffff")
		.attr("stroke-width", 1.5)
		.attr("tabindex", 0)
		.attr("role", "button")
		.append("title")
		.text(row => `${row.qualifiedName}\nARPS: ${row.priorityScore}\nClasses: ${row.classCount}\nDependencies: ${row.outgoingCount + row.incomingCount}`);

	g.selectAll("circle")
		.on("click", (event, row) => {
			event.stopPropagation();
			selectPackage(row.node);
		})
		.on("keydown", (event, row) => {
			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault();
				selectPackage(row.node);
			}
		});
}

/**
 * buildLayerCoupling:
 *   - Aggregates package dependencies into a layer-to-layer matrix.
 *   - Stores the source packages behind each cell so clicking a heatmap cell can highlight them.
 */
function buildLayerCoupling(rows) {
	const rowByNodeId = new Map(rows.map(row => [row.node.id(), row]));
	const layers = [...new Set(rows
		.map(row => row.layer)
		.filter(layer => layer && String(layer).toLowerCase() !== "unassigned"))]
		.sort();
	const layerIndex = new Map(layers.map((layer, index) => [layer, index]));
	const matrix = layers.map(sourceLayer => layers.map(targetLayer => ({
		sourceLayer,
		targetLayer,
		count: 0,
		sourcePackages: new Set()
	})));

	rows.forEach(sourceRow => {
		if (!layerIndex.has(sourceRow.layer)) return;
		sourceRow.outgoing.forEach(targetNode => {
			const targetRow = rowByNodeId.get(targetNode.id()) || packageMetrics(targetNode);
			if (!layerIndex.has(targetRow.layer)) return;
			const cell = matrix[layerIndex.get(sourceRow.layer)][layerIndex.get(targetRow.layer)];
			cell.count += 1;
			cell.sourcePackages.add(sourceRow.node);
		});
	});

	return {
		layers,
		cells: matrix.flat().map(cell => ({
			...cell,
			sourcePackages: [...cell.sourcePackages]
		}))
	};
}

/**
 * renderLayerHeatmap:
 *   - Shows dependency flow from source layers to target layers.
 *   - Darker cells indicate stronger layer coupling and can be clicked for package evidence.
 */
function renderLayerHeatmap(parent, rows) {
	const card = parent.append("section").attr("class", "diagram-card");
	card.append("h3").text("Layer Coupling Heatmap");
	card.append("p")
		.attr("class", "diagram-help")
		.text("Rows are source layers and columns are target layers. Darker cells mean more outgoing package dependencies.");

	const { layers, cells } = buildLayerCoupling(rows);
	if (!layers.length) {
		card.append("p").attr("class", "analytics-empty").text("No layer dependency data available.");
		return;
	}

	const cellSize = Math.max(38, Math.min(68, Math.floor(330 / layers.length)));
	const labelLeft = 122;
	const labelTop = 86;
	const width = labelLeft + layers.length * cellSize + 20;
	const height = labelTop + layers.length * cellSize + 32;
	const maxCount = Math.max(1, ...cells.map(cell => cell.count));
	const color = d3.scaleSequential(d3.interpolateYlOrRd).domain([0, maxCount]);
	const svg = card.append("svg")
		.attr("class", "diagram-chart diagram-heatmap")
		.attr("viewBox", `0 0 ${width} ${height}`);

	svg.append("text")
		.attr("x", labelLeft + (layers.length * cellSize) / 2)
		.attr("y", 16)
		.attr("text-anchor", "middle")
		.attr("class", "diagram-axis-label")
		.text("Target layer");
	svg.append("text")
		.attr("transform", `translate(15, ${labelTop + (layers.length * cellSize) / 2}) rotate(-90)`)
		.attr("text-anchor", "middle")
		.attr("class", "diagram-axis-label")
		.text("Source layer");

	svg.selectAll("text.diagram-column-label")
		.data(layers)
		.enter()
		.append("text")
		.attr("class", "diagram-tick-label")
		.attr("transform", (_, index) => `translate(${labelLeft + index * cellSize + cellSize / 2}, ${labelTop - 8}) rotate(-35)`)
		.attr("text-anchor", "start")
		.text(layer => layer);

	svg.selectAll("text.diagram-row-label")
		.data(layers)
		.enter()
		.append("text")
		.attr("class", "diagram-tick-label")
		.attr("x", labelLeft - 8)
		.attr("y", (_, index) => labelTop + index * cellSize + cellSize / 2 + 4)
		.attr("text-anchor", "end")
		.text(layer => layer);

	const cellGroup = svg.append("g").attr("transform", `translate(${labelLeft},${labelTop})`);
	cellGroup.selectAll("rect")
		.data(cells)
		.enter()
		.append("rect")
		.attr("x", cell => layerIndexOf(layers, cell.targetLayer) * cellSize)
		.attr("y", cell => layerIndexOf(layers, cell.sourceLayer) * cellSize)
		.attr("width", cellSize - 2)
		.attr("height", cellSize - 2)
		.attr("fill", cell => cell.count ? color(cell.count) : "#f3f4f6")
		.attr("stroke", "#ffffff")
		.attr("tabindex", 0)
		.attr("role", "button")
		.append("title")
		.text(cell => `${cell.sourceLayer} -> ${cell.targetLayer}: ${cell.count} package dependency link(s)`);

	cellGroup.selectAll("rect")
		.on("click", (event, cell) => {
			event.stopPropagation();
			highlightPackages(cell.sourcePackages);
		})
		.on("keydown", (event, cell) => {
			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault();
				highlightPackages(cell.sourcePackages);
			}
		});

	cellGroup.selectAll("text")
		.data(cells)
		.enter()
		.append("text")
		.attr("class", "diagram-cell-label")
		.attr("x", cell => layerIndexOf(layers, cell.targetLayer) * cellSize + cellSize / 2)
		.attr("y", cell => layerIndexOf(layers, cell.sourceLayer) * cellSize + cellSize / 2 + 4)
		.attr("text-anchor", "middle")
		.text(cell => cell.count || "");
}

function layerIndexOf(layers, layer) {
	return layers.indexOf(layer);
}

/**
 * renderReviewDiagrams:
 *   - Rebuilds the bottom review panel from the currently loaded BubbleTea graph.
 *   - Keeps the risk matrix and layer heatmap synchronized with package metadata.
 */
function renderReviewDiagrams() {
	const panel = d3.select("#review-diagrams-content");
	panel.selectChildren().remove();

	if (!activeContext) {
		panel.append("p")
			.attr("class", "analytics-empty")
			.text("Load a BubbleTea JSON file to show review diagrams.");
		return;
	}

	const rows = packageRows().filter(row => row.classCount > 0);
	renderRiskMatrix(panel, rows);
	renderLayerHeatmap(panel, rows);
}

function setPanelOpen(open) {
	const panel = document.getElementById("review-diagrams-panel");
	const container = document.getElementById("chart-container");
	if (!panel || !container) return;
	panel.classList.toggle("review-diagrams-panel-collapsed", !open);
	container.classList.toggle("bottom-diagrams-open", open);
}

/**
 * initBottomResizer:
 *   - Lets the bottom review-diagram panel be resized upward.
 *   - Stores the height as a CSS variable so it can coexist with the side panels.
 */
function initBottomResizer() {
	const handle = document.getElementById("review-diagrams-resizer");
	const panel = document.getElementById("review-diagrams-panel");
	if (!handle || !panel) return;

	handle.addEventListener("mousedown", event => {
		event.preventDefault();
		const startY = event.clientY;
		const startHeight = panel.getBoundingClientRect().height;
		document.body.style.cursor = "ns-resize";
		document.body.style.userSelect = "none";

		const onMouseMove = moveEvent => {
			const deltaY = startY - moveEvent.clientY;
			const maxHeight = Math.max(220, window.innerHeight - 120);
			const newHeight = Math.min(maxHeight, Math.max(220, startHeight + deltaY));
			document.documentElement.style.setProperty("--review-bottom-height", `${newHeight}px`);
		};

		const onMouseUp = () => {
			document.removeEventListener("mousemove", onMouseMove);
			document.removeEventListener("mouseup", onMouseUp);
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
		};

		document.addEventListener("mousemove", onMouseMove);
		document.addEventListener("mouseup", onMouseUp);
	});
}

export function initReviewDiagramsPanel() {
	const button = document.getElementById("review-diagrams-button");
	if (!button) return;
	initBottomResizer();
	button.addEventListener("click", () => {
		const panel = document.getElementById("review-diagrams-panel");
		const willOpen = panel?.classList.contains("review-diagrams-panel-collapsed");
		setPanelOpen(Boolean(willOpen));
	});
	renderReviewDiagrams();
}

export function bindReviewDiagramsContext(context) {
	activeContext = context;
	renderReviewDiagrams();
	context.dispatcher.on("select.reviewDiagramsPanel", () => renderReviewDiagrams());
	context.dispatcher.on("deselect.reviewDiagramsPanel", () => renderReviewDiagrams());
}
