import { classesOf, methodsOf, pkgDepsOf } from '../model/nodes.js';

const CHARTS = [
	{ id: "class-size", label: "Class Size", defaultVisible: true },
	{ id: "class-outgoing", label: "Class Outgoing Dependencies", defaultVisible: true },
	{ id: "class-incoming", label: "Class Incoming Dependencies", defaultVisible: true },
	{ id: "package-priority", label: "Package Review Priority", defaultVisible: true },
	{ id: "selected-package", label: "Selected Package Classes", defaultVisible: true }
];

const FILTERS = [
	{ id: "classSize", label: "Class size", target: "class", max: 80 },
	{ id: "classOutgoing", label: "Class outgoing dependencies", target: "class", max: 120 },
	{ id: "classIncoming", label: "Class incoming dependencies", target: "class", max: 120 },
	{ id: "packageClassCount", label: "Package class count", target: "package", max: 80 },
	{ id: "packagePriority", label: "Package review priority score", target: "package", max: 100 }
];

const LAYER_PACKAGE_METRICS = [
	{ id: "packageClassCount", label: "Package size (classes)", shortLabel: "Package size", color: "#7c3aed" },
	{ id: "packagePriority", label: "ARPS score", shortLabel: "ARPS score", color: "#dc2626" },
	{ id: "packageOutgoing", label: "Outgoing package dependencies", shortLabel: "Outgoing dependencies", color: "#d97706" },
	{ id: "packageIncoming", label: "Incoming package dependencies", shortLabel: "Incoming dependencies", color: "#0f766e" },
	{ id: "distinctLayerCount", label: "Package layer span", shortLabel: "Layer span", color: "#2563eb" },
	{ id: "dependsOnDistinctLayerCount", label: "Outgoing dependency layers", shortLabel: "Outgoing layers", color: "#0891b2" }
];

let activeContext = null;
let currentSelection = null;
let currentPackageSelection = null;
let activeLayerName = null;
let activeLayerMetric = "packageClassCount";
let activeFilters = [{ metric: "classSize", min: 20 }];
let activeCategoryFilter = {
	classifications: new Set(),
	priorityLevels: new Set()
};
let analyticsDataCache = emptyAnalyticsDataCache();
let visibleCharts = new Set(CHARTS.filter(chart => chart.defaultVisible).map(chart => chart.id));
let analyticsSectionOpen = {
	project: true,
	layer: true,
	package: true
};

function emptyAnalyticsDataCache() {
	return {
		context: null,
		packages: null,
		classes: null,
		classRowsWithPackageMetrics: null,
		packageByName: null,
		packageMetricsById: null
	};
}

function resetAnalyticsDataCache() {
	analyticsDataCache = emptyAnalyticsDataCache();
}

/**
 * ensureAnalyticsDataCache:
 *   - Builds class/package metric rows once per loaded JSON.
 *   - Keeps typing in filter inputs responsive by avoiding full graph scans on every keystroke.
 */
function ensureAnalyticsDataCache(context) {
	if (!context) return;
	if (analyticsDataCache.context === context && analyticsDataCache.packages && analyticsDataCache.classes) {
		return;
	}
	const packages = allPackages(context).map(packageMetrics);
	const classes = allClasses(context).map(classMetrics);
	const packageByName = new Map();
	const packageMetricsById = new Map();
	packages.forEach(row => {
		const node = row.node;
		packageMetricsById.set(node.id(), row);
		[
			node.id(),
			node.property("qualifiedName"),
			node.property("simpleName"),
			row.name
		].filter(Boolean).forEach(name => packageByName.set(name, node));
	});
	analyticsDataCache = {
		context,
		packages,
		classes,
		classRowsWithPackageMetrics: null,
		packageByName,
		packageMetricsById
	};
}

function numberProperty(node, key, fallback = 0) {
	const value = Number(node.property(key));
	return Number.isFinite(value) ? value : fallback;
}

function allPackages(context) {
	return context.graph.nodes(node => node.hasLabel("Container") && !node.hasLabel("Structure"));
}

function allClasses(context) {
	return context.graph.nodes(node => node.hasLabel("Structure"));
}

function uniqueNodes(nodes) {
	return [...new Map(nodes.filter(Boolean).map(node => [node.id(), node])).values()];
}

function classMetrics(clasz) {
	const methods = methodsOf(clasz);
	const outgoing = uniqueNodes(clasz.targets("calls"));
	const incoming = uniqueNodes(clasz.sources("calls"));
	return {
		node: clasz,
		name: clasz.property("simpleName") || clasz.property("qualifiedName") || clasz.id(),
		classSize: methods.length,
		classOutgoing: outgoing.length,
		classIncoming: incoming.length
	};
}

