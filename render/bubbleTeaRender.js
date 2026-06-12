import { layerCompositionComparatorWithContext, dominatingLayersWithContext } from '../model/composition.js';
import { drawBubbleWithContext } from './bubbleRender.js';
import { average, stringToHue } from '../utils/utils.js';
import { calculatePositions, calculateLayoutDimensions, drawLayoutContainer } from './layoutUtils.js';

function isHighReviewPriority(pkg) {
	const priorityLevel = pkg.property("architecture_review_priority_level");
	return String(priorityLevel ?? "").toLowerCase() === "high";
}

function formatRatio(value) {
	const number = Number(value);
	return Number.isFinite(number) ? number.toFixed(2) : "n/a";
}

function highReviewPriorityTooltip(pkg) {
	const level = String(pkg.property("architecture_review_priority_level") ?? "high");
	const score = pkg.property("architecture_review_priority_score");
	const classification = pkg.property("classification") || "unclassified";
	const outgoingRatio = formatRatio(pkg.property("cross_layer_outgoing_dependency_ratio"));
	const incomingRatio = formatRatio(pkg.property("cross_layer_incoming_dependency_ratio"));
	const dependencyLayers = pkg.property("depends_on_distinct_layer_count") ?? 0;
	const reason = pkg.property("architecture_review_priority_reason");
	const scoreText = score !== undefined && score !== null && score !== ""
		? ` ${score}/100`
		: "";

	return [
		`${level[0]?.toUpperCase() ?? "H"}${level.slice(1)} ARPS${scoreText}: ${classification}`,
		`cross-layer outgoing ratio ${outgoingRatio}`,
		`cross-layer incoming ratio ${incomingRatio}`,
		`${dependencyLayers} outgoing dependency layer(s)`,
		reason ? `Reason: ${reason}` : ""
	].filter(Boolean).join("; ");
}

function drawHighReviewPriorityMarker(g, pkg, padding) {
	const marker = g.append("g")
		.attr("class", "high-review-priority-marker")
		.attr("transform", `translate(${padding / 2 + 2}, ${padding / 2 + 2})`)
		.style("filter", "drop-shadow(0 0 2px rgba(0, 0, 0, 0.65))")
		.style("pointer-events", "all");

	marker.append("title").text(highReviewPriorityTooltip(pkg));

	marker.append("circle")
		.attr("r", 10)
		.attr("fill", "#111827")
		.attr("stroke", "#ffffff")
		.attr("stroke-width", 3);

	marker.append("circle")
		.attr("r", 10)
		.attr("fill", "none")
		.attr("stroke", "#111827")
		.attr("stroke-width", 1.5);

	marker.append("text")
		.attr("x", 0)
		.attr("y", 5.5)
		.attr("text-anchor", "middle")
		.attr("font-size", 15)
		.attr("font-weight", "bold")
		.attr("font-family", "Arial, sans-serif")
		.attr("fill", "#ffffff")
		.text("!");
}

function reviewText(pkg) {
	return [
		pkg.property("llm_improvement_suggestion"),
		pkg.property("recommended_review_action")
	]
		.filter(value => value != null)
		.join("\n");
}

function classDisplayNames(clasz) {
	const simpleName = String(clasz.property("simpleName") ?? "");
	const qualifiedName = String(clasz.property("qualifiedName") ?? "");
	const names = new Set();

	if (simpleName) {
		names.add(simpleName);
		names.add(simpleName.split("$").pop());
	}

	if (qualifiedName) {
		const lastPart = qualifiedName.split(".").pop();
		names.add(lastPart);
		names.add(lastPart.split("$").pop());
	}

	return [...names]
		.map(name => name.trim())
		.filter(name => name.length >= 3);
}

function classNeedsReview(pkg, clasz) {
	return Boolean(clasz.property("class_review_hint"));
}

