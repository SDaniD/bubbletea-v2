import { classDepsOf, methodsOf, pkgDepsOf } from '../model/nodes.js';
import { stringToHue } from '../utils/utils.js';

const PROPERTY_LABELS = {
	explanation: "Architecture Explanation",
	architectureExplanation: "Architecture Explanation",
	classificationExplanation: "Architecture Explanation",
	classification_explanation: "Architecture Explanation",
	llm_explanation: "Architecture Explanation",
	llm_classification_summary: "Classification Summary",
	llm_detected_smells: "Detected Smells",
	llm_improvement_suggestion: "Improvement Suggestion",
	llm_confidence: "LLM Confidence",
	class_review_hint: "Class Review Hint",
	class_review_hint_evidence: "Class Review Evidence",
	class_review_hint_source: "Class Review Hint Source",
	architecture_review_priority_level: "Architecture Review Priority",
	architecture_review_priority_score: "Architecture Review Priority Score",
	architecture_review_priority_reason: "Architecture Review Priority Reason",
	architecture_risk_level: "Architecture Review Priority",
	architecture_risk_score: "Architecture Review Priority Score",
	architecture_risk_reason: "Architecture Review Priority Reason",
	maintainability_impact: "Maintainability Impact",
	evolution_concern: "Evolution Concern",
	recommended_review_action: "Recommended Review Action",
	class_dependency_examples: "Class Dependency Evidence",
	distinct_outgoing_package_count: "Distinct Outgoing Packages",
	distinct_incoming_package_count: "Distinct Incoming Packages",
	cross_layer_outgoing_dependency_ratio: "Cross-Layer Outgoing Ratio",
	cross_layer_incoming_dependency_ratio: "Cross-Layer Incoming Ratio",
	depends_on_distinct_layer_count: "Outgoing Dependency Layers",
	classification: "Classification",
	dominant_layer: "Dominant Layer",
	secondary_layer: "Secondary Layer",
	layer_type: "Layer Type",
	class_count: "Class Count",
	is_mixed: "Is Mixed",
	notes: "Notes",
	docComment: "Doc Comment",
	keywords: "Keywords",
	layer: "Layer",
	roleStereotype: "Role Stereotype",
	dependencyProfile: "Dependency Profile"
};

function firstAvailableProperty(nodeInfo, keys) {
	for (const key of keys) {
		if (nodeInfo.hasProperty(key)) {
			return { key, value: nodeInfo.property(key) };
		}
	}

	return null;
}

function pushProperty(renderData, nodeInfo, key, context, options = {}) {
	if (!nodeInfo.hasProperty(key)) {
		return;
	}

	const property = {
		rawKey: key,
		key: PROPERTY_LABELS[key] ?? key,
		value: nodeInfo.property(key)
	};

	const hueKey = key + "Hues";
	if ((hueKey) in context && nodeInfo.property(key) in context[hueKey]) {
		property.style = `color: hsl(${context[hueKey][nodeInfo.property(key)]}, 100%, 30%); font-weight: bold;`;
	}

	if (options.style) {
		property.style = options.style;
	}

	renderData.properties.push(property);
}

function riskStyle(riskLevel) {
	switch ((riskLevel ?? "").toLowerCase()) {
		case "high":
			return "background-color: hsl(0, 100%, 96%); border-left: 4px solid #dc2626; font-weight: bold;";
		case "medium":
			return "background-color: hsl(43, 100%, 95%); border-left: 4px solid #d97706; font-weight: bold;";
		case "low":
			return "background-color: hsl(120, 100%, 96%); border-left: 4px solid #16a34a;";
		default:
			return null;
	}
}