function packageMetrics(pkg) {
	const classes = classesOf(pkg);
	const dependencies = pkgDepsOf(pkg);
	return {
		node: pkg,
		name: pkg.property("simpleName") || pkg.property("qualifiedName") || pkg.id(),
		layer: layerNameOfPackage(pkg),
		packageClassCount: numberProperty(pkg, "class_count", classes.length),
		packagePriority: numberProperty(pkg, "architecture_review_priority_score", 0),
		packageOutgoing: numberProperty(pkg, "distinct_outgoing_package_count", dependencies.outgoing.length),
		packageIncoming: numberProperty(pkg, "distinct_incoming_package_count", dependencies.incoming.length),
		distinctLayerCount: numberProperty(pkg, "distinct_layer_count", 1),
		dependsOnDistinctLayerCount: numberProperty(pkg, "depends_on_distinct_layer_count", 0),
		classification: pkg.property("classification") || "unclassified",
		priorityLevel: pkg.property("architecture_review_priority_level") || "unknown"
	};
}

function layerNameOfPackage(pkg) {
	return pkg.property("layer") ||
		pkg.property("dominant_layer") ||
		pkg.property("dominantLayer") ||
		"Unassigned";
}

function packageOfClass(clasz) {
	if (!activeContext || !clasz) return null;
	ensureAnalyticsDataCache(activeContext);
	const packageName = clasz.property("package");
	return analyticsDataCache.packageByName?.get(packageName) || null;
}

function selectGraphNode(node) {
	if (!activeContext || !node) return;
	const element = document.getElementById(node.id());
	if (!element) return;
	activeContext.dispatcher.call("select", element, node, element);
	clearFilter();
}

function selectLayer(layerName) {
	if (!activeContext || !layerName) return;
	activeContext.dispatcher.call("layerselect", null, layerName);
}

function highlightNodes(nodes) {
	clearFilter();
	nodes.forEach(node => {
		d3.select(document.getElementById(node.id())).classed("analytics-match", true);
	});
}

/**
 * highlightPackages:
 *   - Highlights only package containers, not every class inside the package.
 *   - Used by category filters, layer rankings, and review diagrams for package-level focus.
 */
function highlightPackages(packages) {
	clearFilter();
	packages.forEach(node => {
		const packageElement = d3.select(document.getElementById(node.id()));
		packageElement.classed("analytics-package-match", true);
		packageElement.select("g").classed("analytics-package-boundary-match", true);
	});
}

function histogramBins(values, binCount = 8) {
	if (!values.length) return [];
	const sortedValues = [...values].sort((a, b) => a - b);
	const q3 = quantile(sortedValues, 0.75);
	const maxValue = Math.max(1, Math.min(sortedValues[sortedValues.length - 1], Math.max(q3 * 2, 8)));
	const step = Math.max(1, Math.ceil(maxValue / binCount));
	const bins = Array.from({ length: binCount }, (_, index) => ({
		from: index * step,
		to: index === binCount - 1 ? Number.POSITIVE_INFINITY : (index + 1) * step - 1,
		count: 0
	}));
	values.forEach(value => {
		const index = Math.min(Math.floor(value / step), bins.length - 1);
		bins[index].count += 1;
	});
	return bins;
}

function quantile(sortedValues, q) {
	if (!sortedValues.length) return 0;
	const position = (sortedValues.length - 1) * q;
	const base = Math.floor(position);
	const rest = position - base;
	if (sortedValues[base + 1] !== undefined) {
		return sortedValues[base] + rest * (sortedValues[base + 1] - sortedValues[base]);
	}
	return sortedValues[base];
}

function summarize(values) {
	if (!values.length) {
		return { min: 0, median: 0, q3: 0, max: 0, average: 0 };
	}
	const sortedValues = [...values].sort((a, b) => a - b);
	const total = values.reduce((sum, value) => sum + value, 0);
	return {
		min: sortedValues[0],
		median: quantile(sortedValues, 0.5),
		q3: quantile(sortedValues, 0.75),
		max: sortedValues[sortedValues.length - 1],
		average: total / values.length
	};
}

function renderSummaryStats(section, values) {
	const stats = summarize(values);
	const row = section.append("div").attr("class", "analytics-stats");
	[
		["avg", stats.average.toFixed(1)],
		["med", Math.round(stats.median)],
		["q3", Math.round(stats.q3)],
		["max", stats.max]
	].forEach(([label, value]) => {
		const item = row.append("span").attr("class", "analytics-stat");
		item.append("b").text(value);
		item.append("small").text(label);
	});
}

