import argparse
import json
import sys
from pathlib import Path
from typing import Any

import pandas as pd

if __package__ is None or __package__ == "":
    sys.path.append(str(Path(__file__).resolve().parents[1]))
    from llm_explanation_pipeline.architecture_review_priority import architecture_review_priority
    from llm_explanation_pipeline.json_extractor import enrich_evidence_from_json
    from llm_explanation_pipeline.json_writer import (
        attach_explanation_to_package_node,
        load_graph,
        save_graph,
    )
    from llm_explanation_pipeline.llm_client import DEFAULT_LLM_MODEL, DEFAULT_LLM_PROVIDER, LLMExplainer
    from llm_explanation_pipeline.models import ExplanationResult, PackageEvidence
    from llm_explanation_pipeline.prompt_builder import SYSTEM_PROMPT, build_user_prompt, clean_text
else:
    from .architecture_review_priority import architecture_review_priority
    from .json_extractor import enrich_evidence_from_json
    from .json_writer import attach_explanation_to_package_node, load_graph, save_graph
    from .llm_client import DEFAULT_LLM_MODEL, DEFAULT_LLM_PROVIDER, LLMExplainer
    from .models import ExplanationResult, PackageEvidence
    from .prompt_builder import SYSTEM_PROMPT, build_user_prompt, clean_text

REQUIRED_COLUMNS = [
    "project",
    "package",
    "dominant_layer",
    "secondary_layer",
    "is_mixed",
    "layer_type",
    "distinct_layer_count",
    "class_count",
    "notes",
]

def find_repo_root(start: Path) -> Path:
    for path in [start, *start.parents]:
        if (path / "data" / "csv").exists() and (path / "outputs").exists():
            return path
    return start.parents[3]

REPO_ROOT = find_repo_root(Path(__file__).resolve())
DEFAULT_CLASSIFICATION_CSV = (
    REPO_ROOT / "data" / "csv" / "package_classification_all_compact_dependencies.csv"
)
if not DEFAULT_CLASSIFICATION_CSV.exists():
    DEFAULT_CLASSIFICATION_CSV = (
        REPO_ROOT / "data" / "csv" / "package_classification_all.csv"
    )

PROJECT_PRESETS = {
    "k9": {
        "json": REPO_ROOT / "outputs" / "k-9-5.304-output.json",
        "csv": DEFAULT_CLASSIFICATION_CSV,
    },
    "jpacman": {
        "json": REPO_ROOT / "outputs" / "jpacman-output.json",
        "csv": DEFAULT_CLASSIFICATION_CSV,
    },
    "monolith": {
        "json": REPO_ROOT / "outputs" / "monolith-output.json",
        "csv": DEFAULT_CLASSIFICATION_CSV,
    },
    "petclinic": {
        "json": REPO_ROOT / "outputs" / "spring-petclinic-output.json",
        "csv": DEFAULT_CLASSIFICATION_CSV,
    },
    "demoapp": {
        "json": REPO_ROOT / "outputs" / "demoapp-output.json",
        "csv": DEFAULT_CLASSIFICATION_CSV,
    },
    "simpleapp": {
        "json": REPO_ROOT / "outputs" / "simpleapp-output.json",
        "csv": DEFAULT_CLASSIFICATION_CSV,
    },
}

DEPENDENCY_FEATURE_COLUMNS = [
    "distinct_outgoing_package_count",
    "distinct_incoming_package_count",
    "cross_layer_outgoing_dependency_ratio",
    "cross_layer_incoming_dependency_ratio",
    "depends_on_distinct_layer_count",
]

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate LLM explanations for every classified package in one BubbleTea JSON."
    )
    parser.add_argument(
        "--project",
        default="k9",
        choices=sorted(PROJECT_PRESETS),
        help="Project preset to run. Defaults to k9.",
    )
    parser.add_argument("--json", type=Path, help="Input BubbleTea JSON.")
    parser.add_argument(
        "--csv",
        type=Path,
        help="CSV containing package classifications.",
    )
    parser.add_argument(
        "--output-json",
        type=Path,
        help="Enriched JSON path. Defaults to '<input>-classified-explained.json'.",
    )
    parser.add_argument(
        "--output-csv",
        type=Path,
        help="Optional CSV audit table with generated explanations.",
    )
    parser.add_argument(
        "--provider",
        default=DEFAULT_LLM_PROVIDER,
        choices=["openai", "google"],
        help="LLM provider to use. Defaults to the marked LLM model section in llm_client.py.",
    )
    parser.add_argument(
        "--model",
        default=DEFAULT_LLM_MODEL,
        help="LLM model to use. Defaults to the marked LLM model section in llm_client.py.",
    )
    parser.add_argument(
        "--classification-column",
        default="classification",
        help="Column containing the classification to explain. Use predicted_classification for ML output CSVs.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        help="Optional limit for smoke tests or small evaluation batches.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=True,
        help="Validate row and JSON package matching without calling the LLM or writing output. This is the default.",
    )
    parser.add_argument(
        "--run",
        action="store_false",
        dest="dry_run",
        help="Actually call the LLM and write the enriched output files.",
    )
    args = parser.parse_args()

    preset = PROJECT_PRESETS[args.project]
    if args.json is None:
        args.json = preset["json"]
    if args.csv is None:
        args.csv = preset["csv"]
    if args.output_csv is None and not args.dry_run:
        args.output_csv = (
            REPO_ROOT / "data" / "csv" / f"{args.project}_llm_explanations.csv"
        )
    return args

