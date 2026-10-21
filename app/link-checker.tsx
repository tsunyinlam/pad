import React from "react";

export type Token =
	| { type: "text"; value: string }
	| { type: "link"; value: string; href: string };

/**
 * Tokenizes text into plain text segments and validated safe HTTP/HTTPS links.
 * Guarantees 100% preservation of all characters: tokens.map(t => t.value).join("") === text.
 */
export function tokenizeText(text: string): Token[] {
	if (!text) return [];

	// Fast, non-backtracking regex matching potential URLs starting with http://, https://, or www.
	const urlRegex =
		/\b(?:https?:\/\/[^\s<]+|www\.[a-zA-Z0-9][a-zA-Z0-9-]*(?:\.[a-zA-Z0-9-]+)+[^\s<]*)/gi;

	const tokens: Token[] = [];
	let lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = urlRegex.exec(text)) !== null) {
		const raw = match[0];
		const start = match.index;

		let trimmed = raw;
		let strippedSuffix = "";

		// Trim trailing punctuation that belongs to surrounding natural language text
		while (trimmed.length > 0) {
			const lastChar = trimmed[trimmed.length - 1];

			// Definite trailing sentence punctuation
			if ([".", ",", ":", ";", "!", "?", "'", '"', "`", ">"].includes(lastChar)) {
				strippedSuffix = lastChar + strippedSuffix;
				trimmed = trimmed.slice(0, -1);
				continue;
			}

			// Unbalanced brackets / parentheses (e.g. "(https://example.com)" vs "https://en.wikipedia.org/wiki/Rust_(programming_language)")
			if (lastChar === ")") {
				const openCount = (trimmed.match(/\(/g) || []).length;
				const closeCount = (trimmed.match(/\)/g) || []).length;
				if (closeCount > openCount) {
					strippedSuffix = lastChar + strippedSuffix;
					trimmed = trimmed.slice(0, -1);
					continue;
				}
			} else if (lastChar === "]") {
				const openCount = (trimmed.match(/\[/g) || []).length;
				const closeCount = (trimmed.match(/\]/g) || []).length;
				if (closeCount > openCount) {
					strippedSuffix = lastChar + strippedSuffix;
					trimmed = trimmed.slice(0, -1);
					continue;
				}
			} else if (lastChar === "}") {
				const openCount = (trimmed.match(/\{/g) || []).length;
				const closeCount = (trimmed.match(/\}/g) || []).length;
				if (closeCount > openCount) {
					strippedSuffix = lastChar + strippedSuffix;
					trimmed = trimmed.slice(0, -1);
					continue;
				}
			}

			break;
		}

		// Validate URL structure and ensure safe protocol (strictly http / https)
		let isValid = false;
		let href = "";

		if (trimmed.length > 0) {
			if (/^https?:\/\//i.test(trimmed)) {
				try {
					const parsed = new URL(trimmed);
					if (parsed.protocol === "http:" || parsed.protocol === "https:") {
						if (parsed.hostname && parsed.hostname.length > 0) {
							isValid = true;
							href = parsed.href;
						}
					}
				} catch {
					isValid = false;
				}
			} else if (/^www\./i.test(trimmed)) {
				try {
					const parsed = new URL("https://" + trimmed);
					if (
						parsed.hostname &&
						parsed.hostname.includes(".") &&
						!parsed.hostname.endsWith(".")
					) {
						isValid = true;
						href = parsed.href;
					}
				} catch {
					isValid = false;
				}
			}
		}

		if (isValid) {
			if (start > lastIndex) {
				tokens.push({ type: "text", value: text.slice(lastIndex, start) });
			}
			tokens.push({ type: "link", value: trimmed, href });
			lastIndex = start + trimmed.length;
			urlRegex.lastIndex = lastIndex;
		}
	}

	if (lastIndex < text.length) {
		tokens.push({ type: "text", value: text.slice(lastIndex) });
	}

	return tokens;
}

interface FormattedTextProps {
	text: string;
}

/**
 * Renders text with cosmetic <a> tags over detected links.
 * Does not alter the original string content and protects against injection attacks.
 */
export function FormattedText({ text }: FormattedTextProps) {
	const tokens = tokenizeText(text);

	if (tokens.length === 0) {
		return null;
	}

	return (
		<>
			{tokens.map((token, index) => {
				if (token.type === "link") {
					return (
						<a
							key={index}
							href={token.href}
							target="_blank"
							rel="noopener noreferrer"
							className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 underline underline-offset-2 break-all"
							onClick={(e) => e.stopPropagation()}
						>
							{token.value}
						</a>
					);
				}
				return token.value;
			})}
		</>
	);
}
