import argparse
import os
import unicodedata

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

def clean_text(value: str) -> str:
    if value is None:
        return "-"

    cleaned = str(value)
    cleaned = cleaned.replace("\u200b", "")
    cleaned = cleaned.replace("â€‹", "")
    cleaned = cleaned.replace("Ã¢â‚¬â€¹", "")
    cleaned = unicodedata.normalize("NFKC", cleaned)
    return " ".join(cleaned.split()) or "-"

def build_prompt(
    project_name: str,
    package_name: str,
    dominant_layer: str,
    secondary_layer: str,
    is_mixed: int,
    layer_type: str,
    classification: str,
    class_count: int,
    notes: str,
) -> str:
    cleaned_project_name = clean_text(project_name)
    cleaned_package_name = clean_text(package_name)
    cleaned_dominant_layer = clean_text(dominant_layer)
    cleaned_secondary_layer = clean_text(secondary_layer)
    cleaned_layer_type = clean_text(layer_type)
    cleaned_classification = clean_text(classification)
    cleaned_notes = clean_text(notes)

    return f"""You are writing a short architectural explanation for a BubbleTea package classification.

Package facts:
- Project: {cleaned_project_name}
- Package: {cleaned_package_name}
- Dominant layer: {cleaned_dominant_layer}
- Secondary layer: {cleaned_secondary_layer}
- Is mixed: {is_mixed}
- Layer type: {cleaned_layer_type}
- Classification: {cleaned_classification}
- Class count: {class_count}
- Notes: {cleaned_notes}

Write exactly 2 to 4 sentences.
Explain why the package received this classification using the package facts as evidence.
Use architectural language naturally, such as separation of concerns, cohesion, mixed responsibilities, orchestration, cross-layer coordination, or architectural erosion.
Interpret the classification like this:
- well_separated: architecturally coherent and clearly focused in one layer
- mostly_separated: mostly coherent, but with mild mixing or a small amount of cross-layer behavior
- layer_bridging: clearly spans layers; describe it as strong mixing unless the notes suggest legitimate coordination or orchestration
Mention the dominant and secondary layer relationship when relevant.
Mention the notes only if they strengthen the explanation.
Do not invent implementation details, class names, or dependencies that are not provided.
Do not use bullet points, labels, or quote the input fields verbatim."""

def get_client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set. Put it in your environment or .env file.")
    return OpenAI(api_key=api_key)

def generate_explanation(
    project_name: str,
    package_name: str,
    dominant_layer: str,
    secondary_layer: str,
    is_mixed: int,
    layer_type: str,
    classification: str,
    class_count: int,
    notes: str,
    model: str = "gpt-4o-mini",
) -> str:
    prompt = build_prompt(
        project_name=project_name,
        package_name=package_name,
        dominant_layer=dominant_layer,
        secondary_layer=secondary_layer,
        is_mixed=is_mixed,
        layer_type=layer_type,
        classification=classification,
        class_count=class_count,
        notes=notes,
    )

    response = get_client().chat.completions.create(
        model=model,
        messages=[
            {
                "role": "system",
                "content": "You explain software architecture package classifications clearly, concretely, and without overclaiming.",
            },
            {
                "role": "user",
                "content": prompt,
            },
        ],
        temperature=0.2,
    )
    return clean_text(response.choices[0].message.content)

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate a single BubbleTea package explanation.")
    parser.add_argument("--project-name", required=True)
    parser.add_argument("--package-name", required=True)
    parser.add_argument("--dominant-layer", required=True)
    parser.add_argument("--secondary-layer", required=True)
    parser.add_argument("--is-mixed", type=int, required=True)
    parser.add_argument("--layer-type", required=True)
    parser.add_argument("--classification", required=True)
    parser.add_argument("--class-count", type=int, required=True)
    parser.add_argument("--notes", default="-")
    parser.add_argument("--model", default="gpt-4o-mini")
    return parser.parse_args()

def main() -> None:
    args = parse_args()
    explanation = generate_explanation(
        project_name=args.project_name,
        package_name=args.package_name,
        dominant_layer=args.dominant_layer,
        secondary_layer=args.secondary_layer,
        is_mixed=args.is_mixed,
        layer_type=args.layer_type,
        classification=args.classification,
        class_count=args.class_count,
        notes=args.notes,
        model=args.model,
    )
    print(explanation)

if __name__ == "__main__":
    main()