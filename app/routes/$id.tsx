import {
    type LoaderFunctionArgs,
    type ActionFunctionArgs,
} from "@remix-run/cloudflare";
import { useLoaderData, Form } from "@remix-run/react";
import { TodoManager } from "~/to-do-manager";
import { useState, useEffect } from "react";

// Client-side encryption utilities
const encryptText = async (text: string, key: string): Promise<string> => {
    if (!key) return text;
    
    // Convert key to CryptoKey
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key.padEnd(32, '0').slice(0, 32)); // Pad/truncate to 32 bytes
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'AES-GCM' },
        false,
        ['encrypt']
    );

    // Generate IV
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // Encrypt
    const encrypted = await crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv: iv
        },
        cryptoKey,
        encoder.encode(text)
    );

    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);
    
    // Convert to base64 for storage
    return btoa(String.fromCharCode(...combined));
};

const decryptText = async (encryptedText: string, key: string): Promise<string> => {
    if (!key) return encryptedText;
    
    try {
        // Convert from base64
        const combined = Uint8Array.from(atob(encryptedText), c => c.charCodeAt(0));
        
        // Extract IV and encrypted data
        const iv = combined.slice(0, 12);
        const encrypted = combined.slice(12);
        
        // Convert key to CryptoKey
        const encoder = new TextEncoder();
        const keyData = encoder.encode(key.padEnd(32, '0').slice(0, 32)); // Pad/truncate to 32 bytes
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            keyData,
            { name: 'AES-GCM' },
            false,
            ['decrypt']
        );

        // Decrypt
        const decrypted = await crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            cryptoKey,
            encrypted
        );

        return new TextDecoder().decode(decrypted);
    } catch (error) {
        console.error('Decryption failed:', error);
        return `[Decryption Failed - Invalid Key?] ${encryptedText}`;
    }
};

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
            const encryptedText = formData.get("encryptedText");
            
            // Use encrypted text if provided, otherwise use plain text
            const textToStore = encryptedText ? encryptedText.toString() : text?.toString();
            
            if (typeof textToStore !== "string" || !textToStore)
                return Response.json({ error: "Invalid text" }, { status: 400 });
            await noteManager.create(textToStore);
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
    const [encryptKey, setEncryptKey] = useState("");
    const [decryptKey, setDecryptKey] = useState("");
    const [decryptedNotes, setDecryptedNotes] = useState<Array<{ id: string; text: string; isEncrypted: boolean }>>([]);
    const [showDecryptAll, setShowDecryptAll] = useState(false);

    // Initialize decrypted notes
    useEffect(() => {
        setDecryptedNotes(notes.map(note => ({
            id: note.id,
            text: note.text,
            isEncrypted: false
        })));
    }, [notes]);

    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
        } catch (err) {
            console.error("Failed to copy:", err);
        }
    };

    const handleEncryptSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);
        const text = formData.get("text") as string;
        
        if (!text) return;
        
        let textToSubmit = text;
        if (encryptKey) {
            try {
                const encrypted = await encryptText(text, encryptKey);
                textToSubmit = encrypted;
            } catch (error) {
                console.error("Encryption failed:", error);
                alert("Encryption failed. Please try again.");
                return;
            }
        }
        
        // Create hidden input with encrypted text
        const hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        hiddenInput.name = 'encryptedText';
        hiddenInput.value = textToSubmit;
        form.appendChild(hiddenInput);
        
        // Submit the form
        form.submit();
    };

    const handleDecryptAll = async () => {
        if (!decryptKey) {
            alert("Please enter a decryption key");
            return;
        }

        const decrypted = await Promise.all(
            notes.map(async (note) => {
                try {
                    const decryptedText = await decryptText(note.text, decryptKey);
                    return {
                        id: note.id,
                        text: decryptedText,
                        isEncrypted: note.text !== decryptedText
                    };
                } catch (error) {
                    return {
                        id: note.id,
                        text: note.text,
                        isEncrypted: false
                    };
                }
            })
        );
        
        setDecryptedNotes(decrypted);
    };

    const handleResetDecrypt = () => {
        setDecryptedNotes(notes.map(note => ({
            id: note.id,
            text: note.text,
            isEncrypted: false
        })));
        setDecryptKey("");
    };

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900 py-8 px-4">
            <div className="max-w-2xl mx-auto">
                <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-8">
                    Notes
                </h1>

                {/* Encrypt Key Field */}
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Encryption Key (Optional - Leave blank for plaintext)
                    </label>
                    <input
                        type="password"
                        value={encryptKey}
                        onChange={(e) => setEncryptKey(e.target.value)}
                        className="w-full rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white shadow-sm px-4 py-2"
                        placeholder="Enter encryption key..."
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Key is never sent to server. Messages encrypted client-side before storage.
                    </p>
                </div>

                {/* Note Creation Form */}
                <Form method="post" onSubmit={handleEncryptSubmit} className="mb-8">
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
                        {encryptKey ? "Encrypt & Add Note" : "Add Note (Plaintext)"}
                    </button>
                </Form>

                {/* Decrypt All Section */}
                <div className="mb-8 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
                            Decrypt All Notes
                        </h2>
                        <button
                            type="button"
                            onClick={() => setShowDecryptAll(!showDecryptAll)}
                            className="text-blue-500 hover:text-blue-700 text-sm"
                        >
                            {showDecryptAll ? "Hide" : "Show"}
                        </button>
                    </div>
                    
                    {showDecryptAll && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Decryption Key
                                </label>
                                <input
                                    type="password"
                                    value={decryptKey}
                                    onChange={(e) => setDecryptKey(e.target.value)}
                                    className="w-full rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white shadow-sm px-4 py-2"
                                    placeholder="Enter decryption key..."
                                />
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    Key is never sent to server. Decryption happens in your browser.
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={handleDecryptAll}
                                    className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 transition"
                                >
                                    Decrypt All
                                </button>
                                <button
                                    type="button"
                                    onClick={handleResetDecrypt}
                                    className="bg-gray-300 dark:bg-gray-700 text-gray-800 dark:text-white px-4 py-2 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-600 transition"
                                >
                                    Reset to Original
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Notes List */}
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
                            {note.isEncrypted && (
                                <div className="mt-2">
                                    <span className="inline-block bg-green-100 text-green-800 text-xs px-2 py-1 rounded">
                                        Decrypted
                                    </span>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}