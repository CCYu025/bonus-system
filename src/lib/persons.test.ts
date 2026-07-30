import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "../../test/reset-db";
import { createPerson, listPersons, softDeletePerson } from "./persons";

afterEach(async () => {
  await resetDb();
});

describe("persons", () => {
  it("creates a person and lists it back", async () => {
    await createPerson("E001", "王小明");

    const persons = await listPersons();
    expect(persons.map((p) => p.employeeId)).toContain("E001");
  });

  it("rejects a duplicate employeeId", async () => {
    await createPerson("E001", "王小明");

    await expect(createPerson("E001", "另一人")).rejects.toMatchObject({ status: 409 });
  });

  it("rejects a missing employeeId or name", async () => {
    await expect(createPerson("", "王小明")).rejects.toMatchObject({ status: 400 });
    await expect(createPerson("E001", "  ")).rejects.toMatchObject({ status: 400 });
  });

  // AC-2: soft delete keeps the row and history, just flips status
  it("soft-deletes by flipping status to terminated instead of removing the row", async () => {
    await createPerson("E001", "王小明");

    const deleted = await softDeletePerson("E001");
    expect(deleted.status).toBe("terminated");

    const stillListed = await listPersons();
    expect(stillListed.find((p) => p.employeeId === "E001")).toBeDefined();
  });

  it("rejects soft-deleting a person that does not exist", async () => {
    await expect(softDeletePerson("missing")).rejects.toMatchObject({ status: 404 });
  });
});
