import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { createPerson, listPersons } from "@/lib/persons";
import { requireAuth, requireRole } from "@/lib/auth";

export async function GET() {
  return withErrorHandling(async () => {
    await requireAuth();
    return listPersons();
  });
}

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    await requireRole(["foreman", "developer"]);
    const body = await req.json();
    return createPerson(body.employeeId, body.name);
  });
}