const prepareRenderData = (context) => (nodeInfo) => {
	const renderData = {
		title: `${nodeInfo.property("kind")}: ${nodeInfo.property("simpleName").replace(/([A-Z])/g, '\u200B$1')}`,
		properties: []
	};

	if (nodeInfo.hasProperty("qualifiedName")) {
		renderData.properties.push({
			rawKey: "qualifiedName",
			key: "qualifiedName",
			value: nodeInfo.property("qualifiedName")
				.replace(/\./g, '.\u200B')
				.replace(/([A-Z])/g, '\u200B$1')
		});
	}

	if (nodeInfo.hasProperty("description")) {
		const d = d3.create('div');
		if (nodeInfo.hasProperty("title")) {
			d.append('p').append('b').text(nodeInfo.property("title"));
		}
		d.append('p').text(nodeInfo.property("description"));
		renderData.properties.push({
			rawKey: "description",
			key: "description",
			value: d.node().innerHTML
				.replace(/\./g, '.\u200B')
				.replace(/([A-Z])/g, '\u200B$1')
		});
	}

	const explanationProperty = firstAvailableProperty(nodeInfo, [
		"llm_explanation",
		"explanation",
		"architectureExplanation",
		"classificationExplanation",
		"classification_explanation"
	]);
	if (explanationProperty) {
		renderData.properties.push({
			rawKey: explanationProperty.key,
			key: PROPERTY_LABELS[explanationProperty.key],
			value: explanationProperty.value,
			style: "background-color: hsl(40, 100%, 96%); border-left: 4px solid #d97706;"
		});
	}

	const priorityLevel = firstAvailableProperty(nodeInfo, [
		"architecture_review_priority_level",
		"architecture_risk_level"
	]);
	if (priorityLevel) {
		renderData.properties.push({
			rawKey: priorityLevel.key,
			key: PROPERTY_LABELS[priorityLevel.key],
			value: priorityLevel.value,
			style: riskStyle(priorityLevel.value)
		});
	}

	const priorityScore = firstAvailableProperty(nodeInfo, [
		"architecture_review_priority_score",
		"architecture_risk_score"
	]);
	if (priorityScore) {
		renderData.properties.push({
			rawKey: priorityScore.key,
			key: PROPERTY_LABELS[priorityScore.key],
			value: priorityScore.value
		});
	}

	pushProperty(renderData, nodeInfo, "architecture_review_priority_reason", context);
	if (!nodeInfo.hasProperty("architecture_review_priority_reason")) {
		pushProperty(renderData, nodeInfo, "architecture_risk_reason", context);
	}
	pushProperty(renderData, nodeInfo, "maintainability_impact", context, {
		style: "background-color: hsl(160, 70%, 96%); border-left: 4px solid #0f766e;"
	});
	pushProperty(renderData, nodeInfo, "evolution_concern", context, {
		style: "background-color: hsl(190, 80%, 96%); border-left: 4px solid #0284c7;"
	});
	pushProperty(renderData, nodeInfo, "recommended_review_action", context, {
		style: "background-color: hsl(210, 100%, 97%); border-left: 4px solid #2563eb;"
	});
	pushProperty(renderData, nodeInfo, "llm_improvement_suggestion", context, {
		style: "background-color: hsl(210, 100%, 97%); border-left: 4px solid #2563eb;"
	});
	pushProperty(renderData, nodeInfo, "class_dependency_examples", context, {
		style: "background-color: hsl(240, 100%, 97%);"
	});

	const keys = [
		"llm_classification_summary",
		"llm_detected_smells",
		"llm_confidence",
		"class_review_hint",
		"class_review_hint_evidence",
		"class_review_hint_source",
		"classification",
		"dominant_layer",
		"secondary_layer",
		"distinct_outgoing_package_count",
		"distinct_incoming_package_count",
		"cross_layer_outgoing_dependency_ratio",
		"cross_layer_incoming_dependency_ratio",
		"depends_on_distinct_layer_count",
		"layer_type",
		"class_count",
		"is_mixed",
		"notes",
		"docComment",
		"keywords",
		"layer",
		"roleStereotype",
		"dependencyProfile"
	];
	for (let key of keys) {
		pushProperty(renderData, nodeInfo, key, context);
	}

	if (nodeInfo.hasLabel("Structure")) {
		const methods = [...methodsOf(nodeInfo)];
		methods.sort((a, b) => a.property("simpleName").localeCompare(b.property("simpleName")));

			renderData.properties.push({
				rawKey: "methods",
				key: "methods",
				value: methods.map(m => {
				const d = d3.create('div');
				d.append('h3')
					.attr("class", "info")
					.text(m.property("simpleName"));

				d.append('div')
					.attr("class", "info")
					.attr("style", m.property("layer") ? `background-color: hsl(${stringToHue(m.property("layer"))}, 100%, 95%);` : null)
					.html(m.property("description"));


				return d.node().outerHTML;
			})
		});

		const deps = classDepsOf(nodeInfo);
		const both = deps.incoming.filter(item => deps.outgoing.includes(item));
		const outgoing = deps.outgoing.filter(item => !both.includes(item));
		const incoming = deps.incoming.filter(item => !both.includes(item));

		const makeDependencyItems = (nodes) => [...new Set(nodes)]
			.sort((a, b) => a.property("qualifiedName").localeCompare(b.property("qualifiedName")))
			.map(n => n.property("qualifiedName"));

		if (incoming.length > 0) {
			renderData.properties.push({
				rawKey: "incomingDependencies",
				key: "incomingDependencies",
				value: makeDependencyItems(incoming),
				style: "background-color: hsl(120, 100%, 95%);"
			});
		}
		if (both.length > 0) {
			renderData.properties.push({
				rawKey: "coDependencies",
				key: "coDependencies",
				value: makeDependencyItems(both),
				style: "background-color: hsl(43, 100%, 95%);"
			});
		}
		if (outgoing.length > 0) {
			renderData.properties.push({
				rawKey: "outgoingDependencies",
				key: "outgoingDependencies",
				value: makeDependencyItems(outgoing),
				style: "background-color: hsl(240, 100%, 95%);"
			});
		}
		if (incoming.length === 0 && both.length === 0 && outgoing.length === 0) {
			renderData.properties.push({
				rawKey: "dependencies",
				key: "dependencies",
				value: "No external incoming or outgoing dependencies found for this class in the current graph."
			});
		}
	} else if (nodeInfo.hasLabel("Container")) {

		const incoming_tmp = nodeInfo.sources("dependsOn");
		const outgoing_tmp = nodeInfo.targets("dependsOn");

		const both = incoming_tmp.filter(item => outgoing_tmp.includes(item));
		const outgoing = outgoing_tmp.filter(item => !both.includes(item));
		const incoming = incoming_tmp.filter(item => !both.includes(item));

		const both_edges = both.map((n) => [
			nodeInfo._meta._graph.edges("dependsOn").find((e) => e.source().id() === n.id() && e.target().id() === nodeInfo.id()),
			nodeInfo._meta._graph.edges("dependsOn").find((e) => e.target().id() === n.id() && e.source().id() === nodeInfo.id())
		]);
		const incoming_edges = nodeInfo._meta._graph.edges("dependsOn", (e) => e.target().id() === nodeInfo.id() && incoming.map(n => n.id()).includes(e.source().id()));
		const outgoing_edges = nodeInfo._meta._graph.edges("dependsOn", (e) => e.source().id() === nodeInfo.id() && outgoing.map(n => n.id()).includes(e.target().id()));

		if (incoming_edges.length > 0) {
			renderData.properties.push({
				rawKey: "incomingDependencies",
				key: "incomingDependencies",
				value: incoming_edges.map(e => {
					const d = d3.create('div');
					d.append('h3')
						.attr("class", "info")
						.text(e.source().property("qualifiedName"));

					d.append('div')
						.attr("class", "info")
						.html(e.property("description"));

					return d.node().outerHTML;
				}),
				style: "background-color: hsl(120, 100%, 95%);"
			});
		}
		if (both_edges.length > 0) {
			renderData.properties.push({
				rawKey: "coDependencies",
				key: "coDependencies",
				value: both_edges.map(([e1, e2]) => {
					const d = d3.create('div');
					d.append('h3')
						.attr("class", "info")
						.text(e1.source().property("qualifiedName"));

					const innerd = d.append('div')
						.attr("class", "info");

					innerd.append("p")
						.html(e1.property("description"));
					innerd.append("p")
						.html(e2.property("description"));

					return d.node().outerHTML;
				}),
				style: "background-color: hsl(43, 100%, 95%);"
			});
		}
		if (outgoing_edges.length > 0) {
			renderData.properties.push({
				rawKey: "outgoingDependencies",
				key: "outgoingDependencies",
				value: outgoing_edges.map(e => {
					const d = d3.create('div');
					d.append('h3')
						.attr("class", "info")
						.text(e.target().property("qualifiedName"));

					d.append('div')
						.attr("class", "info")
						.html(e.property("description"));


					return d.node().outerHTML;
				}),
				style: "background-color: hsl(240, 100%, 95%);"
			});
		}

		if (incoming_edges.length === 0 && both_edges.length === 0 && outgoing_edges.length === 0) {
			const deps = pkgDepsOf(nodeInfo);
			const bothFallback = deps.incoming.filter(item => deps.outgoing.includes(item));
			const outgoingFallback = deps.outgoing.filter(item => !bothFallback.includes(item));
			const incomingFallback = deps.incoming.filter(item => !bothFallback.includes(item));
			const toItems = (nodes) => [...new Set(nodes)]
				.sort((a, b) => a.property("qualifiedName").localeCompare(b.property("qualifiedName")))
				.map(n => n.property("qualifiedName"));

			if (incomingFallback.length > 0) {
				renderData.properties.push({
					rawKey: "incomingDependencies",
					key: "incomingDependencies",
					value: toItems(incomingFallback),
					style: "background-color: hsl(120, 100%, 95%);"
				});
			}
			if (bothFallback.length > 0) {
				renderData.properties.push({
					rawKey: "coDependencies",
					key: "coDependencies",
					value: toItems(bothFallback),
					style: "background-color: hsl(43, 100%, 95%);"
				});
			}
			if (outgoingFallback.length > 0) {
				renderData.properties.push({
					rawKey: "outgoingDependencies",
					key: "outgoingDependencies",
					value: toItems(outgoingFallback),
					style: "background-color: hsl(240, 100%, 95%);"
				});
			}
			if (incomingFallback.length === 0 && bothFallback.length === 0 && outgoingFallback.length === 0) {
				renderData.properties.push({
					rawKey: "dependencies",
					key: "dependencies",
					value: "No external incoming or outgoing package dependencies found for this folder in the current graph."
				});
			}
		}
	}

	return renderData;
}

