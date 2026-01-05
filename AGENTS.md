# AutoMobile Codex Instructions

## Project rules
- Multi-language monorepo: TypeScript for core tooling, Kotlin for `android/` projects.
- Do not add JavaScript (prefer TypeScript or Kotlin as appropriate).
- `android/` is an Android Kotlin Gradle project containing apps and libraries.
- IntelliJ IDE plugin lives in `android/ide-plugin` (Gradle project).
- After implementation changes, run relevant validation commands.
- Write terminal output to `scratch/` when command output is not visible in the session.
- Validation guidance: `docs/ai/validation.md`.

## Tooling and workflows
- GitHub interactions use the GitHub CLI (`gh`).
- Create or edit PRs with `gh pr create`/`gh pr edit` using `--body-file` to preserve newlines.
- Android tasks run via the Gradle wrapper from `android/` (e.g., `(cd android && ./gradlew <task>)`).
- Local validations live under `scripts/` (prefer existing scripts over ad-hoc checks).
- Bun tasks are defined in `package.json` (run with `bun run <script>`).

## Skills
- github-cli: Use `gh` for PRs, issues, checks, and repo metadata. Path: `skills/github-cli/SKILL.md`.
- gh-pr-workflow: Create/update PRs without mangling newlines. Path: `skills/gh-pr-workflow/SKILL.md`.
- android-gradlew: Run Android tasks via `android/gradlew`. Path: `skills/android-gradlew/SKILL.md`.
- local-validation-scripts: Use `scripts/` for local validations. Path: `skills/local-validation-scripts/SKILL.md`.
- bun-tasks: Use `package.json` scripts with Bun. Path: `skills/bun-tasks/SKILL.md`.