function renderHistogram(parent, title, rows, metricKey, color) {
	const section = parent.append("section").attr("class", "analytics-card");
	section.append("h3").text(title);
	const values = rows.map(row => row[metricKey]);
	if (!values.length) {
		section.append("p").attr("class", "analytics-empty").text("No data available.");
		return;
	}

	renderSummaryStats(section, values);
	const bins = histogramBins(values);
	const width = 250;
	const height = 104;
	const margin = { top: 8, right: 8, bottom: 26, left: 28 };
	const innerWidth = width - margin.left - margin.right;
	const innerHeight = height - margin.top - margin.bottom;
	const yMax = Math.max(1, ...bins.map(bin => bin.count));
	const svg = section.append("svg")
		.attr("class", "analytics-chart")
		.attr("viewBox", `0 0 ${width} ${height}`);

	const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
	const barGap = 3;
	const barWidth = innerWidth / bins.length - barGap;
	g.selectAll("rect")
		.data(bins)
		.enter()
		.append("rect")
		.attr("x", (_, index) => index * (barWidth + barGap))
		.attr("y", bin => innerHeight - (bin.count / yMax) * innerHeight)
		.attr("width", barWidth)
		.attr("height", bin => (bin.count / yMax) * innerHeight)
		.attr("fill", color);

	g.selectAll("text.analytics-bin")
		.data(bins)
		.enter()
		.append("text")
		.attr("class", "analytics-bin")
		.attr("x", (_, index) => index * (barWidth + barGap) + barWidth / 2)
		.attr("y", innerHeight + 14)
		.attr("text-anchor", "middle")
		.text(bin => Number.isFinite(bin.to) ? bin.from : `${bin.from}+`);

	g.selectAll("text.analytics-count")
		.data(bins.filter(bin => bin.count > 0))
		.enter()
		.append("text")
		.attr("class", "analytics-count")
		.attr("x", bin => bins.indexOf(bin) * (barWidth + barGap) + barWidth / 2)
		.attr("y", bin => Math.max(9, innerHeight - (bin.count / yMax) * innerHeight - 3))
		.attr("text-anchor", "middle")
		.text(bin => bin.count);

	g.append("line")
		.attr("x1", 0)
		.attr("x2", innerWidth)
		.attr("y1", innerHeight)
		.attr("y2", innerHeight)
		.attr("stroke", "#9ca3af");

	renderTopBars(section, "Top classes", rows, metricKey, color, 5);
}

function renderCategoryBars(parent, title, rows, colorFor, onRowClick = null) {
	const section = parent.append("section").attr("class", "analytics-card");
	section.append("h3").text(title);
	if (!rows.length) {
		section.append("p").attr("class", "analytics-empty").text("No data available.");
		return;
	}

	const maxCount = Math.max(1, ...rows.map(row => row.count));
	const list = section.append("div").attr("class", "analytics-bar-list");
	rows.forEach(row => {
		const item = list.append("div").attr("class", "analytics-bar-row");
		if (onRowClick) {
			item.append("button")
				.attr("class", "analytics-bar-label analytics-link")
				.attr("type", "button")
				.attr("title", `Highlight ${row.label}`)
				.text(row.label)
				.on("mousedown", event => event.preventDefault())
				.on("click", event => {
					event.preventDefault();
					event.stopPropagation();
					event.currentTarget.blur();
					onRowClick(row);
				});
		} else {
			item.append("span").attr("class", "analytics-bar-label").text(row.label);
		}
		const track = item.append("span").attr("class", "analytics-bar-track");
		track.append("span")
			.attr("class", "analytics-bar-fill")
			.style("width", `${Math.max(5, (row.count / maxCount) * 100)}%`)
			.style("background-color", colorFor(row));
		item.append("span").attr("class", "analytics-bar-value").text(row.count);
	});
}

function renderTopBars(parent, title, rows, metricKey, color, limit = 8, emptyText = "Select a package to inspect its classes.") {
	const isStandaloneCard = parent.classed && !parent.classed("analytics-card");
	const section = isStandaloneCard
		? parent.append("section").attr("class", "analytics-card")
		: parent.append("div").attr("class", "analytics-subchart");
	section.append(isStandaloneCard ? "h3" : "h4").text(title);
	if (!rows.length) {
		section.append("p").attr("class", "analytics-empty").text(emptyText);
		return;
	}

	const sorted = [...rows]
		.sort((a, b) => b[metricKey] - a[metricKey])
		.slice(0, limit);
	const maxValue = Math.max(1, ...sorted.map(row => row[metricKey]));
	const list = section.append("div").attr("class", "analytics-bar-list");
	sorted.forEach(row => {
		const item = list.append("div").attr("class", "analytics-bar-row");
		const label = item.append("button")
			.attr("class", "analytics-bar-label analytics-link")
			.attr("type", "button")
			.attr("title", `Select ${row.name}`)
			.text(row.name)
			.on("mousedown", event => {
				event.preventDefault();
			})
			.on("click", event => {
				event.preventDefault();
				event.stopPropagation();
				event.currentTarget.blur();
				selectGraphNode(row.node);
			});
		label.on("keydown", event => {
			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault();
				selectGraphNode(row.node);
			}
		});
		const track = item.append("span").attr("class", "analytics-bar-track");
		track.append("span")
			.attr("class", "analytics-bar-fill")
			.style("width", `${Math.max(5, (row[metricKey] / maxValue) * 100)}%`)
			.style("background-color", color);
		item.append("span").attr("class", "analytics-bar-value").text(row[metricKey]);
	});
}