export const clearInfo = (sel) => () => {
	const element = d3.select(sel);
	element.selectChildren().remove();
}

const PANEL_SECTIONS = [
	{
		title: "Package Overview",
		open: true,
		keys: new Set([
			"qualifiedName",
			"description",
			"classification",
			"dominant_layer",
			"secondary_layer",
			"class_count",
			"layer"
		])
	},
	{
		title: "Architecture Review Priority",
		open: true,
		keys: new Set([
			"architecture_review_priority_level",
			"architecture_review_priority_score",
			"architecture_review_priority_reason",
			"architecture_risk_level",
			"architecture_risk_score",
			"architecture_risk_reason",
			"maintainability_impact",
			"evolution_concern",
			"recommended_review_action"
		])
	},
	{
		title: "LLM Architecture Explanation",
		open: true,
		keys: new Set([
			"llm_explanation",
			"explanation",
			"architectureExplanation",
			"classificationExplanation",
			"classification_explanation",
			"llm_classification_summary",
			"llm_detected_smells",
			"llm_improvement_suggestion",
			"llm_confidence",
			"class_review_hint",
			"class_review_hint_evidence",
			"class_review_hint_source"
		])
	},
	{
		title: "Structural Evidence",
		open: false,
		keys: new Set([
			"class_dependency_examples",
			"distinct_outgoing_package_count",
			"distinct_incoming_package_count",
			"cross_layer_outgoing_dependency_ratio",
			"cross_layer_incoming_dependency_ratio",
			"depends_on_distinct_layer_count",
			"layer_type",
			"is_mixed",
			"notes",
			"docComment",
			"keywords",
			"roleStereotype",
			"dependencyProfile",
			"methods",
			"incomingDependencies",
			"coDependencies",
			"outgoingDependencies",
			"dependencies"
		])
	}
];

