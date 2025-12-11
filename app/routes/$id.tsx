import {
    type LoaderFunctionArgs,
    type ActionFunctionArgs,
} from "@remix-run/cloudflare";
import { useLoaderData, Form, useFetcher } from "@remix-run/react";
import { useEffect, useState } from "react";
import { TodoManager } from "~/to-do-manager";

// ----------------------
// CRYPTO HELPERS
// ----------------------
async function deriveKey(password) {
    const enc = new TextEncoder();
    const salt = enc.encode("fixed-salt-for-derivation");
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        enc.encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt,
            iterations: 150000,
            hash: "SHA-256",
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

async function encryptText(password, plaintext) {
    const key = await deriveKey(password);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);
    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        encoded
    );
    return JSON.stringify({
        iv: Array.from(iv),
        data: Array.from(new Uint8Array(ciphertext)),
    });
}

async function decryptText(password, cipherJson) {
    try {
        const key = await deriveKey(password);
        const obj = JSON.parse(cipherJson);
        const iv = new Uint8Array(obj.iv);
        const data = new Uint8Array(obj.data);

        const plaintext = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv },
            key,
            data
        );

        return new TextDecoder().decode(plaintext);
    } catch (err) {
        // wrong password or corrupted ciphertext
        throw new Error("Bad password or corrupted data");
    }
}

// ----------------------
// SERVER CODE (unchanged)
// ----------------------
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

// ----------------------
// COMPONENT
// ----------------------
export default function () {
    const { notes } = useLoaderData<typeof loader>();
    const fetcher = useFetcher();

    const [password, setPassword] = useState("");
    const [unlocked, setUnlocked] = useState(false);
    const [decryptedNotes, setDecryptedNotes] = useState([]);
    const [error, setError] = useState("");

    async function attemptUnlock() {
        try {
            const out = [];
            for (const n of notes) {
                const dec = await decryptText(password, n.text);
                out.push({ id: n.id, text: dec });
            }
            setDecryptedNotes(out);
            setUnlocked(true);
            setError("");
        } catch {
            setError("Incorrect password");
        }
    }

    async function handleCreate(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const plain = formData.get("text");
        const encrypted = await encryptText(password, plain);
        formData.set("text", encrypted);

        fetcher.submit(formData, { method: "post" });
        e.target.reset();
    }

    const copyToClipboard = async (text) => {
        try {
            await navigator.clipboard.writeText(text);
        } catch (err) {
            console.error("Failed to copy:", err);
        }
    };

    // ----------------------
    // PASSWORD SCREEN
    // ----------------------
    if (!unlocked) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow max-w-sm w-full">
                    <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-4">
                        Enter password
                    </h2>

                    <input
                        type="password"
                        className="w-full px-3 py-2 rounded border dark:bg-gray-700 dark:text-white mb-3"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />

                    {error && (
                        <p className="text-red-500 text-sm mb-3">{error}</p>
                    )}

                    <button
                        onClick={attemptUnlock}
                        className="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                    >
                        Unlock
                    </button>
                </div>
            </div>
        );
    }

    // ----------------------
    // MAIN APP (after unlock)
    // ----------------------
    return (
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900 py-8 px-4">
            <div className="max-w-2xl mx-auto">
                <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-8">
                    Notes
                </h1>

                <form method="post" onSubmit={handleCreate} className="mb-8">
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
                </form>

                <ul className="space-y-4">
                    {decryptedNotes.map((note) => (
                        <li
                            key={note.id}
                            className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow"
                        >
                            <div className="flex items-start gap-2">
                                <pre className="whitespace-pre-wrap font-sans text-gray-800 dark:text-white flex-1">
                                    {note.text}
                                </pre>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() =>
                                            copyToClipboard(note.text)
                                        }
                                        className="text-blue-500 hover:text-blue-700 px-2 py-1 text-sm"
                                        title="Copy note"
                                    >
                                        Copy
                                    </button>
                                    <Form method="post">
                                        <input
                                            type="hidden"
                                            name="id"
                                            value={note.id}
                                        />
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
