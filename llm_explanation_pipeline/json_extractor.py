import json
from collections import Counter, defaultdict
from typing import Any, Dict, List, Optional, Tuple

from .models import PackageEvidence

def load_graph(json_path: str) -> Dict[str, Any]:
    with open(json_path, "r", encoding="utf-8") as f:
        return json.load(f)

def get_nodes_edges(graph: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    elements = graph.get("elements", {})
    return elements.get("nodes", []), elements.get("edges", [])

def node_labels(node: Dict[str, Any]) -> List[str]:
    return node.get("data", {}).get("labels", [])

def node_props(node: Dict[str, Any]) -> Dict[str, Any]:
    return node.get("data", {}).get("properties", {})

def edge_label(edge: Dict[str, Any]) -> Optional[str]:
    return edge.get("data", {}).get("label")

def build_node_index(nodes: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    return {
        node.get("data", {}).get("id"): node
        for node in nodes
        if node.get("data", {}).get("id")
    }

def build_edge_indexes(
    edges: List[Dict[str, Any]]
) -> Tuple[Dict[str, List[Dict[str, Any]]], Dict[str, List[Dict[str, Any]]]]:
    outgoing = defaultdict(list)
    incoming = defaultdict(list)

    for edge in edges:
        data = edge.get("data", {})
        src = data.get("source")
        tgt = data.get("target")
        if src:
            outgoing[src].append(edge)
        if tgt:
            incoming[tgt].append(edge)

    return outgoing, incoming

def find_package_node(
    node_index: Dict[str, Dict[str, Any]], package_name: str
) -> Optional[Dict[str, Any]]:
    for node in node_index.values():
        props = node_props(node)
        if (
            props.get("qualifiedName") == package_name
            and props.get("kind") in {"package", "folder"}
        ):
            return node
    return None

def is_class_node(node: Dict[str, Any]) -> bool:
    labels = node_labels(node)
    props = node_props(node)
    return (
        ("Structure" in labels or "Type" in labels)
        and props.get("kind") != "package"
    ) or ("File" in labels and props.get("kind") == "file")

def is_method_node(node: Dict[str, Any]) -> bool:
    return "Operation" in node_labels(node)

def package_names_by_id(node_index: Dict[str, Dict[str, Any]]) -> Dict[str, str]:
    result = {}
    for node_id, node in node_index.items():
        props = node_props(node)
        if props.get("kind") == "package":
            qn = props.get("qualifiedName")
            if qn:
                result[node_id] = qn
    return result

def package_layers_by_name(node_index: Dict[str, Dict[str, Any]]) -> Dict[str, str]:
    result = {}
    for node in node_index.values():
        props = node_props(node)
        if props.get("kind") == "package":
            qn = props.get("qualifiedName")
            if qn:
                result[qn] = props.get("layer") or "unknown layer"
    return result

def find_containing_package(qualified_name: str, package_names: List[str]) -> Optional[str]:
    for package_name in package_names:
        if qualified_name == package_name or qualified_name.startswith(f"{package_name}."):
            return package_name
    return None

def shorten_qualified_name(name: str) -> str:
    if not name:
        return "-"
    if "#" in name:
        return name.split("#")[-1]
    return name.split(".")[-1]

def extract_package_contents(
    package_node: Dict[str, Any],
    node_index: Dict[str, Dict[str, Any]],
    outgoing_edges: Dict[str, List[Dict[str, Any]]],
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    package_id = package_node["data"]["id"]
    classes: List[Dict[str, Any]] = []
    methods: List[Dict[str, Any]] = []

    for edge in outgoing_edges.get(package_id, []):
        if edge_label(edge) in {"contains", "encloses"}:
            tgt_id = edge["data"].get("target")
            tgt_node = node_index.get(tgt_id)
            if tgt_node and is_class_node(tgt_node):
                classes.append(tgt_node)

    for cls in classes:
        cls_id = cls["data"]["id"]
        for edge in outgoing_edges.get(cls_id, []):
            if edge_label(edge) in {"hasScript", "encapsulates"}:
                tgt_id = edge["data"].get("target")
                tgt_node = node_index.get(tgt_id)
                if tgt_node and is_method_node(tgt_node):
                    methods.append(tgt_node)

    return classes, methods

def extract_representative_classes(classes: List[Dict[str, Any]], limit: int = 8) -> List[str]:
    result = []
    for cls in classes[:limit]:
        props = node_props(cls)
        qn = props.get("qualifiedName") or props.get("simpleName") or cls["data"]["id"]
        result.append(qn)
    return result

def extract_representative_methods(methods: List[Dict[str, Any]], limit: int = 10) -> List[str]:
    result = []
    for method in methods[:limit]:
        props = node_props(method)
        simple_name = props.get("simpleName")
        qualified_name = props.get("qualifiedName") or method["data"]["id"]
        if simple_name:
            result.append(simple_name)
        else:
            result.append(shorten_qualified_name(qualified_name))
    return result

def extract_class_dependency_examples(
    package_name: str,
    classes: List[Dict[str, Any]],
    methods: List[Dict[str, Any]],
    node_index: Dict[str, Dict[str, Any]],
    outgoing_edges: Dict[str, List[Dict[str, Any]]],
    incoming_edges: Dict[str, List[Dict[str, Any]]],
    limit: int = 12,
) -> List[str]:
    dependency_labels = {
        "dependsOn",
        "invokes",
        "uses",
        "type",
        "returnType",
        "parameterizes",
        "specializes",
        "instantiates",
        "requires",
        "returns",
        "typed",
        "composes",
    }
    package_layers = package_layers_by_name(node_index)
    package_names = sorted(package_layers, key=len, reverse=True)
    package_node_names = package_names_by_id(node_index)
    class_ids = {cls["data"]["id"] for cls in classes}
    class_by_member_id = {}

    for cls in classes:
        cls_id = cls["data"]["id"]
        cls_name = node_props(cls).get("simpleName") or shorten_qualified_name(
            node_props(cls).get("qualifiedName") or cls_id
        )
        class_by_member_id[cls_id] = cls_name

    for method in methods:
        method_id = method["data"]["id"]
        method_qn = node_props(method).get("qualifiedName") or method_id
        owner = next(
            (
                cls
                for cls in classes
                if method_qn.startswith(
                    f"{node_props(cls).get('qualifiedName') or cls['data']['id']}."
                )
                or method_qn.startswith(
                    f"{node_props(cls).get('qualifiedName') or cls['data']['id']}#"
                )
            ),
            None,
        )
        if owner:
            owner_id = owner["data"]["id"]
            class_by_member_id[method_id] = class_by_member_id[owner_id]

    examples: Counter[tuple[str, str, str, str]] = Counter()

    def target_package_for_node(node_id: str) -> Optional[str]:
        if node_id in package_node_names:
            return package_node_names[node_id]
        node = node_index.get(node_id)
        if not node:
            return None
        qn = node_props(node).get("qualifiedName") or node_id
        return find_containing_package(qn, package_names)

    def add_example(
        source_class: str,
        target_package: str,
        direction: str,
        label: str,
    ) -> None:
        if target_package == package_name:
            return
        target_layer = package_layers.get(target_package, "unknown layer")
        examples[(source_class, direction, target_package, target_layer)] += 1

    member_ids = set(class_by_member_id)
    for member_id in member_ids:
        source_class = class_by_member_id[member_id]
        for edge in outgoing_edges.get(member_id, []):
            label = edge_label(edge)
            if label not in dependency_labels:
                continue
            target_package = target_package_for_node(edge["data"].get("target"))
            if target_package:
                add_example(source_class, target_package, "depends on", label)

        for edge in incoming_edges.get(member_id, []):
            label = edge_label(edge)
            if label not in dependency_labels:
                continue
            source_package = target_package_for_node(edge["data"].get("source"))
            if source_package and source_package != package_name:
                source_layer = package_layers.get(source_package, "unknown layer")
                examples[(source_class, "is used by", source_package, source_layer)] += 1

    result = []
    for (source_class, direction, target_package, target_layer), count in examples.most_common(limit):
        result.append(
            f"{source_class} {direction} {target_package} ({target_layer}); {count} dependency edge(s)"
        )
    return result

def extract_package_dependencies(
    package_node: Dict[str, Any],
    node_index: Dict[str, Dict[str, Any]],
    outgoing_edges: Dict[str, List[Dict[str, Any]]],
    incoming_edges: Dict[str, List[Dict[str, Any]]],
) -> Tuple[List[str], List[str]]:
    package_id = package_node["data"]["id"]

    outgoing_packages = set()
    incoming_packages = set()

    for edge in outgoing_edges.get(package_id, []):
        tgt_id = edge["data"].get("target")
        tgt_node = node_index.get(tgt_id)
        if tgt_node and "Scope" in node_labels(tgt_node):
            qn = node_props(tgt_node).get("qualifiedName")
            if qn:
                outgoing_packages.add(qn)

    for edge in incoming_edges.get(package_id, []):
        src_id = edge["data"].get("source")
        src_node = node_index.get(src_id)
        if src_node and "Scope" in node_labels(src_node):
            qn = node_props(src_node).get("qualifiedName")
            if qn:
                incoming_packages.add(qn)
    return sorted(outgoing_packages), sorted(incoming_packages)

def enrich_evidence_from_json(json_path: str, evidence: PackageEvidence) -> PackageEvidence:
    graph = load_graph(json_path)
    nodes, edges = get_nodes_edges(graph)

    node_index = build_node_index(nodes)
    outgoing_edges, incoming_edges = build_edge_indexes(edges)

    package_node = find_package_node(node_index, evidence.package)
    if not package_node:
        raise ValueError(f"Package not found in JSON: {evidence.package}")

    classes, methods = extract_package_contents(package_node, node_index, outgoing_edges)
    outgoing_deps, incoming_deps = extract_package_dependencies(
        package_node, node_index, outgoing_edges, incoming_edges
    )

    evidence.representative_classes = extract_representative_classes(classes)
    evidence.contained_classes = extract_representative_classes(classes, limit=1000)
    evidence.representative_methods = extract_representative_methods(methods)
    evidence.outgoing_dependencies = outgoing_deps
    evidence.incoming_dependencies = incoming_deps
    evidence.class_dependency_examples = extract_class_dependency_examples(
        evidence.package,
        classes,
        methods,
        node_index,
        outgoing_edges,
        incoming_edges,
    )

    if not evidence.class_count or evidence.class_count <= 0:
        evidence.class_count = len(classes)

    return evidence