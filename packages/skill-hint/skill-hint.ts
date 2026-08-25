// Skill hint: suggest /skill:* commands when "/" is typed mid-line (not at message start).
//
// pi's built-in slash menu only triggers when the message itself starts with "/".
// This extension wraps the active autocomplete provider so a token like "/ski" typed
// after other text pops skill suggestions; picking one inserts "/skill:<name> " which
// executes as a normal skill command on submit (when it ends up at message start).

import type { ExtensionAPI, SlashCommandInfo } from "@earendil-works/pi-coding-agent";
import type {
	AutocompleteItem,
	AutocompleteProvider,
	AutocompleteSuggestions,
} from "@earendil-works/pi-tui";
import { fuzzyFilter } from "@earendil-works/pi-tui";

const MAX_SUGGESTIONS = 20;

/**
 * Extract the query after a mid-line "/" token, or null when not in a skill-hint context.
 *
 * Rules:
 * - Line 0 starting with "/" is the built-in slash-command menu territory -> delegate.
 * - The token must start with "/" preceded by line start or whitespace ("foo /ski" hits,
 *   "foo/ski" does not).
 * - A query containing another "/" looks like an absolute path ("/usr/local") -> delegate
 *   to the built-in path completion.
 */
function extractSkillQuery(lines: string[], cursorLine: number, cursorCol: number): string | null {
	const line = lines[cursorLine] ?? "";
	if (cursorLine === 0 && line.startsWith("/")) {
		return null;
	}
	const beforeCursor = line.slice(0, cursorCol);
	const match = beforeCursor.match(/(?:^|[ \t])\/([^\s/]*)$/);
	return match ? match[1] : null;
}

function createSkillHintProvider(
	current: AutocompleteProvider,
	getSkills: () => SlashCommandInfo[],
): AutocompleteProvider {
	return {
		triggerCharacters: [...(current.triggerCharacters ?? []), "/"],

		async getSuggestions(
			lines: string[],
			cursorLine: number,
			cursorCol: number,
			options: { signal: AbortSignal; force?: boolean },
		): Promise<AutocompleteSuggestions | null> {
			const delegate = () => current.getSuggestions(lines, cursorLine, cursorCol, options);

			const query = extractSkillQuery(lines, cursorLine, cursorCol);
			if (query === null || options.signal.aborted) {
				return delegate();
			}

			const skills = getSkills();
			if (skills.length === 0) {
				return delegate();
			}

			const matched = query ? fuzzyFilter(skills, query, (skill) => skill.name) : skills;
			const items: AutocompleteItem[] = matched.slice(0, MAX_SUGGESTIONS).map((skill) => ({
				value: `/${skill.name} `,
				label: `/${skill.name}`,
				description: skill.description,
			}));
			if (items.length === 0) {
				return delegate();
			}

			return { items, prefix: `/${query}` };
		},

		applyCompletion(lines: string[], cursorLine: number, cursorCol: number, item: AutocompleteItem, prefix: string) {
			if (!item.value.startsWith("/")) {
				return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
			}
			// Replace the "/<prefix>" token with the full command plus a trailing space.
			const line = lines[cursorLine] ?? "";
			const beforePrefix = line.slice(0, Math.max(0, cursorCol - prefix.length));
			const newLines = [...lines];
			newLines[cursorLine] = `${beforePrefix}${item.value}${line.slice(cursorCol)}`;
			return {
				lines: newLines,
				cursorLine,
				cursorCol: beforePrefix.length + item.value.length,
			};
		},

		shouldTriggerFileCompletion(lines: string[], cursorLine: number, cursorCol: number): boolean {
			return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
		},
	};
}

export default function (pi: ExtensionAPI): void {
	let registered = false;

	pi.on("session_start", (_event, ctx) => {
		if (registered) return;
		registered = true;
		ctx.ui.addAutocompleteProvider((current) =>
			createSkillHintProvider(current, () => pi.getCommands().filter((cmd) => cmd.source === "skill")),
		);
	});
}
