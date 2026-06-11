import { pkgDepsOf } from "../model/nodes.js";
import { getTransformedPosition, bringToFront } from "../utils/domUtils.js";

export const clearArrows = (sel) => () => {
	const svg = d3.select(sel);
	svg.selectAll(".dep-line, .dep-arrow").remove();
}

function placeLineBehindPackages(g, line) {
	const firstPackage = g.select(".tea").node();
	const lineNode = line.node();
	if (firstPackage && lineNode && firstPackage.parentNode === lineNode.parentNode) {
		firstPackage.parentNode.insertBefore(lineNode, firstPackage);
	}
}

// Arrow renderer
export const displayArrows = (sel) => (node) => {
	
	const svg = d3.select(sel);
	const source = node;
	const dependencies = pkgDepsOf(node);

	// Find common elements between outgoing and incoming
	const both = dependencies.outgoing.filter(item => dependencies.incoming.includes(item));

	// Remove common elements from outgoing and incoming arrays
	const outgoing = dependencies.outgoing.filter(item => !both.includes(item));
	const incoming = dependencies.incoming.filter(item => !both.includes(item));

	const g = svg.select("g");
	const source_id = source.hasLabel("Structure") ? source.property("package").id() : source.id();
	const thisG = g.select(`g[id='${source_id}']`);
	const thisCenter = getTransformedPosition(thisG);

	g.selectAll(".dep-line").remove();
	g.selectAll(".dep-arrow").remove();

	// Draw outgoing arrows
	outgoing.forEach(node => {
		const targetG = g.select(`g[id='${node.id()}']`);
		if (!targetG.empty() && targetG.node() !== thisG.node()) {
			const targetCenter = getTransformedPosition(targetG);

			const line = g.append('line')
				.attr("class", "dep-line")
				.attr('x1', thisCenter.cx)
				.attr('y1', thisCenter.cy)
				.attr('x2', targetCenter.cx)
				.attr('y2', targetCenter.cy)
				.attr('stroke-width', '3pt')
				.attr('stroke-opacity', 0.5)
				.attr('stroke', 'blue');
			// .attr("stroke-dasharray", "21, 7")
			// .attr("stroke-dashoffset", 0);

			placeLineBehindPackages(g, line);
		}
	});

	// Draw incoming arrows
	incoming.forEach(node => {
		const sourceG = g.select(`g[id='${node.id()}']`);
		if (!sourceG.empty() && sourceG.node() !== thisG.node()) {
			const sourceCenter = getTransformedPosition(sourceG);

			const line = g.append('line')
				.attr("class", "dep-line")
				.attr('x1', sourceCenter.cx)
				.attr('y1', sourceCenter.cy)
				.attr('x2', thisCenter.cx)
				.attr('y2', thisCenter.cy)
				.attr('stroke-width', '3pt')
				.attr('stroke-opacity', 0.5)
				.attr('stroke', 'green');
			// .attr("stroke-dasharray", "21, 7")
			// .attr("stroke-dashoffset", 0);

			placeLineBehindPackages(g, line);
		}
	});

	// Draw "both" arrows
	both.forEach(node => {
		const sourceG = g.select(`g[id='${node.id()}']`);
		if (!sourceG.empty() && sourceG.node() !== thisG.node()) {
			const sourceCenter = getTransformedPosition(sourceG);

			const line = g.append('line')
				.attr("class", "dep-line")
				.attr('x1', sourceCenter.cx)
				.attr('y1', sourceCenter.cy)
				.attr('x2', thisCenter.cx)
				.attr('y2', thisCenter.cy)
				.attr('stroke-width', '3pt')
				.attr('stroke-opacity', 0.6)
				.attr('stroke', 'goldenrod');

			placeLineBehindPackages(g, line);
		}
	});

	// d3.selectAll('line.dep-line').transition()
	// 	.duration(1000000)
	// 	.ease(d3.easeLinear)
	// 	.attr("stroke-dashoffset", -20000);

	bringToFront(thisG);
}
