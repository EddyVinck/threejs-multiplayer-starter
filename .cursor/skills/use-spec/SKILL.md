---
name: use-spec
description: Implement the next feature from a repo spec and implementation plan. Use when the user invokes `/use-spec`, asks to implement from `specs/*-spec.md` and `specs/*-implementation-plan.md`, or wants the highest-priority unfinished task completed from spec-driven planning files.
---

# Use Spec

## Inputs

- Extract exactly one feature scope from the prompt.
- Treat `$1` as the feature slug when invoked as `/use-spec <feature-slug>`.
- Resolve default files from `$1`:
  - Spec: `specs/$1-spec.md`
  - Implementation plan: `specs/$1-implementation-plan.md`
- If the user explicitly provides different file names or paths, use those exact files instead of the defaults.
- If multiple features are requested, stop and ask the user to choose one feature first.

## Workflow

1. Read the resolved spec and implementation plan immediately.
2. Do not ask for file paths if both resolved default files exist.
3. Ask for clarification only if:
   - either resolved file does not exist
   - multiple plausible matches exist
   - the user explicitly provided different file names or paths
   - the user requested more than one feature
4. Select the single highest-priority unfinished task, not necessarily the first listed.
5. Implement only that task end-to-end.
6. Run feedback loops for the changed area:
   - relevant tests
   - type checks
   - lint checks
7. Fix issues introduced by the change.
8. Update the implementation plan:
   - check completed task and subtask boxes from this run
   - append a progress entry with date, task completed, files changed, checks run with outcomes, and the next recommended task
   - if the plan conflicts with the spec, follow the spec and note the conflict in the progress entry
9. Draft one commit message for the completed task and ask the user to confirm before committing.

## Prioritization Rules

- Prioritize tasks that unblock other work, reduce system risk, or protect data correctness.
- Prefer foundational backend or data contract work before UI polish when both are pending.
- Prefer tasks that can be completed safely in one commit.

## Guardrails

- When only a feature slug is provided, use the default resolved file names above.
- When explicit file names or paths are provided, use those exact files instead.
- Do not ask for file paths if the resolved default files exist unambiguously.
- Never work on more than one feature in a run.
- Keep changes scoped and avoid unrelated refactors.
- Keep checkbox state accurate: check completed items, leave incomplete items unchecked.
- Follow repository rules such as required checks and commit standards.

## Output Checklist

- Highest-priority task selected and completed for one feature
- Checks executed and passing, or blocker clearly documented
- Implementation plan updated with accurate checkbox state and a progress entry
- Written summary of the implemented task and why it matters functionally for users
- Proposed commit message, followed by a request for user confirmation before committing

## Examples

- `/use-spec boilerplate`
- "Use `specs/boilerplate-spec.md` and `specs/boilerplate-implementation-plan.md` to implement the next highest-priority unfinished task."