function sectionProperties(properties) {
	const remaining = [...properties];
	const sections = PANEL_SECTIONS
		.map(section => {
			const matched = [];
			for (let i = remaining.length - 1; i >= 0; i--) {
				if (section.keys.has(remaining[i].rawKey)) {
					matched.unshift(remaining[i]);
					remaining.splice(i, 1);
				}
			}
			return { ...section, properties: matched };
		})
		.filter(section => section.properties.length > 0);

	if (remaining.length > 0) {
		sections.push({
			title: "Other Properties",
			open: false,
			properties: remaining
		});
	}

	return sections;
}

function renderProperty(parent, prop) {
	const li = parent.append("li").attr("class", "info");

	li.append('h3')
		.attr("class", "info")
		.text(prop.key);

	const propContainer = li.append('div').attr("class", "info");

	if (prop.style) {
		propContainer.attr("style", prop.style);
	}

	if (Array.isArray(prop.value)) {
		const innerUl = propContainer.append("ul");
		prop.value.forEach(item => {
			const innerLi = innerUl.append("li").attr("class", "info");
			innerLi.html(item);
		});
	} else {
		propContainer.html(prop.value);
	}
}

export const displayInfo = (context) => (sel) => (node) => {

	const element = d3.select(sel);
	const renderData = prepareRenderData(context)(node);

	element.selectChildren().remove();
	element.append('h2').html(renderData.title);

	sectionProperties(renderData.properties).forEach(section => {
		const details = element.append("details")
			.attr("class", "info-section")
			.property("open", section.open);
		details.append("summary")
			.attr("class", "info-section-title")
			.text(section.title);
		const ul = details.append("ul");
		if (section.title === "Architecture Review Priority") {
			ul.append("li")
				.attr("class", "info-section-note")
				.text("ARPS levels: Low < 30, Medium 30-59, High >= 60.");
		} else if (section.title === "LLM Architecture Explanation") {
			ul.append("li")
				.attr("class", "info-section-note")
				.text("Generated from: classification, ARPS, package metrics, and dependency examples.");
		}
		section.properties.forEach(prop => renderProperty(ul, prop));
	});
}
