import { redirect } from "@remix-run/react";

export const loader = () => {
	return redirect("/0");
};

export default function Index() {
	return <div>'Whatever you put here will not be shown'</div>;
}
