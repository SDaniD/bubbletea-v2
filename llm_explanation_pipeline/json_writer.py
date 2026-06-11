import json
from typing import Any, Dict, Optional

from .models import ClassReviewHint, ExplanationResult

def load_graph(json_path: str) -> Dict[str, Any]:
    with open(json_path, "r", encoding="utf-8") as f:
        return json.load(f)

def save_graph(graph: Dict[str, Any], output_path: str) -> None:
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(graph, f, indent=2, ensure_ascii=False)

def find_package_node(graph: Dict[str, Any], package_name: str) -> Optional[Dict[str, Any]]:
    nodes = graph.get("elements", {}).get("nodes", [])
    for node in nodes:
        data = node.get("data", {})
        labels = data.get("labels", [])
        props = data.get("properties", {})
        if (
            props.get("qualifiedName") == package_name
            and props.get("kind") in {"package", "folder"}
        ):
            return node
    return None

def node_props(node: Dict[str, Any]) -> Dict[str, Any]:
    return node.get("data", {}).get("properties", {})

def node_labels(node: Dict[str, Any]) -> list[str]:
    return node.get("data", {}).get("labels", [])

def is_class_node(node: Dict[str, Any]) -> bool:
    labels = node_labels(node)
    props = node_props(node)
    return (
        ("Structure" in labels or "Type" in labels)
        and props.get("kind") != "package"
    ) or ("File" in labels and props.get("kind") == "file")

def class_hint_matches(hint: ClassReviewHint, node: Dict[str, Any]) -> bool:
    props = node_props(node)
    qualified_name = props.get("qualifiedName") or node.get("data", {}).get("id", "")
    simple_name = props.get("simpleName") or qualified_name.split(".")[-1]
    leaf_name = qualified_name.split(".")[-1].split("$")[-1]
    hint_name = hint.class_name.strip()
    return hint_name in {qualified_name, simple_name, leaf_name}

def class_review_hint_strings(result: ExplanationResult) -> list[str]:
    values = []
    for hint in result.class_review_hints:
        if hint.evidence:
            values.append(f"{hint.class_name}: {hint.hint} Evidence: {hint.evidence}")
        else:
            values.append(f"{hint.class_name}: {hint.hint}")
    return values

def package_class_nodes(graph: Dict[str, Any], package_name: str) -> list[Dict[str, Any]]:
    package_node = find_package_node(graph, package_name)
    if package_node is None:
        return []

    package_id = package_node.get("data", {}).get("id")
    nodes = graph.get("elements", {}).get("nodes", [])
    node_by_id = {
        node.get("data", {}).get("id"): node
        for node in nodes
        if node.get("data", {}).get("id")
    }
    edges = graph.get("elements", {}).get("edges", [])

    class_nodes = []
    for edge in edges:
        data = edge.get("data", {})
        if data.get("source") != package_id or data.get("label") not in {"contains", "encloses"}:
            continue
        node = node_by_id.get(data.get("target"))
        if node and is_class_node(node):
            class_nodes.append(node)
    return class_nodes

def attach_class_review_hints(
    graph: Dict[str, Any],
    package_name: str,
    result: ExplanationResult,
) -> None:
    if not result.class_review_hints:
        return

    for node in package_class_nodes(graph, package_name):
        for hint in result.class_review_hints:
            if class_hint_matches(hint, node):
                props = node.setdefault("data", {}).setdefault("properties", {})
                props["class_review_hint"] = hint.hint
                props["class_review_hint_evidence"] = hint.evidence
                props["class_review_hint_source"] = "LLM-generated review hint"

def attach_explanation_to_package_node(
    graph: Dict[str, Any],
    package_name: str,
    result: ExplanationResult,
    package_metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    node = find_package_node(graph, package_name)
    if node is None:
        raise ValueError(f"Package not found in graph: {package_name}")

    props = node.setdefault("data", {}).setdefault("properties", {})
    props["llm_classification_summary"] = result.classification_summary
    props["llm_detected_smells"] = result.detected_smells
    props["llm_explanation"] = result.explanation
    props["llm_confidence"] = result.confidence
    props["llm_improvement_suggestion"] = result.improvement_suggestion
    props["llm_class_review_hints"] = class_review_hint_strings(result)
    if result.maintainability_impact:
        props["maintainability_impact"] = result.maintainability_impact
    if result.evolution_concern:
        props["evolution_concern"] = result.evolution_concern
    if result.recommended_review_action:
        props["recommended_review_action"] = result.recommended_review_action
    if package_metadata:
        props.update(package_metadata)
    attach_class_review_hints(graph, package_name, result)

    return graph

def write_explanation_to_json(
    input_json_path: str,
    output_json_path: str,
    package_name: str,
    result: ExplanationResult,
    package_metadata: Optional[Dict[str, Any]] = None,
) -> None:
    graph = load_graph(input_json_path)
    graph = attach_explanation_to_package_node(
        graph, package_name, result, package_metadata
    )
    save_graph(graph, output_json_path)