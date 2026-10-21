import { describe, it, expect } from "vitest";
import { tokenizeText } from "../app/link-checker";

describe("link-checker", () => {
	describe("preservation of original text", () => {
		it("strictly preserves text without links", () => {
			const input = "This is a simple note without any links.\nWith multiple lines.";
			const tokens = tokenizeText(input);
			expect(tokens.map((t) => t.value).join("")).toBe(input);
			expect(tokens).toEqual([{ type: "text", value: input }]);
		});

		it("strictly preserves whitespace, tabs, and indentation", () => {
			const input = "   \t\n  Indented code:\n    const x = 1;\n    const y = 2;\n";
			const tokens = tokenizeText(input);
			expect(tokens.map((t) => t.value).join("")).toBe(input);
		});

		it("strictly preserves all characters when links are present", () => {
			const input =
				"Start https://example.com middle https://test.org/path?q=1#hash end.";
			const tokens = tokenizeText(input);
			expect(tokens.map((t) => t.value).join("")).toBe(input);
		});
	});

	describe("link detection and validation", () => {
		it("detects http and https URLs", () => {
			const input = "Visit https://secure.com and http://insecure.com/page";
			const tokens = tokenizeText(input);
			const links = tokens.filter((t) => t.type === "link");
			expect(links).toHaveLength(2);
			expect(links[0]).toEqual({
				type: "link",
				value: "https://secure.com",
				href: "https://secure.com/",
			});
			expect(links[1]).toEqual({
				type: "link",
				value: "http://insecure.com/page",
				href: "http://insecure.com/page",
			});
		});

		it("detects www. URLs and prefixes with https://", () => {
			const input = "Check www.github.com/remix-run for more details";
			const tokens = tokenizeText(input);
			const links = tokens.filter((t) => t.type === "link");
			expect(links).toHaveLength(1);
			expect(links[0]).toEqual({
				type: "link",
				value: "www.github.com/remix-run",
				href: "https://www.github.com/remix-run",
			});
		});

		it("correctly handles sentence-ending punctuation", () => {
			const input =
				"Links: https://a.com. Also https://b.com, https://c.com; https://d.com! https://e.com?";
			const tokens = tokenizeText(input);
			const links = tokens.filter((t) => t.type === "link");
			expect(links.map((l) => l.value)).toEqual([
				"https://a.com",
				"https://b.com",
				"https://c.com",
				"https://d.com",
				"https://e.com",
			]);
			expect(tokens.map((t) => t.value).join("")).toBe(input);
		});

		it("correctly balances parentheses in URLs like Wikipedia", () => {
			const wiki = "https://en.wikipedia.org/wiki/Rust_(programming_language)";
			const inParens = `See (${wiki}) for docs`;
			const tokens = tokenizeText(inParens);
			const links = tokens.filter((t) => t.type === "link");
			expect(links).toHaveLength(1);
			expect(links[0].value).toBe(wiki);
			expect(tokens.map((t) => t.value).join("")).toBe(inParens);
		});

		it("correctly handles URLs wrapped in quotes or brackets", () => {
			const input =
				'Check "https://example.com/1" and \'https://example.com/2\' and <https://example.com/3>';
			const tokens = tokenizeText(input);
			const links = tokens.filter((t) => t.type === "link");
			expect(links.map((l) => l.value)).toEqual([
				"https://example.com/1",
				"https://example.com/2",
				"https://example.com/3",
			]);
			expect(tokens.map((t) => t.value).join("")).toBe(input);
		});
	});

	describe("security and anti-injection", () => {
		it("does not match javascript: or data: pseudo-schemes", () => {
			const input =
				"javascript:alert(1) and data:text/html,<script>evil()</script>";
			const tokens = tokenizeText(input);
			const links = tokens.filter((t) => t.type === "link");
			expect(links).toHaveLength(0);
			expect(tokens.map((t) => t.value).join("")).toBe(input);
		});

		it("does not false-positive on code snippets or file names", () => {
			const input =
				"const x = obj.property; import { a } from './file.js'; version 1.2.3; test.txt";
			const tokens = tokenizeText(input);
			const links = tokens.filter((t) => t.type === "link");
			expect(links).toHaveLength(0);
			expect(tokens.map((t) => t.value).join("")).toBe(input);
		});

		it("preserves HTML characters without disruption", () => {
			const input =
				'<div class="box"> <script>alert("test")</script> https://legit.com </div>';
			const tokens = tokenizeText(input);
			expect(tokens.map((t) => t.value).join("")).toBe(input);
			const links = tokens.filter((t) => t.type === "link");
			expect(links).toHaveLength(1);
			expect(links[0].value).toBe("https://legit.com");
		});
	});
});