function packageRows(context) {
	ensureAnalyticsDataCache(context);
	return analyticsDataCache.packages || [];
}

function classRows(context) {
	ensureAnalyticsDataCache(context);
	return analyticsDataCache.classes || [];
}

function selectedPackageRows() {
	if (!currentPackageSelection || !currentPackageSelection.hasLabel("Container")) {
		return [];
	}
	return classesOf(currentPackageSelection).map(classMetrics);
}

function layerSummaryRows(packages) {
	const layerPackages = packages.filter(row =>
		row.layer &&
		String(row.layer).toLowerCase() !== "unassigned" &&
		row.packageClassCount > 0
	);
	const grouped = d3.groups(layerPackages, row => row.layer)
		.map(([layer, rows]) => {
			const highRiskCount = rows.filter(row => String(row.priorityLevel).toLowerCase() === "high").length;
			const totalPriority = rows.reduce((sum, row) => sum + row.packagePriority, 0);
			const totalClasses = rows.reduce((sum, row) => sum + row.packageClassCount, 0);
			return {
				layer,
				rows,
				packageCount: rows.length,
				classCount: totalClasses,
				highRiskCount,
				averagePriority: rows.length ? totalPriority / rows.length : 0
			};
		})
		.sort((a, b) => b.packageCount - a.packageCount || a.layer.localeCompare(b.layer));
	if ((!activeLayerName || !grouped.some(row => row.layer === activeLayerName)) && grouped.length) {
		activeLayerName = grouped[0].layer;
	}
	return grouped;
}

/**
 * renderLayerAnalysis:
 *   - Summarizes packages by assigned layer and ranks packages inside the selected layer.
 *   - Lets reviewers move from a layer-level concern to the concrete packages behind it.
 */
function renderLayerAnalysis(parent, packages) {
	const layers = layerSummaryRows(packages);
	const summary = parent.append("section").attr("class", "analytics-card");
	summary.append("h3").text("Layer Summary");
	summary.append("p")
		.attr("class", "analytics-help")
		.text("Click a layer to rank only the packages assigned to that layer.");
	if (!layers.length) {
		summary.append("p").attr("class", "analytics-empty").text("No layer data available.");
		return;
	}

	const maxPackages = Math.max(1, ...layers.map(row => row.packageCount));
	const list = summary.append("div").attr("class", "analytics-bar-list");
	layers.forEach(row => {
		const item = list.append("div").attr("class", "analytics-bar-row analytics-layer-row");
		item.append("button")
			.attr("type", "button")
			.attr("class", `analytics-bar-label analytics-link analytics-layer-button${row.layer === activeLayerName ? " active" : ""}`)
			.attr("title", `Show packages in ${row.layer}`)
			.text(row.layer)
			.on("mousedown", event => event.preventDefault())
			.on("click", event => {
				event.preventDefault();
				event.stopPropagation();
				event.currentTarget.blur();
				selectLayer(row.layer);
			});
		const track = item.append("span").attr("class", "analytics-bar-track");
		track.append("span")
			.attr("class", "analytics-bar-fill")
			.style("width", `${Math.max(5, (row.packageCount / maxPackages) * 100)}%`)
			.style("background-color", "#0f766e");
		item.append("span").attr("class", "analytics-bar-value").text(row.packageCount);
		item.append("small")
			.attr("class", "analytics-layer-meta")
			.text(`${row.classCount} classes · ${row.highRiskCount} high · avg ${row.averagePriority.toFixed(1)}`);
	});

	const selectedLayer = layers.find(row => row.layer === activeLayerName) || layers[0];
	if (!selectedLayer) return;
	activeLayerName = selectedLayer.layer;
	const metric = LAYER_PACKAGE_METRICS.find(item => item.id === activeLayerMetric) || LAYER_PACKAGE_METRICS[0];
	const detail = parent.append("section").attr("class", "analytics-card");
	detail.append("h3").text(`Packages in ${selectedLayer.layer}`);
	detail.append("p")
		.attr("class", "analytics-help")
		.text("The selector below changes the package metric used for this ranking.");

	const field = detail.append("label").attr("class", "analytics-field");
	field.append("span").text("Rank by");
	const select = field.append("select")
		.attr("class", "analytics-select")
		.on("change", event => {
			activeLayerMetric = event.target.value;
			renderAnalytics({ preserveScroll: true });
		});
	select.selectAll("option")
		.data(LAYER_PACKAGE_METRICS)
		.enter()
		.append("option")
		.attr("value", item => item.id)
		.property("selected", item => item.id === activeLayerMetric)
		.text(item => item.label);

	renderTopBars(
		detail,
		metric.shortLabel || metric.label,
		selectedLayer.rows,
		metric.id,
		metric.color,
		12,
		"No packages available for this layer."
	);
}

