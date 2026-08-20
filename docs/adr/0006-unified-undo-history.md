# ADR 0006: Unified undo history

Status: Accepted

Text and visual edits participate in one source-oriented history. Every visual operation ultimately creates source edits, so undo never has to reconcile independent document models.
