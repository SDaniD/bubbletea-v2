import json
import os

from dotenv import load_dotenv
from openai import OpenAI
from .models import ClassReviewHint, ExplanationResult

load_dotenv()

# ==== LLM model ====
DEFAULT_LLM_PROVIDER = "openai"
DEFAULT_LLM_MODEL = "gpt-4o-mini"
#DEFAULT_LLM_PROVIDER = "google"
#DEFAULT_LLM_MODEL = "gemini-2.5-flash"

class LLMExplainer:
    def __init__(self, model: str | None = None, provider: str | None = None) -> None:
        self.provider = (provider or DEFAULT_LLM_PROVIDER).lower()
        self.model = model or DEFAULT_LLM_MODEL

        if self.provider == "google":
            api_key = os.getenv("GOOGLE_API_KEY")
            base_url = "https://generativelanguage.googleapis.com/v1beta/openai/"
            missing_key_message = (
                "GOOGLE_API_KEY is not set. "
                "Put one of them in your environment or .env file."
            )
        elif self.provider == "openai":
            api_key = os.getenv("OPENAI_API_KEY")
            base_url = None
            missing_key_message = (
                "OPENAI_API_KEY is not set. Put it in your environment or .env file."
            )
        else:
            raise ValueError(
                f"Unsupported LLM provider '{self.provider}'. Use 'openai' or 'google'."
            )

        if not api_key:
            raise RuntimeError(missing_key_message)

        client_args = {"api_key": api_key}
        if base_url:
            client_args["base_url"] = base_url
        self.client = OpenAI(**client_args)

    def generate(self, system_prompt: str, user_prompt: str) -> ExplanationResult:
        response = self.client.chat.completions.create(
            model=self.model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.2,
        )

        content = response.choices[0].message.content
        data = json.loads(content)
        class_review_hints = []
        for item in data.get("class_review_hints", []) or []:
            if not isinstance(item, dict):
                continue
            class_name = item.get("class") or item.get("class_name") or ""
            hint = item.get("hint") or item.get("review_hint") or ""
            evidence = item.get("evidence") or ""
            if class_name and hint:
                class_review_hints.append(
                    ClassReviewHint(
                        class_name=str(class_name),
                        hint=str(hint),
                        evidence=str(evidence),
                    )
                )

        return ExplanationResult(
            classification_summary=data.get("classification_summary", ""),
            detected_smells=data.get("detected_smells", []),
            explanation=data.get("explanation", ""),
            confidence=data.get("confidence", "medium"),
            improvement_suggestion=data.get("improvement_suggestion", ""),
            maintainability_impact=data.get("maintainability_impact", ""),
            evolution_concern=data.get("evolution_concern", ""),
            recommended_review_action=data.get("recommended_review_action", ""),
            class_review_hints=class_review_hints,
        )