function renderChartControls(container) {
	const controls = container.append("section").attr("class", "analytics-card analytics-controls");
	controls.append("h3").text("Charts");
	CHARTS.forEach(chart => {
		const label = controls.append("label").attr("class", "analytics-checkbox");
		label.append("input")
			.attr("type", "checkbox")
			.property("checked", visibleCharts.has(chart.id))
			.on("change", event => {
				if (event.target.checked) {
					visibleCharts.add(chart.id);
				} else {
					visibleCharts.delete(chart.id);
				}
				renderAnalytics();
			});
		label.append("span").text(chart.label);
	});
}

/**
 * renderFilterControls:
 *   - Builds the multi-metric highlight filter.
 *   - Filters are combined with AND so users can focus on classes/packages that satisfy
 *     several structural thresholds at the same time.
 */
function renderFilterControls(container) {
	const controls = container.append("section").attr("class", "analytics-card analytics-controls");
	controls.append("h3").text("Highlight Filter");

	controls.append("p")
		.attr("class", "analytics-help")
		.text("Add up to five metric thresholds. A node must match every threshold to be highlighted.");

	const rows = controls.append("div").attr("class", "analytics-filter-rows");
	activeFilters.forEach((filter, index) => renderMetricFilterRow(rows, filter, index));

	controls.append("button")
		.attr("class", "analytics-action")
		.attr("disabled", activeFilters.length >= FILTERS.length ? true : null)
		.text("Add Metric")
		.on("click", () => addMetricFilter());

	controls.append("button")
		.attr("class", "analytics-action analytics-primary-action")
		.text("Filter")
		.on("click", () => applyFilter());

	controls.append("button")
		.attr("class", "analytics-action")
		.text("Clear Highlight")
		.on("click", () => clearFilter());

	controls.append("p")
		.attr("id", "analytics-filter-summary")
		.attr("class", "analytics-summary");
}

function filterConfig(metricId) {
	return FILTERS.find(filter => filter.id === metricId) || FILTERS[0];
}

function availableFiltersForRow(rowIndex) {
	const usedByOtherRows = new Set(activeFilters
		.filter((_, index) => index !== rowIndex)
		.map(filter => filter.metric));
	return FILTERS.filter(filter => !usedByOtherRows.has(filter.id));
}

function renderMetricFilterRow(parent, filter, index) {
	const row = parent.append("div").attr("class", "analytics-metric-filter-row");
	const metricLabel = row.append("label").attr("class", "analytics-field analytics-filter-metric");
	metricLabel.append("span").text(index === 0 ? "Metric" : "And");
	const select = metricLabel.append("select")
		.attr("class", "analytics-select")
		.on("change", event => {
			const config = filterConfig(event.target.value);
			activeFilters[index].metric = config.id;
			activeFilters[index].min = Math.min(activeFilters[index].min, config.max);
			renderAnalytics({ preserveScroll: true });
		});
	select.selectAll("option")
		.data(availableFiltersForRow(index))
		.enter()
		.append("option")
		.attr("value", option => option.id)
		.property("selected", option => option.id === filter.metric)
		.text(option => option.label);

	const config = filterConfig(filter.metric);
	const thresholdLabel = row.append("label").attr("class", "analytics-field analytics-filter-threshold");
	thresholdLabel.append("span").text("Minimum");
	thresholdLabel.append("input")
		.attr("type", "number")
		.attr("min", 0)
		.attr("max", config.max)
		.attr("value", filter.min)
		.on("input", event => {
			activeFilters[index].min = Number(event.target.value) || 0;
			updateFilterSummary();
		});

	if (activeFilters.length > 1) {
		row.append("button")
			.attr("type", "button")
			.attr("class", "analytics-remove-filter")
			.attr("title", "Remove metric")
			.text("x")
			.on("click", () => removeMetricFilter(index));
	}
}

