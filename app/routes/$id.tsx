import {
    type LoaderFunctionArgs,
    type ActionFunctionArgs,
} from "@remix-run/cloudflare";
import { useLoaderData, Form } from "@remix-run/react";
import { TodoManager } from "~/to-do-manager";

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
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}