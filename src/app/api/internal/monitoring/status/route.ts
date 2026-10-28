import { handleMonitoringStatus } from "@/lib/automation-monitoring";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  return handleMonitoringStatus(request);
}