function addMetricFilter() {
	if (activeFilters.length >= FILTERS.length) return;
	const used = new Set(activeFilters.map(filter => filter.metric));
	const next = FILTERS.find(filter => !used.has(filter.id));
	if (!next) return;
	activeFilters.push({ metric: next.id, min: 0 });
	renderAnalytics({ preserveScroll: true });
}

function removeMetricFilter(index) {
	if (activeFilters.length <= 1) return;
	activeFilters.splice(index, 1);
	renderAnalytics({ preserveScroll: true });
}

function categoryOptions(rows, key, excludedValues = []) {
	const excluded = new Set(excludedValues.map(value => String(value).toLowerCase()));
	return [...new Set(rows
		.map(row => row[key])
		.filter(value => value && !excluded.has(String(value).toLowerCase())))]
		.sort((a, b) => String(a).localeCompare(String(b)));
}

function renderCategoryFilterGroup(parent, title, values, selectedSet) {
	const group = parent.append("fieldset").attr("class", "analytics-filter-group");
	group.append("legend").text(title);
	if (!values.length) {
		group.append("p").attr("class", "analytics-empty").text("No categories available.");
		return;
	}
	const options = group.append("div").attr("class", "analytics-filter-options");
	values.forEach(value => {
		const label = options.append("label").attr("class", "analytics-checkbox analytics-filter-checkbox");
		label.append("input")
			.attr("type", "checkbox")
			.property("checked", selectedSet.has(value))
			.on("change", event => {
				if (event.target.checked) {
					selectedSet.add(value);
				} else {
					selectedSet.delete(value);
				}
				updateCategoryFilterSummary();
			});
		label.append("span").text(value);
	});
}

/**
 * renderCategoryFilterControls:
 *   - Builds the package-level classification and review-priority filter.
 *   - Values inside one group are OR-combined; classification and priority groups are AND-combined.
 */
function renderCategoryFilterControls(container, packages) {
	const controls = container.append("section").attr("class", "analytics-card analytics-controls");
	controls.append("h3").text("Package Category Filter");
	controls.append("p")
		.attr("class", "analytics-help")
		.text("Select one or more classifications and priority levels. Values within a group are combined as OR; selected groups are combined as AND.");

	renderCategoryFilterGroup(
		controls,
		"Classification",
		categoryOptions(packages, "classification", ["unclassified"]),
		activeCategoryFilter.classifications
	);
	renderCategoryFilterGroup(
		controls,
		"Review priority",
		categoryOptions(packages, "priorityLevel", ["unknown"]),
		activeCategoryFilter.priorityLevels
	);

	controls.append("button")
		.attr("class", "analytics-action analytics-primary-action")
		.text("Filter Packages")
		.on("click", () => applyCategoryFilter());

	controls.append("button")
		.attr("class", "analytics-action")
		.text("Clear Category Filter")
		.on("click", () => clearCategoryFilter(true));

	controls.append("p")
		.attr("id", "analytics-category-filter-summary")
		.attr("class", "analytics-summary");
}

function analyticsScrollElements() {
	return [
		document.getElementById("analytics-content"),
		document.getElementById("analytics-panel")
	].filter(Boolean);
}

function renderAnalyticsSection(parent, id, title, renderContent) {
	const details = parent.append("details")
		.attr("class", "analytics-section")
		.property("open", analyticsSectionOpen[id] ?? true)
		.on("toggle", event => {
			analyticsSectionOpen[id] = event.currentTarget.open;
		});
	details.append("summary")
		.attr("class", "analytics-section-title")
		.text(title);
	const content = details.append("div")
		.attr("class", "analytics-section-content");
	renderContent(content);
}

/**
 * renderAnalytics:
 *   - Rebuilds the left analytics panel after selection or filter changes.
 *   - Optionally restores scroll position so clicking chart rows does not jump the panel to the top.
 */
