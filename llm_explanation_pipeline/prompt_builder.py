import unicodedata
from typing import Iterable

from .models import PackageEvidence

def clean_text(value: str) -> str:
    if value is None:
        return "-"

    cleaned = str(value)
    cleaned = cleaned.replace("\u200b", "")
    cleaned = cleaned.replace("â€‹", "")
    cleaned = cleaned.replace("Ã¢â‚¬â€¹", "")
    cleaned = unicodedata.normalize("NFKC", cleaned)
    return " ".join(cleaned.split()) or "-"

def clean_list(values: Iterable[str]) -> list[str]:
    return [clean_text(v) for v in values if clean_text(v) != "-"]

SYSTEM_PROMPT = """
You are analyzing BubbleTea package classifications using software architectural design principles.

You must:
- use only the provided evidence
- keep the given classification fixed
- not invent classes, methods, dependencies, or implementation details
- explain the result in terms of architectural principles and package-level smells
- use dependency features as supporting evidence, not as automatic proof of a smell
- use class-level dependency examples when making concrete improvement suggestions
- make the explanation package-specific enough that it would not fit many unrelated packages
- distinguish between problematic mixing and justified orchestration or cross-cutting support

Return valid JSON with exactly these fields:
{
  "classification_summary": "one full explanatory sentence starting with 'This package is classified as ... because ...'",
  "detected_smells": ["..."] or [],
  "explanation": "3 to 5 sentences that mention package-specific responsibilities, classes, or dependency examples before numeric ratios",
  "confidence": "high|medium|low",
  "improvement_suggestion": "one concise sentence with a concrete next step, or 'No immediate refactoring is suggested from the available evidence.'",
  "maintainability_impact": "1 to 2 package-specific sentences explaining how the evidence could affect comprehension, change effort, testing, or regression risk",
  "evolution_concern": "1 to 2 package-specific sentences explaining how the package could become harder to evolve if the current boundary pressure grows",
  "recommended_review_action": "one concrete review action grounded in the provided package, class, method, or dependency evidence",
  "class_review_hints": [
    {
      "class": "ClassName",
      "hint": "1 to 3 sentences explaining why this class is worth inspecting first",
      "evidence": "short evidence phrase grounded in the provided class dependency examples"
    }
  ]
}

Do not interpret empty dependency lists as evidence that no dependencies exist.
If outgoing or incoming dependency lists are empty, treat dependency evidence as unavailable and do not mention dependency absence in the explanation.
If numeric dependency features are unavailable, do not discuss dependency strength.
If numeric dependency features are zero, state this only when it helps explain low coupling; do not overemphasize zero values.
Do not start the explanation with metric values or ratios.
Do not write generic phrases such as "interacts with multiple layers" without saying what the package specifically does or which concrete classes/packages create that interaction.
If an explanation would still make sense after removing package names, class names, and domain responsibilities, rewrite it to be more specific.
Use cautious wording such as "appears", "suggests", or "is consistent with" when the evidence is limited.
For mostly_separated packages, emphasize mild overlap rather than strong architectural problems.
For well_separated packages, explain coherence without overstating certainty.
Only report a smell if it is clearly supported by the provided evidence.
Do not infer cross-layer coupling solely from an empty or missing dependency list.
Do not report Cross-Layer Coupling only because dependencies exist; report it when dependencies cross layers substantially or reinforce mixed internal layer evidence.
Distinguish internal package separation from external dependency coupling: a package can be internally coherent while still having dependency-related risks.

Confidence guidance:
- high: the evidence clearly and specifically supports the explanation
- medium: the explanation is reasonable, but some evidence is missing or limited
- low: the explanation is weakly supported or the evidence is ambiguous

Do not default to high confidence.
If dependencies are missing, notes are generic, or the package could plausibly fit multiple interpretations, prefer medium.

Improvement suggestion guidance:
- For layer_bridging, suggest reviewing or separating the specific mixed responsibilities or dependency directions supported by the evidence.
- For mostly_separated, suggest a light check or boundary clarification rather than a major redesign.
- For well_separated, avoid unnecessary refactoring; suggest monitoring only when dependency evidence indicates coupling risk.
- For medium or high risk packages, mention at least one concrete class, target package, or dependency direction when class-level dependency examples are available.
- Prefer suggestions such as "Check whether LocalFolder should keep depending on mail-level coordination classes" over generic suggestions such as "review dependencies".
- Do not suggest creating new packages, classes, or modules by name unless the evidence provides those names.
- Keep improvement suggestions consistent with class_review_hints: if the suggestion names a concrete class as needing review or monitoring, include a matching class_review_hint for that class.
- If the evidence is not strong enough to justify a class_review_hint, do not name that class in the improvement_suggestion; keep the suggestion package-level instead.

Architecture Review Priority interpretation guidance:
- The architecture review priority score, level, and reason are deterministic rubric outputs; do not recalculate or contradict them.
- Generate maintainability_impact, evolution_concern, and recommended_review_action as package-specific interpretations of the given classification, smells, dependency evidence, class examples, and review-priority signals.
- These fields must be more concrete than the deterministic rubric wording: mention the package responsibility, at least one concrete class/package/method when evidence supports it, or a specific dependency direction.
- For high priority packages, explain the likely maintenance/evolution burden and give an inspection action that a developer could perform.
- For medium priority packages, frame the concern as something to monitor or clarify, not as confirmed erosion.
- For low priority packages, keep the wording short and avoid inventing a problem; if no action is justified, say that no immediate architecture review action is suggested.
- Do not use generic text such as "may require understanding several external packages or layers" unless it is tied to concrete evidence from this package.
- Keep these three fields consistent with the explanation, detected_smells, and class_review_hints.

Class review hint guidance:
- Return at most 3 class_review_hints.
- Return class_review_hints only for classes that are genuinely worth clicking for follow-up inspection; do not use them as a general summary of the package.
- Prefer returning [] over producing weak or generic hints.
- For well_separated packages, normally return [] unless a class-level dependency example clearly contradicts the otherwise coherent package boundary.
- For mostly_separated packages, return a hint only when the class-level dependency example clearly points outside the package's dominant layer or explains the mild overlap.
- For layer_bridging packages, return hints only for the strongest concrete class-level examples, not for every class in the package.
- A class-level example is cross-layer only if its listed target/source layer is different from the package's dominant layer.
- Do not create a class_review_hint for a dependency to a package in the same layer as the package's dominant layer.
- The hint must name the class and the concrete target/source package or layer from the evidence.
- The evidence field must quote or closely paraphrase one specific class-level dependency example.
- If the improvement_suggestion names a concrete class, either return a matching class_review_hint for that class or rewrite the improvement_suggestion without that class name.
- Avoid vague phrases such as "may indicate cross-layer interaction"; say exactly which class depends on or is used by which package/layer.
- Do not say the class is wrong; explain why it is worth inspecting first.
- Use only classes named in the provided evidence.
- Do not create a class_review_hint if you cannot connect it to a named dependency package from the evidence.
- If no specific class deserves a hint, return [].
""".strip()