def default_output_json(json_path: Path) -> Path:
    return json_path.with_name(f"{json_path.stem}-classified-explained{json_path.suffix}")

def load_project_rows(
    csv_path: Path,
    project: str,
    limit: int | None,
    classification_column: str,
) -> list[dict[str, Any]]:
    df = pd.read_csv(csv_path)
    missing_columns = [column for column in REQUIRED_COLUMNS if column not in df.columns]
    if classification_column not in df.columns:
        missing_columns.append(classification_column)
    if missing_columns:
        raise ValueError(f"CSV is missing required columns: {', '.join(missing_columns)}")

    for column in df.select_dtypes(include="object").columns:
        df[column] = df[column].map(clean_text)

    project_name = clean_text(project).lower()
    project_df = df[df["project"].str.lower() == project_name].copy()
    if project_df.empty:
        raise ValueError(f"No rows found in {csv_path} for project '{project}'.")

    project_df["classification"] = project_df[classification_column].map(clean_text)
    if limit is not None:
        project_df = project_df.head(limit)

    return project_df.to_dict(orient="records")

def evidence_from_row(row: dict[str, Any]) -> PackageEvidence:
    def optional_int(column: str) -> int | None:
        value = row.get(column)
        if pd.isna(value):
            return None
        return int(value)

    def optional_float(column: str) -> float | None:
        value = row.get(column)
        if pd.isna(value):
            return None
        return float(value)

    return PackageEvidence(
        project=clean_text(row["project"]),
        package=clean_text(row["package"]),
        dominant_layer=clean_text(row["dominant_layer"]),
        secondary_layer=clean_text(row["secondary_layer"]),
        is_mixed=int(row["is_mixed"]),
        layer_type=clean_text(row["layer_type"]),
        classification=clean_text(row["classification"]),
        distinct_layer_count=int(row["distinct_layer_count"]),
        class_count=int(row["class_count"]),
        notes=clean_text(row.get("notes", "-")),
        distinct_outgoing_package_count=optional_int("distinct_outgoing_package_count"),
        distinct_incoming_package_count=optional_int("distinct_incoming_package_count"),
        cross_layer_outgoing_dependency_ratio=optional_float("cross_layer_outgoing_dependency_ratio"),
        cross_layer_incoming_dependency_ratio=optional_float("cross_layer_incoming_dependency_ratio"),
        depends_on_distinct_layer_count=optional_int("depends_on_distinct_layer_count"),
    )

def metadata_from_evidence(
    evidence: PackageEvidence,
    result: ExplanationResult | None = None,
) -> dict[str, Any]:
    detected_smells = result.detected_smells if result is not None else None
    priority = architecture_review_priority(evidence, detected_smells)
    if result is not None:
        if result.maintainability_impact:
            priority["maintainability_impact"] = result.maintainability_impact
        if result.evolution_concern:
            priority["evolution_concern"] = result.evolution_concern
        if result.recommended_review_action:
            priority["recommended_review_action"] = result.recommended_review_action
    return {
        "classification": evidence.classification,
        "dominant_layer": evidence.dominant_layer,
        "secondary_layer": evidence.secondary_layer,
        "is_mixed": evidence.is_mixed,
        "layer_type": evidence.layer_type,
        "distinct_layer_count": evidence.distinct_layer_count,
        "class_count": evidence.class_count,
        "notes": evidence.notes,
        "class_dependency_examples": evidence.class_dependency_examples,
        "distinct_outgoing_package_count": evidence.distinct_outgoing_package_count,
        "distinct_incoming_package_count": evidence.distinct_incoming_package_count,
        "cross_layer_outgoing_dependency_ratio": evidence.cross_layer_outgoing_dependency_ratio,
        "cross_layer_incoming_dependency_ratio": evidence.cross_layer_incoming_dependency_ratio,
        "depends_on_distinct_layer_count": evidence.depends_on_distinct_layer_count,
        **priority,
    }

def _simple_class_name(name: str) -> str:
    return clean_text(name).split(".")[-1].split("$")[-1]

def _class_name_matches(candidate: str, known_class: str) -> bool:
    candidate = clean_text(candidate)
    known_class = clean_text(known_class)
    return candidate in {
        known_class,
        known_class.split(".")[-1],
        known_class.split(".")[-1].split("$")[-1],
    }