function renderAnalytics(options = {}) {
	const scrollPositions = options.preserveScroll
		? analyticsScrollElements().map(element => ({ element, top: element.scrollTop, left: element.scrollLeft }))
		: [];
	const panel = d3.select("#analytics-content");
	panel.selectChildren().remove();

	if (!activeContext) {
		panel.append("h2").text("Project Analytics");
		panel.append("p").attr("class", "analytics-empty").text("Load a BubbleTea JSON file to show project charts.");
		restoreAnalyticsScroll(scrollPositions);
		return;
	}

	const classes = classRows(activeContext);
	const packages = packageRows(activeContext);
	const classifiedPackages = packages.filter(pkg => String(pkg.classification).toLowerCase() !== "unclassified");
	const knownPriorityPackages = packages.filter(pkg => String(pkg.priorityLevel).toLowerCase() !== "unknown");
	const classificationCounts = d3.rollups(
		classifiedPackages,
		values => values.length,
		row => row.classification
	).map(([label, count]) => ({ label, count }));
	const priorityCounts = d3.rollups(
		knownPriorityPackages,
		values => values.length,
		row => row.priorityLevel
	).map(([label, count]) => ({ label, count }));

	renderAnalyticsSection(panel, "project", "Project Analytics", section => {
		renderChartControls(section);
		renderFilterControls(section);
		renderCategoryFilterControls(section, packages);

		if (visibleCharts.has("class-size")) {
			renderHistogram(section, "Project Class Size", classes, "classSize", "#2563eb");
		}
		if (visibleCharts.has("class-outgoing")) {
			renderHistogram(section, "Class Outgoing Dependencies", classes, "classOutgoing", "#d97706");
		}
		if (visibleCharts.has("class-incoming")) {
			renderHistogram(section, "Class Incoming Dependencies", classes, "classIncoming", "#7c3aed");
		}
		if (visibleCharts.has("package-priority")) {
			renderCategoryBars(
				section,
				"Package Classifications",
				classificationCounts,
				() => "#0f766e",
				row => {
					const matches = packages
						.filter(pkg => pkg.classification === row.label)
						.map(pkg => pkg.node);
					highlightPackages(matches);
				}
			);
			renderCategoryBars(section, "Review Priority Levels", priorityCounts, row => {
				if (String(row.label).toLowerCase() === "high") return "#dc2626";
				if (String(row.label).toLowerCase() === "medium") return "#d97706";
				return "#16a34a";
			}, row => {
				const matches = packages
					.filter(pkg => pkg.priorityLevel === row.label)
					.map(pkg => pkg.node);
				highlightPackages(matches);
			});
		}
	});

	renderAnalyticsSection(panel, "layer", "Layer Analytics", section => {
		renderLayerAnalysis(section, packages);
	});

	renderAnalyticsSection(panel, "package", "Package Analytics", section => {
		section.append("h4").text("Selected Package: " + (currentPackageSelection ? currentPackageSelection.property("qualifiedName") || currentPackageSelection.property("simpleName") || currentPackageSelection.id() : "None"));
		if (visibleCharts.has("selected-package")) {
			const selectedRows = selectedPackageRows();
			renderTopBars(section, "Selected Package Classes by Size", selectedRows, "classSize", "#7c3aed");
			renderTopBars(section, "Selected Package Classes by Outgoing Calls", selectedRows, "classOutgoing", "#d97706", 5);
			renderTopBars(section, "Selected Package Classes by Incoming Calls", selectedRows, "classIncoming", "#0f766e", 5);
		}
	});

	updateFilterSummary();
	updateCategoryFilterSummary();
	restoreAnalyticsScroll(scrollPositions);
}

function restoreAnalyticsScroll(scrollPositions) {
	if (!scrollPositions.length) return;
	const restore = () => {
		scrollPositions.forEach(({ element, top, left }) => {
			element.scrollTop = top;
			element.scrollLeft = left;
		});
	};
	restore();
	requestAnimationFrame(() => {
		restore();
		requestAnimationFrame(restore);
	});
}

/**
 * filterMatches:
 *   - Evaluates all active metric thresholds against cached class or package rows.
 *   - If any class metric is selected, class rows are used; otherwise package rows are used.
 */
function filterMatches() {
	if (!activeContext) return [];
	const hasClassFilter = activeFilters.some(filter => filterConfig(filter.metric).target === "class");
	const rows = hasClassFilter ? classRowsWithPackageMetrics(activeContext) : packageRows(activeContext);
	return rows.filter(row => activeFilters.every(filter => {
		const value = Number(row[filter.metric]);
		return Number.isFinite(value) && value >= filter.min;
	}));
}

/**
 * classRowsWithPackageMetrics:
 *   - Extends class rows with parent-package metrics so mixed class/package filters can work.
 *   - Example: class size >= 20 AND parent package ARPS >= 60.
 */
function classRowsWithPackageMetrics(context) {
	ensureAnalyticsDataCache(context);
	if (analyticsDataCache.classRowsWithPackageMetrics) {
		return analyticsDataCache.classRowsWithPackageMetrics;
	}
	analyticsDataCache.classRowsWithPackageMetrics = classRows(context).map(row => {
		const pkg = packageOfClass(row.node);
		if (!pkg) return row;
		const pkgRow = analyticsDataCache.packageMetricsById?.get(pkg.id());
		if (!pkgRow) return row;
		return {
			...row,
			packageClassCount: pkgRow.packageClassCount,
			packagePriority: pkgRow.packagePriority
		};
	});
	return analyticsDataCache.classRowsWithPackageMetrics;
}