SMELL_DEFINITIONS = """
Architectural smell definitions:

1. Mixed Responsibilities
A package contains responsibilities that belong to multiple architectural layers or concerns, reducing separation of concerns.

2. Weak Layer Cohesion
The internal elements of a package are not concentrated around a single architectural role or responsibility.

3. Cross-Layer Coupling
A package depends on or interacts with multiple layers in a way that increases architectural entanglement.

4. God Package
A package contains many classes or responsibilities and appears overly central or overloaded.

5. Justified Orchestration
A package spans multiple concerns because it coordinates workflows or integrates subsystems in a controlled and meaningful way. This is not necessarily a smell.

6. Cross-Cutting Support
A package provides shared support functionality used across the system. This may be justified and should not automatically be treated as a violation.

Interpretation guidance:
- well_separated -> architecturally coherent and clearly focused
- mostly_separated -> mostly coherent, but with mild mixing or limited cross-layer behavior
- layer_bridging -> strongly mixed or potentially problematic unless the evidence clearly indicates justified orchestration or cross-cutting support

Dependency feature guidance:
- distinct_outgoing_package_count: how many other packages this package depends on
- distinct_incoming_package_count: how many packages depend on this package
- cross_layer_outgoing_dependency_ratio: share of outgoing dependencies that cross the package's dominant layer
- cross_layer_incoming_dependency_ratio: share of incoming dependencies from packages in other layers
- depends_on_distinct_layer_count: how many different layers are reached by outgoing dependencies

Use dependency features mainly to decide whether Cross-Layer Coupling is supported.
High cross-layer ratios or dependencies into several layers strengthen a coupling concern.
High incoming counts can indicate centrality, but only call it God Package when class count and responsibility evidence also support that.
When the fixed classification is well_separated, dependency evidence may be mentioned as an external coupling risk, but it should not overturn the explanation that the package itself is internally coherent.
When dependency evidence points to expected framework, resource, sprite, persistence, or utility interactions, prefer cautious wording and consider whether this is justified support rather than a smell.
""".strip()

