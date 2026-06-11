import argparse
import json

from .json_extractor import enrich_evidence_from_json
from .json_writer import write_explanation_to_json
from .llm_client import DEFAULT_LLM_MODEL, DEFAULT_LLM_PROVIDER, LLMExplainer
from .models import PackageEvidence
from .prompt_builder import SYSTEM_PROMPT, build_user_prompt

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate a BubbleTea package explanation.")
    parser.add_argument("--project", required=True)
    parser.add_argument("--package", required=True)

    parser.add_argument("--dominant-layer", required=True)
    parser.add_argument("--secondary-layer", required=True)
    parser.add_argument("--is-mixed", type=int, required=True)
    parser.add_argument("--layer-type", required=True)
    parser.add_argument("--classification", required=True)
    parser.add_argument("--distinct-layer-count", type=int, required=True)
    parser.add_argument("--class-count", type=int, required=True)
    parser.add_argument("--notes", default="-")
    parser.add_argument("--distinct-outgoing-package-count", type=int, default=None)
    parser.add_argument("--distinct-incoming-package-count", type=int, default=None)
    parser.add_argument("--cross-layer-outgoing-dependency-ratio", type=float, default=None)
    parser.add_argument("--cross-layer-incoming-dependency-ratio", type=float, default=None)
    parser.add_argument("--depends-on-distinct-layer-count", type=int, default=None)

    parser.add_argument("--json-path", default=None)
    parser.add_argument("--write-json-output", default=None)

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

    return parser.parse_args()

def build_base_evidence(args: argparse.Namespace) -> PackageEvidence:
    return PackageEvidence(
        project=args.project,
        package=args.package,
        dominant_layer=args.dominant_layer,
        secondary_layer=args.secondary_layer,
        is_mixed=args.is_mixed,
        layer_type=args.layer_type,
        classification=args.classification,
        distinct_layer_count=args.distinct_layer_count,
        class_count=args.class_count,
        notes=args.notes,
        distinct_outgoing_package_count=args.distinct_outgoing_package_count,
        distinct_incoming_package_count=args.distinct_incoming_package_count,
        cross_layer_outgoing_dependency_ratio=args.cross_layer_outgoing_dependency_ratio,
        cross_layer_incoming_dependency_ratio=args.cross_layer_incoming_dependency_ratio,
        depends_on_distinct_layer_count=args.depends_on_distinct_layer_count,
    )

def main() -> None:
    args = parse_args()
    evidence = build_base_evidence(args)

    if args.json_path:
        evidence = enrich_evidence_from_json(args.json_path, evidence)

    user_prompt = build_user_prompt(evidence)
    explainer = LLMExplainer(model=args.model, provider=args.provider)
    result = explainer.generate(SYSTEM_PROMPT, user_prompt)

    output = {
        "classification_summary": result.classification_summary,
        "detected_smells": result.detected_smells,
        "explanation": result.explanation,
        "improvement_suggestion": result.improvement_suggestion,
        "maintainability_impact": result.maintainability_impact,
        "evolution_concern": result.evolution_concern,
        "recommended_review_action": result.recommended_review_action,
        "class_review_hints": [
            {
                "class": hint.class_name,
                "hint": hint.hint,
                "evidence": hint.evidence,
            }
            for hint in result.class_review_hints
        ],
        "confidence": result.confidence,
        "used_evidence": {
            "project": evidence.project,
            "package": evidence.package,
            "dominant_layer": evidence.dominant_layer,
            "secondary_layer": evidence.secondary_layer,
            "is_mixed": evidence.is_mixed,
            "layer_type": evidence.layer_type,
            "classification": evidence.classification,
            "distinct_layer_count": evidence.distinct_layer_count,
            "class_count": evidence.class_count,
            "notes": evidence.notes,
            "representative_classes": evidence.representative_classes,
            "representative_methods": evidence.representative_methods,
            "class_dependency_examples": evidence.class_dependency_examples,
            "outgoing_dependencies": evidence.outgoing_dependencies,
            "incoming_dependencies": evidence.incoming_dependencies,
            "distinct_outgoing_package_count": evidence.distinct_outgoing_package_count,
            "distinct_incoming_package_count": evidence.distinct_incoming_package_count,
            "cross_layer_outgoing_dependency_ratio": evidence.cross_layer_outgoing_dependency_ratio,
            "cross_layer_incoming_dependency_ratio": evidence.cross_layer_incoming_dependency_ratio,
            "depends_on_distinct_layer_count": evidence.depends_on_distinct_layer_count,
        }
    }

    print(json.dumps(output, indent=2, ensure_ascii=False))

    if args.json_path and args.write_json_output:
        write_explanation_to_json(
            input_json_path=args.json_path,
            output_json_path=args.write_json_output,
            package_name=args.package,
            result=result,
        )
        print(f"\nUpdated JSON written to: {args.write_json_output}")

if __name__ == "__main__":
    main()