def filter_class_review_hints(
    evidence: PackageEvidence,
    result: ExplanationResult,
) -> ExplanationResult:
    known_classes = evidence.contained_classes or evidence.representative_classes
    filtered = []
    seen = set()

    for hint in result.class_review_hints:
        match = next(
            (
                known_class
                for known_class in known_classes
                if _class_name_matches(hint.class_name, known_class)
            ),
            None,
        )
        if not match:
            continue

        simple_name = _simple_class_name(match)
        if simple_name in seen:
            continue
        seen.add(simple_name)
        hint.class_name = simple_name
        filtered.append(hint)

    result.class_review_hints = filtered
    return result

def architecture_risk_from_evidence(evidence: PackageEvidence) -> dict[str, Any]:
    return architecture_review_priority(evidence)

def audit_row(evidence: PackageEvidence, result: ExplanationResult) -> dict[str, Any]:
    priority = architecture_review_priority(evidence, result.detected_smells)
    if result.maintainability_impact:
        priority["maintainability_impact"] = result.maintainability_impact
    if result.evolution_concern:
        priority["evolution_concern"] = result.evolution_concern
    if result.recommended_review_action:
        priority["recommended_review_action"] = result.recommended_review_action
    return {
        "project": evidence.project,
        "package": evidence.package,
        "classification": evidence.classification,
        "dominant_layer": evidence.dominant_layer,
        "secondary_layer": evidence.secondary_layer,
        "layer_type": evidence.layer_type,
        "class_count": evidence.class_count,
        "classification_summary": result.classification_summary,
        "detected_smells": "; ".join(result.detected_smells),
        "explanation": result.explanation,
        "improvement_suggestion": result.improvement_suggestion,
        "class_review_hints": "; ".join(
            f"{hint.class_name}: {hint.hint}" for hint in result.class_review_hints
        ),
        "llm_confidence": result.confidence,
        **priority,
        "representative_classes": "; ".join(evidence.representative_classes),
        "representative_methods": "; ".join(evidence.representative_methods),
        "class_dependency_examples": "; ".join(evidence.class_dependency_examples),
        "outgoing_dependencies": "; ".join(evidence.outgoing_dependencies),
        "incoming_dependencies": "; ".join(evidence.incoming_dependencies),
        "distinct_outgoing_package_count": evidence.distinct_outgoing_package_count,
        "distinct_incoming_package_count": evidence.distinct_incoming_package_count,
        "cross_layer_outgoing_dependency_ratio": evidence.cross_layer_outgoing_dependency_ratio,
        "cross_layer_incoming_dependency_ratio": evidence.cross_layer_incoming_dependency_ratio,
        "depends_on_distinct_layer_count": evidence.depends_on_distinct_layer_count,
    }

def main() -> None:
    args = parse_args()
    rows = load_project_rows(
        args.csv, args.project, args.limit, args.classification_column
    )
    graph = load_graph(str(args.json))

    print(f"Loaded {len(rows)} classified package rows for project '{args.project}'.")
    available_dependency_columns = [
        column for column in DEPENDENCY_FEATURE_COLUMNS if column in rows[0]
    ]
    if available_dependency_columns:
        print(
            "Dependency feature columns available: "
            + ", ".join(available_dependency_columns)
        )
    else:
        print("Dependency feature columns unavailable; prompt will use JSON evidence only.")
    if args.dry_run:
        matched = 0
        unmatched = []
        for row in rows:
            evidence = evidence_from_row(row)
            try:
                enrich_evidence_from_json(str(args.json), evidence)
                matched += 1
            except ValueError:
                unmatched.append(evidence.package)
        print(f"Matched packages in JSON: {matched}")
        print(f"Unmatched packages in JSON: {len(unmatched)}")
        for package in unmatched[:20]:
            print(f"- {package}")
        return

    explainer = LLMExplainer(model=args.model, provider=args.provider)
    audit_rows = []
    unmatched = []

    for index, row in enumerate(rows, start=1):
        evidence = evidence_from_row(row)
        print(f"[{index}/{len(rows)}] {evidence.package}")
        try:
            evidence = enrich_evidence_from_json(str(args.json), evidence)
        except ValueError:
            unmatched.append(evidence.package)
            print("  skipped: package not found in JSON")
            continue

        result = explainer.generate(SYSTEM_PROMPT, build_user_prompt(evidence))
        result = filter_class_review_hints(evidence, result)
        graph = attach_explanation_to_package_node(
            graph,
            evidence.package,
            result,
            package_metadata=metadata_from_evidence(evidence, result),
        )
        audit_rows.append(audit_row(evidence, result))

    output_json = args.output_json or default_output_json(args.json)
    save_graph(graph, str(output_json))
    print(f"Saved enriched JSON to: {output_json}")
    print(f"Generated explanations: {len(audit_rows)}")
    print(f"Unmatched packages: {len(unmatched)}")

    if args.output_csv:
        args.output_csv.parent.mkdir(parents=True, exist_ok=True)
        pd.DataFrame(audit_rows).to_csv(args.output_csv, index=False)
        print(f"Saved explanation audit CSV to: {args.output_csv}")

if __name__ == "__main__":
    main()