import { Dashboard } from "../components/dashboard";
import { getTraceStore } from "../lib/store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const traces = await getTraceStore().listTraces();
  return <Dashboard initialTraces={traces} />;
}
