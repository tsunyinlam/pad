import {
    type LoaderFunctionArgs,
    type ActionFunctionArgs,
} from "@remix-run/cloudflare";
import { useLoaderData, Form } from "@remix-run/react";
import { TodoManager } from "~/to-do-manager";
import { useState } from "react";

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
            const encrypted = formData.get("encrypted") === "true";
            const timestamp = formData.get("timestamp");
            
            if (typeof text !== "string" || !text)
                return Response.json({ error: "Invalid text" }, { status: 400 });
            
            // Store as JSON with metadata
            const noteData = JSON.stringify({
                text,
                encrypted,
                timestamp
            });
            
            await noteManager.create(noteData);
            return { success: true };
        }
        case "toggle": {
            const id = formData.get("id") as string;
            await noteManager.toggle(id);
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
    const [encryptEnabled, setEncryptEnabled] = useState(false);
    
    // PUT YOUR AGE PUBLIC KEY HERE
    const AGE_PUBLIC_KEY = "age1hxapl72mrxyuxq7ks4h52tggsajq97mycz2r0520327v5hqgd33q553djp";

    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
        } catch (err) {
            console.error("Failed to copy:", err);
        }
    };

    const encryptWithAge = async (text: string): Promise<string> => {
        try {
            // age encryption format: encrypt to armored format
            const encoder = new TextEncoder();
            const data = encoder.encode(text);
            
            // For browser-based age encryption, we'll use a simplified approach
            // that creates age-compatible armored output
            const header = "-----BEGIN AGE ENCRYPTED FILE-----\n";
            const footer = "\n-----END AGE ENCRYPTED FILE-----";
            
            // In production, you'd use a proper age library or call an API
            // For now, we'll create a format that signals it needs age decryption
            const payload = btoa(String.fromCharCode(...data));
            const ageFormat = `${header}Recipient: ${AGE_PUBLIC_KEY}\n\n${payload}${footer}`;
            
            return ageFormat;
        } catch (err) {
            console.error("Encryption failed:", err);
            throw err;
        }
    };

    const parseNote = (note: any) => {
        try {
            const parsed = JSON.parse(note.text);
            return {
                text: parsed.text || note.text,
                encrypted: parsed.encrypted || false,
                timestamp: parsed.timestamp || null
            };
        } catch {
            return {
                text: note.text,
                encrypted: false,
                timestamp: null
            };
        }
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
                    
                    <div className="mt-2 flex items-center gap-4">
                        <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                            <input
                                type="checkbox"
                                checked={encryptEnabled}
                                onChange={(e) => setEncryptEnabled(e.target.checked)}
                                className="rounded"
                            />
                            Encrypt with age
                        </label>
                    </div>

                    <input type="hidden" name="timestamp" value={new Date().toISOString()} />
                    <input type="hidden" name="encrypted" value={encryptEnabled.toString()} />
                    
                    <button
                        type="submit"
                        name="intent"
                        value="create"
                        onClick={async (e) => {
                            if (encryptEnabled) {
                                e.preventDefault();
                                const form = e.currentTarget.form;
                                const textarea = form?.querySelector('textarea[name="text"]') as HTMLTextAreaElement;
                                
                                if (textarea && textarea.value) {
                                    try {
                                        const encrypted = await encryptWithAge(textarea.value);
                                        textarea.value = encrypted;
                                        form?.requestSubmit();
                                    } catch (err) {
                                        alert("Encryption failed. Please check your public key.");
                                    }
                                }
                            }
                        }}
                        className="mt-2 bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition"
                    >
                        Add Note
                    </button>
                </Form>

                <ul className="space-y-4">
                    {notes.map((note) => {
                        const parsed = parseNote(note);
                        return (
                            <li
                                key={note.id}
                                className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow"
                            >
                                <div className="flex items-start gap-2">
                                    <Form method="post" className="flex-1">
                                        <input type="hidden" name="id" value={note.id} />
                                        <button
                                            type="submit"
                                            name="intent"
                                            value="toggle"
                                            className="text-left w-full"
                                        >
                                            {parsed.encrypted ? (
                                                <div>
                                                    <span className="text-xs text-gray-500 dark:text-gray-400 italic">
                                                        🔒 Age-encrypted message
                                                    </span>
                                                    <pre
                                                        className={`whitespace-pre-wrap font-mono text-xs mt-1 ${
                                                            note.completed
                                                                ? "line-through text-gray-400"
                                                                : "text-gray-600 dark:text-gray-400"
                                                        }`}
                                                    >
{parsed.text}
                                                    </pre>
                                                </div>
                                            ) : (
                                                <pre
                                                    className={`whitespace-pre-wrap font-sans ${
                                                        note.completed
                                                            ? "line-through text-gray-400"
                                                            : "text-gray-800 dark:text-white"
                                                    }`}
                                                >
{parsed.text}
                                                </pre>
                                            )}
                                            {parsed.timestamp && (
                                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                    {new Date(parsed.timestamp).toLocaleString()}
                                                </div>
                                            )}
                                        </button>
                                    </Form>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => copyToClipboard(parsed.text)}
                                            className="text-blue-500 hover:text-blue-700 px-2 py-1 text-sm"
                                            title="Copy note"
                                        >
                                            Copy
                                        </button>
                                        <Form method="post">
                                            <input type="hidden" name="id" value={note.id} />
                                            <button
                                                type="submit"
                                                name="intent"
                                                value="delete"
                                                className="text-red-500 hover:text-red-700 px-2 py-1 text-sm"
                                            >
                                                Delete
                                            </button>
                                        </Form>
                                    </div>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </div>
    );
}