import {
    type LoaderFunctionArgs,
    type ActionFunctionArgs,
} from "@remix-run/cloudflare";
import { useLoaderData, Form } from "@remix-run/react";
import { TodoManager } from "~/to-do-manager";

/* --------------------------------------------------
   UI-ONLY CRYPTO HELPERS (AES-CBC + PKCS5/7)
-------------------------------------------------- */

async function importKey(password: string) {
    return crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        { name: "AES-CBC" },
        false,
        ["encrypt", "decrypt"]
    );
}

async function encryptText(text: string, password: string) {
    const key = await importKey(password);
    const iv = crypto.getRandomValues(new Uint8Array(16));
    const encoded = new TextEncoder().encode(text);

    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-CBC", iv },
        key,
        encoded
    );

    return (
        btoa(String.fromCharCode(...iv)) +
        ":" +
        btoa(String.fromCharCode(...new Uint8Array(ciphertext)))
    );
}

async function decryptText(text: string, password: string) {
    const [ivB64, ctB64] = text.split(":");
    const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
    const ciphertext = Uint8Array.from(atob(ctB64), (c) => c.charCodeAt(0));

    const key = await importKey(password);
    const plaintext = await crypto.subtle.decrypt(
        { name: "AES-CBC", iv },
        key,
        ciphertext
    );

    return new TextDecoder().decode(plaintext);
}

/* --------------------------------------------------
   LOADER + ACTION (UNCHANGED)
-------------------------------------------------- */

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

/* --------------------------------------------------
   FULL UI WITH OPTIONAL ENCRYPT + DECRYPT
-------------------------------------------------- */

export default function () {
    const { notes } = useLoaderData<typeof loader>();

    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
        } catch (err) {
            console.error("Failed to copy:", err);
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900 py-8 px-4">
            <div className="max-w-2xl mx-auto">
                <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-8">
                    Notes
                </h1>

                {/* CREATE FORM WITH OPTIONAL ENCRYPTION */}
                <Form
                    method="post"
                    className="mb-8"
                    onSubmit={async (e) => {
                        const form = e.currentTarget;
                        const keyInput = form.querySelector("input[name='key']") as HTMLInputElement;
                        const textArea = form.querySelector("textarea[name='text']") as HTMLTextAreaElement;

                        const key = keyInput.value.trim();

                        if (key !== "") {
                            e.preventDefault();
                            const encrypted = await encryptText(textArea.value, key);
                            textArea.value = encrypted;
                            form.submit(); // resubmit with encrypted text
                        }
                    }}
                >
                    <textarea
                        name="text"
                        rows={4}
                        className="w-full rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white shadow-sm px-4 py-2 resize-y"
                        placeholder="Add a new note..."
                    />

                    <input
                        name="key"
                        type="password"
                        className="mt-2 w-full rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white shadow-sm px-4 py-2"
                        placeholder="Optional: Encryption key"
                    />

                    <button
                        type="submit"
                        name="intent"
                        value="create"
                        className="mt-2 bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition"
                    >
                        Add Note (Encrypted if Key Provided)
                    </button>
                </Form>

                {/* DECRYPT ALL UI */}
                <div className="mb-6">
                    <input
                        id="decrypt-key"
                        type="password"
                        className="w-full rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white shadow-sm px-4 py-2 mb-2"
                        placeholder="Enter key to decrypt ALL notes (optional)"
                    />

                    <button
                        className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                        onClick={async () => {
                            const keyInput = document.getElementById("decrypt-key") as HTMLInputElement;
                            const key = keyInput.value.trim();
                            if (!key) return;

                            const noteElements = document.querySelectorAll("[data-note]");

                            for (const el of noteElements) {
                                const encrypted = el.textContent;
                                try {
                                    const plain = await decryptText(encrypted!, key);
                                    el.textContent = plain;
                                } catch {
                                    el.textContent = "[Failed to decrypt]";
                                }
                            }
                        }}
                    >
                        Decrypt All Notes
                    </button>
                </div>

                {/* NOTES LIST */}
                <ul className="space-y-4">
                    {notes.map((note) => (
                        <li
                            key={note.id}
                            className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow"
                        >
                            <div className="flex items-start gap-2">
                                <pre
                                    data-note
                                    className="whitespace-pre-wrap font-sans text-gray-800 dark:text-white flex-1"
                                >
                                    {note.text}
                                </pre>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => copyToClipboard(note.text)}
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
                    ))}
                </ul>
            </div>
        </div>
    );
}