function drawClassReviewMarker(bubble, clasz) {
	const marker = bubble.append("g")
		.attr("class", "class-review-marker")
		.attr("transform", "translate(-9, -9)")
		.style("filter", "drop-shadow(0 0 1.5px rgba(0, 0, 0, 0.65))")
		.style("pointer-events", "all");

	marker.append("title").text(clasz.property("class_review_hint") || "Class marked for review.");

	marker.append("circle")
		.attr("r", 7)
		.attr("fill", "#111827")
		.attr("stroke", "#ffffff")
		.attr("stroke-width", 2.3);

	marker.append("circle")
		.attr("r", 7)
		.attr("fill", "none")
		.attr("stroke", "#111827")
		.attr("stroke-width", 1);

	marker.append("text")
		.attr("x", 0)
		.attr("y", 4)
		.attr("text-anchor", "middle")
		.attr("font-size", 10.5)
		.attr("font-weight", "bold")
		.attr("font-family", "Arial, sans-serif")
		.attr("fill", "#ffffff")
		.text("!");
}

/**
 * drawBubbleTeaWithContext(context)
 *   - Returns a function that, given one "bubbleTeaData" object, renders
 *     a labeled container holding multiple bubbles (pie charts),
 *     sorted and arranged in a grid-like layout.
 *
 * @param {Object} context - Your global config object, e.g. { layers, arrowRenderer, infoPanel, ... }
 * @returns {(bubbleTeaData: Object) => d3.Selection<SVGGElement, unknown, null, undefined> | null}
 */
export function drawBubbleTeaWithContext(context) {
	// We do partial application: pass in 'context' first, get back a function
	return (bubbleTeaData) => {
		const compare = layerCompositionComparatorWithContext(context);
		const drawBubble = drawBubbleWithContext(context);
		const { package: pkg, dominant, bubbleData: data } = bubbleTeaData;
	
		if (data.length === 0) return null;
	
		const pkgName = pkg.property("simpleName");
		const bubbleRadius = 20;
		const padding = 10;
	
		// Calculate positions and layout dimensions
		const positions = calculatePositions(data.length, bubbleRadius, padding);
		const { layoutWidth, layoutHeight } = calculateLayoutDimensions(positions, bubbleRadius, padding);
	
		// Create SVG container
		// const svg = d3.create("svg");
		const g = d3.create("svg:g");
	
		// Draw layout container with calculated dimensions
		const my_hue = average(dominant.map(stringToHue));
		const fill = "hsl(24, 46%, 86%)";//dominant.length > 0 ? `hsl(${my_hue}, 60%, 80%)` : "hsl(0, 0%, 80%)";
		const stroke = dominant.length > 0 ? `hsl(${my_hue}, 50%, 30%)` : "hsl(0, 0%, 30%)";
		const pkgG = drawLayoutContainer(layoutWidth, layoutHeight, bubbleRadius, padding, fill, stroke);
		g
			.attr("class", "tea")
			.attr("id", pkg.id())
			.style("pointer-events", "all")
			.datum(pkg);
		g.node().appendChild(pkgG.node());
		if (isHighReviewPriority(pkg)) {
			drawHighReviewPriorityMarker(g, pkg, padding);
		}
		// Sort and map bubble data to draw pie charts
		data
			.sort((a, b) => compare(a.bubbleData)(b.bubbleData))
			.forEach((d, index) => {
				const [xPos, yPos] = positions[index];
				const bubble = drawBubble(d);
				if (classNeedsReview(pkg, d.class)) {
					drawClassReviewMarker(bubble, d.class);
				}
				g.node().appendChild(bubble.node());
				d3.select(bubble.node())
					.attr("transform", `translate(${xPos}, ${yPos})`);
			});
	
		// Add package name text
		g.append("text")
			.attr("x", layoutWidth / 2)
			.attr("y", 0)
			.attr("text-anchor", "middle")
			.style("font-size", "20px")
			.text(pkgName);
	
		const pkgLayer = dominant.length == 0 ? "Cross-cutting" : dominant.join(", ");
		pkg.property("layer", pkgLayer);
		data.forEach(({ class: clasz, bubbleData }) => {
			const clsDominant = dominatingLayersWithContext(context)(bubbleData);
			const clsLayer = clsDominant.length == 0 ? "Cross-cutting" : clsDominant.join(", ");
			clasz.property("layer", clsLayer);
		});
	
		return g;
	};
}
