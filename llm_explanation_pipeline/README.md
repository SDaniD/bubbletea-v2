# LLM Explanation Pipeline

This folder contains the BubbleTea package explanation pipeline. It enriches
BubbleTea JSON files with package classifications, ARPS review-priority fields,
LLM-generated architectural explanations, and class-level review hints.

Run a dry-run for the default K-9 setup:

```powershell
cd tools\bubbletea-v2\llm_explanation_pipeline
python batch.py
```

Generate explanations and write the enriched JSON/CSV outputs:

```powershell
python batch.py --project k9 --run
```

The default project presets read from the repository-level `outputs/` and
`data/csv/` folders. The LLM provider and model defaults are defined in
`llm_client.py` under the `==== LLM model ====` comment.