def _format_list(title: str, values: list[str]) -> str:
    if not values:
        return f"{title}:\n- none"
    return f"{title}:\n" + "\n".join(f"- {v}" for v in values)

def _format_optional_number(value: int | float | None) -> str:
    if value is None:
        return "unavailable"
    if isinstance(value, float):
        return f"{value:.3f}"
    return str(value)

def _dependency_feature_block(evidence: PackageEvidence) -> str:
    values = [
        evidence.distinct_outgoing_package_count,
        evidence.distinct_incoming_package_count,
        evidence.cross_layer_outgoing_dependency_ratio,
        evidence.cross_layer_incoming_dependency_ratio,
        evidence.depends_on_distinct_layer_count,
    ]
    if all(value is None for value in values):
        return "Dependency feature summary:\n- unavailable"

    return "\n".join(
        [
            "Dependency feature summary:",
            f"- Distinct outgoing package dependencies: {_format_optional_number(evidence.distinct_outgoing_package_count)}",
            f"- Distinct incoming package dependencies: {_format_optional_number(evidence.distinct_incoming_package_count)}",
            f"- Cross-layer outgoing dependency ratio: {_format_optional_number(evidence.cross_layer_outgoing_dependency_ratio)}",
            f"- Cross-layer incoming dependency ratio: {_format_optional_number(evidence.cross_layer_incoming_dependency_ratio)}",
            f"- Distinct layers reached by outgoing dependencies: {_format_optional_number(evidence.depends_on_distinct_layer_count)}",
        ]
    )

def build_user_prompt(evidence: PackageEvidence) -> str:
    project = clean_text(evidence.project)
    package = clean_text(evidence.package)
    dominant_layer = clean_text(evidence.dominant_layer)
    secondary_layer = clean_text(evidence.secondary_layer)
    layer_type = clean_text(evidence.layer_type)
    classification = clean_text(evidence.classification)
    notes = clean_text(evidence.notes)

    representative_classes = clean_list(evidence.representative_classes)
    representative_methods = clean_list(evidence.representative_methods)
    outgoing_dependencies = clean_list(evidence.outgoing_dependencies)
    incoming_dependencies = clean_list(evidence.incoming_dependencies)
    class_dependency_examples = clean_list(evidence.class_dependency_examples)

    dependency_sections = []
    if outgoing_dependencies:
        dependency_sections.append(_format_list("Outgoing package dependencies", outgoing_dependencies))
    if incoming_dependencies:
        dependency_sections.append(_format_list("Incoming package dependencies", incoming_dependencies))

    dependency_block = "\n\n".join(dependency_sections)

    return f"""
{SMELL_DEFINITIONS}

Analyze the following package using the definitions and structured evidence.

Package evidence:
Project: {project}
Package: {package}
Classification: {classification}
Dominant layer: {dominant_layer}
Secondary layer: {secondary_layer}
Is mixed: {evidence.is_mixed}
Layer type: {layer_type}
Distinct layer count: {evidence.distinct_layer_count}
Class count: {evidence.class_count}
Notes: {notes}

{_format_list("Representative classes", representative_classes)}

{_format_list("Representative methods", representative_methods)}
{f"\n\n{dependency_block}" if dependency_block else ""}

{_format_list("Class-level dependency examples", class_dependency_examples)}

{_dependency_feature_block(evidence)}

Tasks:
1. Start from what this package specifically does, using notes, representative classes, and class-level dependency examples.
2. Explain why this package has the given classification.
3. Identify which architectural smells, if any, are supported by the evidence.
4. Distinguish between problematic mixing and justified orchestration or cross-cutting when relevant.
5. Use dependency ratios/counts only after naming the concrete responsibility or class/package interaction they support.
6. Provide a concrete improvement suggestion that follows from the evidence and does not overstate certainty; when class-level dependency examples are available, refer to the relevant class or target package.
7. Generate maintainability_impact, evolution_concern, and recommended_review_action as concrete ARPS interpretation text grounded in this package's evidence.
8. Keep the explanation specific, concise, and grounded in the evidence only.
9. Do not mention dependency absence unless explicit dependency evidence is actually provided.
10. For class_review_hints, be conservative: only flag classes whose class-level dependency examples point outside the package's dominant layer or directly support the improvement suggestion.
""".strip()