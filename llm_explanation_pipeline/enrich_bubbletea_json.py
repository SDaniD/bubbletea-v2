import argparse
import json
from pathlib import Path

import pandas as pd

from llm_explanation_generation import clean_text, generate_explanation

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Enrich a BubbleTea JSON file with package classification metadata and LLM explanations."
    )
    parser.add_argument("--json", required=True, help="Input BubbleTea JSON file.")
    parser.add_argument(
        "--csv",
        default=r"D:\TUe\BEP\data\csv\package_classification_main.csv",
        help="CSV containing package classification rows.",
    )
    parser.add_argument("--project", required=True, help="Project name used to filter the CSV rows.")
    parser.add_argument(
        "--output",
        help="Output JSON path. Defaults to '<input-name>-with-explanations.json' next to the input file.",
    )
    parser.add_argument("--model", default="gpt-4o-mini", help="OpenAI model used for explanation generation.")
    return parser.parse_args()

def normalize_package_name(value: str) -> str:
    return clean_text(value)

def load_package_rows(csv_path: Path, project: str) -> dict[str, dict]:
    df = pd.read_csv(csv_path)
    df["project"] = df["project"].map(clean_text)
    project_rows = df[df["project"].str.lower() == clean_text(project).lower()].copy()

    if project_rows.empty:
        raise ValueError(f"No rows found in {csv_path} for project '{project}'.")

    records = {}
    for row in project_rows.to_dict(orient="records"):
        normalized_package = normalize_package_name(row["package"])
        records[normalized_package] = {
            "project_name": clean_text(row["project"]),
            "package_name": normalized_package,
            "dominant_layer": clean_text(row["dominant_layer"]),
            "secondary_layer": clean_text(row["secondary_layer"]),
            "is_mixed": int(row["is_mixed"]),
            "layer_type": clean_text(row["layer_type"]),
            "classification": clean_text(row["classification"]),
            "class_count": int(row["class_count"]),
            "notes": clean_text(row["notes"]),
        }
    return records

def is_package_node(node: dict) -> bool:
    labels = node.get("data", {}).get("labels", [])
    return "Container" in labels or "Folder" in labels

def node_package_name(node: dict) -> str:
    properties = node.get("data", {}).get("properties", {})
    candidate = properties.get("qualifiedName") or node.get("data", {}).get("id") or ""
    return normalize_package_name(candidate)

def enrich_node(node: dict, package_row: dict, model: str) -> bool:
    properties = node.setdefault("data", {}).setdefault("properties", {})
    explanation = generate_explanation(model=model, **package_row)

    properties["classification"] = package_row["classification"]
    properties["dominant_layer"] = package_row["dominant_layer"]
    properties["secondary_layer"] = package_row["secondary_layer"]
    properties["is_mixed"] = package_row["is_mixed"]
    properties["layer_type"] = package_row["layer_type"]
    properties["class_count"] = package_row["class_count"]
    properties["notes"] = package_row["notes"]
    properties["explanation"] = explanation
    return True

def default_output_path(input_path: Path) -> Path:
    return input_path.with_name(f"{input_path.stem}-with-explanations{input_path.suffix}")

def main() -> None:
    args = parse_args()
    input_path = Path(args.json)
    csv_path = Path(args.csv)
    output_path = Path(args.output) if args.output else default_output_path(input_path)

    with input_path.open("r", encoding="utf-8") as f:
        bubbletea_data = json.load(f)

    package_rows = load_package_rows(csv_path, args.project)

    nodes = bubbletea_data.get("elements", {}).get("nodes", [])
    matched_count = 0
    unmatched_packages = []

    for node in nodes:
        if not is_package_node(node):
            continue

        package_name = node_package_name(node)
        package_row = package_rows.get(package_name)
        if not package_row:
            unmatched_packages.append(package_name)
            continue

        enrich_node(node, package_row, args.model)
        matched_count += 1

    with output_path.open("w", encoding="utf-8") as f:
        json.dump(bubbletea_data, f, indent=2, ensure_ascii=False)

    print(f"Saved enriched JSON to: {output_path}")
    print(f"Matched package nodes: {matched_count}")
    print(f"Unmatched package nodes: {len(unmatched_packages)}")
    if unmatched_packages:
        print("First unmatched package nodes:")
        for package_name in unmatched_packages[:10]:
            print(f"- {package_name}")

if __name__ == "__main__":
    main()