import { withErrorHandling } from "@/lib/api-handler";
import { softDeletePerson } from "@/lib/persons";
import { requireRole } from "@/lib/auth";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  return withErrorHandling(async () => {
    await requireRole(["foreman", "developer"]);
    const { employeeId } = await params;
    return softDeletePerson(employeeId);
  });
}
