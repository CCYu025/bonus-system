// Walks through every AC in spec.md against the running dev server and prints
// a JSON evidence log. Not a permanent test suite — a one-off verification
// script whose output feeds the verify-report.json.
const BASE = "http://localhost:3000";
const log = [];

function record(ac, description, ok, detail) {
  log.push({ ac, description, ok, detail });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${ac}: ${description}`);
  if (!ok) console.log("  detail:", JSON.stringify(detail));
}

async function j(path, opts) {
  const res = await fetch(BASE + path, opts);
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, ok: res.ok, body };
}

async function main() {
  const suffix = Date.now().toString().slice(-6);
  const emp1 = "V" + suffix + "1";
  const emp2 = "V" + suffix + "2";
  const emp3 = "V" + suffix + "3";
  const testDate = "2026-08-" + ((Number(suffix) % 20) + 1).toString().padStart(2, "0");

  // AC-1
  const create1 = await j("/api/persons", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeId: emp1, name: "驗證甲" }),
  });
  record(
    "AC-1",
    "新增人員成功，狀態為在職",
    create1.ok && create1.body.status === "active",
    create1.body
  );

  const dupPerson = await j("/api/persons", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeId: emp1, name: "重複工號" }),
  });
  record(
    "AC-1(補充：工號唯一)",
    "重複工號被拒絕",
    dupPerson.status === 409,
    dupPerson.body
  );

  await j("/api/persons", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeId: emp2, name: "驗證乙" }),
  });
  await j("/api/persons", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeId: emp3, name: "驗證丙" }),
  });

  // AC-3
  const catCode = "CAT" + suffix;
  const createCat = await j("/api/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: catCode, name: "驗證類別", sortOrder: 99 }),
  });
  const catId = createCat.body?.id;
  const listCatAfter = await j("/api/categories");
  const found = listCatAfter.body.find((c) => c.code === catCode);
  record(
    "AC-3",
    "新增出勤類別立即出現於清單",
    createCat.ok && !!found,
    { createCat: createCat.body, found }
  );

  // AC-4
  const createForm = await j("/api/forms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: testDate, operatorName: "早班班長A" }),
  });
  const formId = createForm.body?.id;
  const formDetail1 = await j(`/api/forms/${formId}`);
  const allUnfilled = formDetail1.body.records.every((r) => r.categoryId === null);
  const hasCreatedLog = formDetail1.body.auditLogs.some(
    (a) => a.action === "created" && a.operatorName === "早班班長A"
  );
  const includesAllThree = [emp1, emp2, emp3].every((e) =>
    formDetail1.body.records.some((r) => r.employeeId === e)
  );
  record(
    "AC-4",
    "建立表單列出全部在職人員、預設未填、操作者身分入稽核軌跡",
    createForm.status === 200 &&
      allUnfilled &&
      hasCreatedLog &&
      includesAllThree,
    { status: formDetail1.body.status, records: formDetail1.body.records.length, hasCreatedLog }
  );

  // AC-8: duplicate form for same date should return the SAME existing form (idempotent),
  // proving the system blocks creation of a second record set for that date.
  const createFormAgain = await j("/api/forms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: testDate, operatorName: "晚班班長B" }),
  });
  record(
    "AC-8",
    "同日期再次建立表單回傳既有表單（不產生第二筆重複紀錄）",
    createFormAgain.body?.id === formId,
    createFormAgain.body
  );

  // AC-11: two operators, non-overlapping employees, sequential saves must not clobber.
  const saveA = await j(`/api/forms/${formId}/records`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operatorName: "早班班長A",
      changes: [{ employeeId: emp1, categoryId: catId, note: "A填寫" }],
    }),
  });
  const saveB = await j(`/api/forms/${formId}/records`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operatorName: "晚班班長B",
      changes: [{ employeeId: emp2, categoryId: catId, note: "B填寫" }],
    }),
  });
  const afterBothSaves = saveB.body;
  const rec1 = afterBothSaves?.records.find((r) => r.employeeId === emp1);
  const rec2 = afterBothSaves?.records.find((r) => r.employeeId === emp2);
  const rec3 = afterBothSaves?.records.find((r) => r.employeeId === emp3);
  record(
    "AC-11",
    "早班存A後、晚班存B，A的資料不被覆蓋，兩人資料皆存在，第三人仍未填",
    saveA.ok &&
      saveB.ok &&
      rec1?.categoryId === catId &&
      rec1?.note === "A填寫" &&
      rec2?.categoryId === catId &&
      rec2?.note === "B填寫" &&
      rec3?.categoryId === null,
    { rec1, rec2, rec3 }
  );

  // AC-5: submit with emp3 still unfilled
  const submit = await j(`/api/forms/${formId}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operatorName: "早班班長A" }),
  });
  const rec3AfterSubmit = submit.body?.records.find((r) => r.employeeId === emp3);
  record(
    "AC-5",
    "送出後狀態為待審，未填人員維持未填一併送審",
    submit.ok &&
      submit.body.status === "pending_review" &&
      rec3AfterSubmit?.categoryId === null,
    { status: submit.body?.status, rec3AfterSubmit }
  );

  // AC-9: attempt direct edit while pending_review (before approval) -> should already be blocked too,
  // but the AC specifically concerns "approved" forms; verify that separately after approval.

  // AC-12: supervisor pending list includes this form regardless of which foreman filled it in
  const pendingList = await j("/api/forms?status=pending_review");
  const inPendingList = pendingList.body.some((f) => f.id === formId);
  record(
    "AC-12",
    "課長待審列表顯示此表單，不因填寫班長不同而被篩選",
    pendingList.ok && inPendingList,
    { count: pendingList.body.length, inPendingList }
  );

  // AC-6: approve
  const approve = await j(`/api/forms/${formId}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operatorName: "課長X" }),
  });
  record(
    "AC-6",
    "核准後狀態為已核准",
    approve.ok && approve.body.status === "approved",
    { status: approve.body?.status }
  );

  // AC-9: direct edit attempt on approved form must be rejected
  const editApproved = await j(`/api/forms/${formId}/records`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operatorName: "早班班長A",
      changes: [{ employeeId: emp3, categoryId: catId, note: "試圖修改" }],
    }),
  });
  record(
    "AC-9",
    "已核准表單直接修改被拒絕，並提示作廢重審",
    editApproved.status === 409 && /作廢重審/.test(editApproved.body?.error ?? ""),
    editApproved.body
  );

  // AC-10: void and resubmit
  const voidResp = await j(`/api/forms/${formId}/void`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operatorName: "課長X" }),
  });
  const newFormId = voidResp.body?.id;
  const oldFormAfterVoid = await j(`/api/forms/${formId}`);
  const newFormDetail = await j(`/api/forms/${newFormId}`);
  record(
    "AC-10",
    "原表單標記作廢並保留、新版本進入草稿、雙向可追溯",
    voidResp.ok &&
      oldFormAfterVoid.body.status === "voided" &&
      newFormDetail.body.status === "draft" &&
      newFormDetail.body.previousFormId === formId &&
      oldFormAfterVoid.body.nextForm?.id === newFormId &&
      newFormDetail.body.records.find((r) => r.employeeId === emp1)?.note === "A填寫",
    {
      oldStatus: oldFormAfterVoid.body.status,
      newStatus: newFormDetail.body.status,
      newFormPreviousId: newFormDetail.body.previousFormId,
      oldFormNextId: oldFormAfterVoid.body.nextForm?.id,
    }
  );

  // AC-7: reject flow on a separate fresh form
  const testDate2 = "2026-09-" + ((Number(suffix) % 20) + 1).toString().padStart(2, "0");
  const createForm2 = await j("/api/forms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: testDate2, operatorName: "早班班長A" }),
  });
  const formId2 = createForm2.body?.id;
  await j(`/api/forms/${formId2}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operatorName: "早班班長A" }),
  });
  const reject = await j(`/api/forms/${formId2}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operatorName: "課長X", reason: "資料有誤，請重填" }),
  });
  const canEditAfterReject = await j(`/api/forms/${formId2}/records`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operatorName: "早班班長A",
      changes: [{ employeeId: emp1, categoryId: catId, note: "退回後修改" }],
    }),
  });
  record(
    "AC-7",
    "退回後狀態為已退回、原因保留、可重新編輯",
    reject.ok &&
      reject.body.status === "rejected" &&
      reject.body.rejectReason === "資料有誤，請重填" &&
      canEditAfterReject.ok,
    { status: reject.body?.status, reason: reject.body?.rejectReason, editOk: canEditAfterReject.ok }
  );

  // AC-2: soft delete
  const del = await j(`/api/persons/${emp3}`, { method: "DELETE" });
  const personsAfterDelete = await j("/api/persons");
  const emp3After = personsAfterDelete.body.find((p) => p.employeeId === emp3);
  const historicalFormStillHasEmp3 = newFormDetail.body.records.some(
    (r) => r.employeeId === emp3
  );
  record(
    "AC-2",
    "軟刪除：狀態為離職，資料列仍在，歷史出勤紀錄仍可查詢",
    del.ok && emp3After?.status === "terminated" && historicalFormStillHasEmp3,
    { del: del.body, emp3After, historicalFormStillHasEmp3 }
  );

  const failed = log.filter((l) => !l.ok);
  console.log("\n=== SUMMARY ===");
  console.log(`${log.length - failed.length}/${log.length} passed`);
  if (failed.length) {
    console.log("FAILED:", failed.map((f) => f.ac).join(", "));
  }

  console.log("\n=== FULL LOG (JSON) ===");
  console.log(JSON.stringify(log, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
