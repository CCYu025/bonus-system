import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { createPerson, listPersons } from "@/lib/persons";

export async function GET() {
  return withErrorHandling(() => listPersons());
}

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const body = await req.json();
    return createPerson(body.employeeId, body.name);
  });
}
