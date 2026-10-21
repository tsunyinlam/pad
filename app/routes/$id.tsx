import { useState } from "react";
import {
	type LoaderFunctionArgs,
	type ActionFunctionArgs,
} from "@remix-run/cloudflare";
import { useLoaderData, Form } from "@remix-run/react";
import { TodoManager } from "~/to-do-manager";
import { FormattedText } from "~/link-checker";

export const loader = async ({ params, context }: LoaderFunctionArgs) => {
	const noteManager = new TodoManager(
		context.cloudflare.env.TO_DO_LIST,
		params.id,
	);
	const notes = await noteManager.list();
	return { notes };
};

export async function action({ request, context, params }: ActionFunctionArgs) {
	const noteManager = new TodoManager(
		context.cloudflare.env.TO_DO_LIST,
		params.id,
	);
	const formData = await request.formData();
	const intent = formData.get("intent");

	switch (intent) {
		case "create": {
			const text = formData.get("text");
			if (typeof text !== "string" || !text)
				return Response.json({ error: "Invalid text" }, { status: 400 });
			await noteManager.create(text);
			return { success: true };
		}
		case "delete": {
			const id = formData.get("id") as string;
			await noteManager.delete(id);
			return { success: true };
		}
		default:
			return Response.json({ error: "Invalid intent" }, { status: 400 });
	}
}

export default function () {
	const { notes } = useLoaderData<typeof loader>();
	const [copiedId, setCopiedId] = useState<string | null>(null);

	const copyToClipboard = async (text: string) => {
		try {
			if (navigator.clipboard && navigator.clipboard.writeText) {
				await navigator.clipboard.writeText(text);
			} else {
				const textArea = document.createElement("textarea");
				textArea.value = text;
				textArea.style.position = "fixed";
				textArea.style.left = "-999999px";
				textArea.style.top = "-999999px";
				document.body.appendChild(textArea);
				textArea.focus();
				textArea.select();
				document.execCommand("copy");
				textArea.remove();
			}
		} catch (err) {
			console.error("Failed to copy:", err);
		}
	};

	const handleCopyNote = async (id: string, text: string) => {
		await copyToClipboard(text);
		setCopiedId(id);
		setTimeout(() => {
			setCopiedId((current) => (current === id ? null : current));
		}, 2000);
	};

	return (
		<div className="min-h-screen bg-gray-100 dark:bg-gray-900 py-8 px-4">
			<div className="max-w-2xl mx-auto">
				<h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-8">
					Notes
				</h1>

				<Form method="post" className="mb-8">
					<textarea
						name="text"
						rows={4}
						className="w-full rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white shadow-sm px-4 py-2 resize-y"
						placeholder="Add a new note..."
					/>
					<button
						type="submit"
						name="intent"
						value="create"
						className="mt-2 bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition"
					>
						Add Note
					</button>
				</Form>

				<ul className="space-y-4">
					{notes.map((note) => (
						<li
							key={note.id}
							className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow"
						>
							<div className="flex items-start gap-2">
								<div
									lang="en"
									className="whitespace-pre-wrap break-words font-sans text-gray-800 dark:text-white flex-1"
									style={{ hyphens: "auto", overflowWrap: "anywhere" }}
									onCopy={(e) => {
										const selection = window.getSelection();
										if (!selection || selection.isCollapsed) return;
										const selectedText = selection.toString();
										if (selectedText) {
											e.clipboardData.setData("text/plain", selectedText);
											e.preventDefault();
										}
									}}
								>
									<FormattedText text={note.text} />
								</div>
								<div className="flex gap-2 items-start">
									<button
										onClick={() => handleCopyNote(note.id, note.text)}
										className="text-blue-500 hover:text-blue-700 p-2 rounded transition"
										title={copiedId === note.id ? "Copied!" : "Copy note"}
										aria-label={copiedId === note.id ? "Copied!" : "Copy note"}
									>
										{copiedId === note.id ? (
											<svg
												xmlns="http://www.w3.org/2000/svg"
												className="h-4 w-4 text-green-500"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2}
													d="M5 13l4 4L19 7"
												/>
											</svg>
										) : (
											<svg
												xmlns="http://www.w3.org/2000/svg"
												className="h-4 w-4"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2}
													d="M8 7h8a2 2 0 012 2v8a2 2 0 01-2 2H8a2 2 0 01-2-2V9a2 2 0 012-2z"
												/>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2}
													d="M16 5H8a2 2 0 00-2 2v8"
												/>
											</svg>
										)}
									</button>
									<Form method="post">
										<input type="hidden" name="id" value={note.id} />
										<button
											type="submit"
											name="intent"
											value="delete"
											className="text-red-500 hover:text-red-700 p-2 rounded transition"
											title="Delete note"
											aria-label="Delete note"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												className="h-4 w-4"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2}
													d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M10 3h4a1 1 0 011 1v2H9V4a1 1 0 011-1z"
												/>
											</svg>
										</button>
									</Form>
								</div>
							</div>
						</li>
					))}
				</ul>
			</div>
		</div>
	);
}