function updateFilterSummary() {
	const summary = document.getElementById("analytics-filter-summary");
	if (!summary || !activeContext) return;
	const hasClassFilter = activeFilters.some(filter => filterConfig(filter.metric).target === "class");
	summary.textContent = `${filterMatches().length} ${hasClassFilter ? "classes" : "packages"} match.`;
}

function hasActiveCategoryFilter() {
	return activeCategoryFilter.classifications.size > 0 ||
		activeCategoryFilter.priorityLevels.size > 0;
}

function categoryFilterMatches() {
	if (!activeContext || !hasActiveCategoryFilter()) return [];
	return packageRows(activeContext).filter(row => {
		const classificationMatches = !activeCategoryFilter.classifications.size ||
			activeCategoryFilter.classifications.has(row.classification);
		const priorityMatches = !activeCategoryFilter.priorityLevels.size ||
			activeCategoryFilter.priorityLevels.has(row.priorityLevel);
		return classificationMatches && priorityMatches;
	});
}

function updateCategoryFilterSummary() {
	const summary = document.getElementById("analytics-category-filter-summary");
	if (!summary || !activeContext) return;
	if (!hasActiveCategoryFilter()) {
		summary.textContent = "Choose categories to filter packages.";
		return;
	}
	summary.textContent = `${categoryFilterMatches().length} packages match selected categories.`;
}

function clearFilter() {
	d3.selectAll(".analytics-match").classed("analytics-match", false);
	d3.selectAll(".analytics-package-match").classed("analytics-package-match", false);
	d3.selectAll(".analytics-package-boundary-match").classed("analytics-package-boundary-match", false);
	updateFilterSummary();
	updateCategoryFilterSummary();
}

function applyFilter() {
	clearFilter();
	const matches = filterMatches();
	const hasClassFilter = activeFilters.some(filter => filterConfig(filter.metric).target === "class");
	if (hasClassFilter) {
		matches.forEach(row => {
			d3.select(document.getElementById(row.node.id())).classed("analytics-match", true);
		});
	} else {
		highlightPackages(matches.map(row => row.node));
	}
	updateFilterSummary();
}

function clearCategoryFilter(resetSelections = false) {
	clearFilter();
	if (resetSelections) {
		activeCategoryFilter.classifications.clear();
		activeCategoryFilter.priorityLevels.clear();
		renderAnalytics({ preserveScroll: true });
		return;
	}
	updateCategoryFilterSummary();
}

function applyCategoryFilter() {
	clearFilter();
	const matches = categoryFilterMatches();
	highlightPackages(matches.map(row => row.node));
	updateCategoryFilterSummary();
}

function setPanelOpen(open) {
	const panel = document.getElementById("analytics-panel");
	const container = document.getElementById("chart-container");
	if (!panel || !container) return;
	panel.classList.toggle("analytics-panel-collapsed", !open);
	container.classList.toggle("analytics-open", open);
	document.documentElement.style.setProperty("--review-left-offset", open ? "292px" : "0px");
}

export function initAnalyticsPanel() {
	const button = document.getElementById("analytics-button");
	if (!button) return;
	button.addEventListener("click", () => {
		const panel = document.getElementById("analytics-panel");
		const willOpen = panel?.classList.contains("analytics-panel-collapsed");
		setPanelOpen(Boolean(willOpen));
	});
	renderAnalytics();
}

export function bindAnalyticsContext(context) {
	activeContext = context;
	currentSelection = null;
	currentPackageSelection = null;
	activeLayerName = null;
	resetAnalyticsDataCache();
	activeCategoryFilter.classifications.clear();
	activeCategoryFilter.priorityLevels.clear();
	renderAnalytics();

	context.dispatcher.on("select.analyticsPanel", (node) => {
		currentSelection = node;
		if (node?.hasLabel("Container")) {
			currentPackageSelection = node;
		} else if (node?.hasLabel("Structure")) {
			currentPackageSelection = packageOfClass(node) || currentPackageSelection;
		}
		renderAnalytics({ preserveScroll: true });
	});
	context.dispatcher.on("deselect.analyticsPanel", () => {
		currentSelection = null;
		currentPackageSelection = null;
		renderAnalytics({ preserveScroll: true });
	});
	context.dispatcher.on("layerselect.analyticsPanel", (layerName) => {
		activeLayerName = layerName;
		renderAnalytics({ preserveScroll: true });
	});
}
