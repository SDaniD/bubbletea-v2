from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from .models import PackageEvidence

@dataclass(frozen=True)
class TriggeredRule:
    reason: str
    points: int

def _ratio(value: float | None) -> float:
    return 0.0 if value is None else float(value)

def _count(value: int | None) -> int:
    return 0 if value is None else int(value)

def _has_detected_smell(detected_smells: Iterable[str] | None) -> bool:
    if not detected_smells:
        return False
    return any(str(smell).strip() for smell in detected_smells)

def _add_threshold_rule(
    rules: list[TriggeredRule],
    value: int | float,
    high_threshold: int | float,
    high_points: int,
    high_reason: str,
    medium_threshold: int | float,
    medium_points: int,
    medium_reason: str,
) -> None:
    if value >= high_threshold:
        rules.append(TriggeredRule(high_reason, high_points))
    elif value >= medium_threshold:
        rules.append(TriggeredRule(medium_reason, medium_points))

def triggered_rules(
    evidence: PackageEvidence,
    detected_smells: Iterable[str] | None = None,
) -> list[TriggeredRule]:
    rules: list[TriggeredRule] = []

    if evidence.classification == "layer_bridging":
        rules.append(TriggeredRule("classified as layer_bridging", 25))
    elif evidence.classification == "mostly_separated":
        rules.append(TriggeredRule("classified as mostly_separated", 12))

    if evidence.distinct_layer_count >= 3:
        rules.append(TriggeredRule("contains elements from three or more layers", 12))
    elif evidence.distinct_layer_count == 2:
        rules.append(TriggeredRule("contains elements from two layers", 6))

    _add_threshold_rule(
        rules,
        _ratio(evidence.cross_layer_outgoing_dependency_ratio),
        0.60,
        15,
        "high cross-layer outgoing dependency ratio",
        0.30,
        8,
        "moderate cross-layer outgoing dependency ratio",
    )
    _add_threshold_rule(
        rules,
        _ratio(evidence.cross_layer_incoming_dependency_ratio),
        0.60,
        15,
        "high cross-layer incoming dependency ratio",
        0.30,
        8,
        "moderate cross-layer incoming dependency ratio",
    )
    _add_threshold_rule(
        rules,
        _count(evidence.depends_on_distinct_layer_count),
        3,
        10,
        "depends on three or more distinct layers",
        2,
        5,
        "depends on two distinct layers",
    )
    _add_threshold_rule(
        rules,
        _count(evidence.distinct_outgoing_package_count),
        8,
        8,
        "depends on eight or more distinct packages",
        4,
        4,
        "depends on four or more distinct packages",
    )
    _add_threshold_rule(
        rules,
        _count(evidence.distinct_incoming_package_count),
        8,
        8,
        "used by eight or more distinct packages",
        4,
        4,
        "used by four or more distinct packages",
    )
    if evidence.class_count >= 30:
        rules.append(TriggeredRule("large package with 30 or more classes", 7))
    elif evidence.class_count >= 15:
        rules.append(TriggeredRule("medium-large package with 15 or more classes", 4))

    if _has_detected_smell(detected_smells):
        rules.append(TriggeredRule("detected architectural smell indicator", 8))

    return rules

def architecture_review_priority(
    evidence: PackageEvidence,
    detected_smells: Iterable[str] | None = None,
) -> dict[str, object]:
    rules = triggered_rules(evidence, detected_smells)
    score = min(sum(rule.points for rule in rules), 100)

    if score >= 60:
        level = "high"
    elif score >= 30:
        level = "medium"
    else:
        level = "low"

    reason = "; ".join(rule.reason for rule in rules) or "no strong review-priority indicators"

    return {
        "architecture_review_priority_level": level,
        "architecture_review_priority_score": score,
        "architecture_review_priority_reason": reason,
        "architecture_risk_level": level,
        "architecture_risk_score": score,
        "architecture_risk_reason": reason,
    }