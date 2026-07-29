import { withErrorHandling } from "@/lib/api-handler";
import { softDeletePerson } from "@/lib/persons";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  return withErrorHandling(async () => {
    const { employeeId } = await params;
    return softDeletePerson(employeeId);
  });
}
