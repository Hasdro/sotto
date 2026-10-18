"""Prompt registry (P2.4, ARCHITECTURE §2, R6): versioned prompts, scope resolution
campaign → team → company → platform, strict rendering. Prompt text lives in seed/prompts/
(DB from Phase 6), never in code."""

from sotto_worker.prompts.registry import (
    PromptContext,
    PromptNotFound,
    PromptRegistry,
    PromptRenderError,
    PromptVersion,
    RenderedPrompt,
    render,
)

__all__ = [
    "PromptContext",
    "PromptNotFound",
    "PromptRegistry",
    "PromptRenderError",
    "PromptVersion",
    "RenderedPrompt",
    "render",
]
