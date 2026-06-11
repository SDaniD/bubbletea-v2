from dataclasses import dataclass, field
from typing import List, Optional

@dataclass
class ClassReviewHint:
    class_name: str
    hint: str
    evidence: str = ""

@dataclass
class PackageEvidence:
    project: str
    package: str
    dominant_layer: str
    secondary_layer: str
    is_mixed: int
    layer_type: str
    classification: str
    distinct_layer_count: int
    class_count: int
    notes: str = "-"
    representative_classes: List[str] = field(default_factory=list)
    contained_classes: List[str] = field(default_factory=list)
    representative_methods: List[str] = field(default_factory=list)
    outgoing_dependencies: List[str] = field(default_factory=list)
    incoming_dependencies: List[str] = field(default_factory=list)
    class_dependency_examples: List[str] = field(default_factory=list)
    distinct_outgoing_package_count: Optional[int] = None
    distinct_incoming_package_count: Optional[int] = None
    cross_layer_outgoing_dependency_ratio: Optional[float] = None
    cross_layer_incoming_dependency_ratio: Optional[float] = None
    depends_on_distinct_layer_count: Optional[int] = None

@dataclass
class ExplanationResult:
    classification_summary: str
    detected_smells: List[str]
    explanation: str
    confidence: str
    improvement_suggestion: str
    maintainability_impact: str = ""
    evolution_concern: str = ""
    recommended_review_action: str = ""
    class_review_hints: List[ClassReviewHint] = field(default_factory=list)