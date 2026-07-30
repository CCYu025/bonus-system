import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "../../test/reset-db";
import {
  authenticateUser,
  createAccount,
  listAccounts,
  setAccountActive,
  updateDisplayName,
} from "./accounts";
import { prisma } from "./prisma";

afterEach(async () => {
  await resetDb();
});

describe("accounts", () => {
  it("creates an account and authenticates with the right password", async () => {
    await createAccount({
      username: "foreman01",
      password: "pass1234",
      role: "foreman",
      displayName: "王小明",
    });

    const user = await authenticateUser("foreman01", "pass1234");
    expect(user?.displayName).toBe("王小明");
  });

  it("does not authenticate with a wrong password", async () => {
    await createAccount({
      username: "foreman01",
      password: "pass1234",
      role: "foreman",
      displayName: "王小明",
    });

    const user = await authenticateUser("foreman01", "wrong");
    expect(user).toBeNull();
  });

  it("rejects a duplicate username", async () => {
    await createAccount({
      username: "dup",
      password: "x",
      role: "foreman",
      displayName: "A",
    });

    await expect(
      createAccount({
        username: "dup",
        password: "y",
        role: "foreman",
        displayName: "B",
      })
    ).rejects.toThrow();
  });

  // AC-8: deactivating an account must cut off its existing sessions
  // immediately, not just block future logins.
  it("deactivating an account clears its sessions and blocks future auth", async () => {
    const acc = await createAccount({
      username: "foreman02",
      password: "pass1234",
      role: "foreman",
      displayName: "阿明",
    });
    await prisma.session.create({
      data: { userId: acc.id, expiresAt: new Date(Date.now() + 60_000) },
    });

    await setAccountActive(acc.id, false);

    const remainingSessions = await prisma.session.count({
      where: { userId: acc.id },
    });
    expect(remainingSessions).toBe(0);

    const authAfterDeactivate = await authenticateUser("foreman02", "pass1234");
    expect(authAfterDeactivate).toBeNull();
  });

  // AC-12/13: renaming an account must not retroactively rewrite audit log
  // entries already written under the old displayName snapshot.
  it("renaming an account leaves past audit log snapshots untouched", async () => {
    const acc = await createAccount({
      username: "foreman03",
      password: "pass1234",
      role: "foreman",
      displayName: "舊姓名",
    });

    const form = await prisma.attendanceForm.create({
      data: { date: "2026-01-01" },
    });
    await prisma.auditLog.create({
      data: { formId: form.id, action: "created", operatorName: "舊姓名" },
    });

    await updateDisplayName(acc.id, "新姓名");

    const accounts = await listAccounts();
    expect(accounts.find((a) => a.id === acc.id)?.displayName).toBe("新姓名");

    const log = await prisma.auditLog.findFirst({ where: { formId: form.id } });
    expect(log?.operatorName).toBe("舊姓名");
  });
});
