import { calculateEqualSplit } from "../lib/split-math";

async function runStep6bTests() {
  const baseUrl = "http://localhost:3000";
  console.log("=== STARTING STEP 6(b) BILL SPLITTING TEST SUITE ===");

  // 1. Unit Tests for In-Code Split Math & Penny Reconciliation
  console.log("Testing pure mathematical split with exact penny distribution...");

  // Case A: $100 across 3 participants (1 remainder cent)
  const mathA = calculateEqualSplit({
    totalAmount: 100.0,
    memberEmails: ["jordan@roboticsclub.org", "sam@roboticsclub.org"],
    includeCreator: true,
    creatorEmail: "treasurer@roboticsclub.org",
  });
  if (!mathA.reconciled || mathA.allocatedTotal !== 100.0) {
    throw new Error(`Math A failed: allocated ${mathA.allocatedTotal} vs expected 100.00`);
  }
  if (mathA.shares[0].amount !== 33.34 || mathA.shares[1].amount !== 33.33 || mathA.shares[2].amount !== 33.33) {
    throw new Error(`Penny reconciliation unexpected in Math A: ${JSON.stringify(mathA.shares)}`);
  }
  console.log("[PASS] Math Case A ($100 / 3): $33.34 + $33.33 + $33.33 = $100.00 exact (penny preserved)");

  // Case B: $10.01 across 3 participants (2 remainder cents)
  const mathB = calculateEqualSplit({
    totalAmount: 10.01,
    memberEmails: ["alice@test.com", "bob@test.com"],
    includeCreator: true,
    creatorEmail: "charlie@test.com",
  });
  if (!mathB.reconciled || mathB.allocatedTotal !== 10.01) {
    throw new Error(`Math B failed: allocated ${mathB.allocatedTotal} vs expected 10.01`);
  }
  if (mathB.shares[0].amount !== 3.34 || mathB.shares[1].amount !== 3.34 || mathB.shares[2].amount !== 3.33) {
    throw new Error(`Penny reconciliation unexpected in Math B: ${JSON.stringify(mathB.shares)}`);
  }
  console.log("[PASS] Math Case B ($10.01 / 3): $3.34 + $3.34 + $3.33 = $10.01 exact");

  // 2. Test POST /api/splits Endpoint
  const clubsRes = await fetch(`${baseUrl}/api/clubs`);
  const { clubs } = await clubsRes.json();
  const clubId = clubs[0].id;

  const billTotal = 125.50;
  const billTitle = `Autonomous Team Dinner ${Date.now().toString().slice(-4)}`;
  const createRes = await fetch(`${baseUrl}/api/splits`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: billTitle,
      totalAmount: billTotal,
      memberEmails: ["jordan@roboticsclub.org", "sam@roboticsclub.org"],
      includeCreator: true,
      creatorEmail: "treasurer@roboticsclub.org",
      clubId,
    }),
  });
  const createData = await createRes.json();
  if (!createRes.ok || !createData.success) {
    throw new Error(`Failed to create bill split: ${JSON.stringify(createData)}`);
  }
  const split = createData.split;
  console.log(`[PASS] Created BillSplit: "${split.title}" (ID: ${split.id}) for Total $${split.totalAmount}`);
  console.log(`[PASS] Issued ${createData.requestsCreated} Invoicing requests in unified ledger:`);
  for (const m of createData.movements) {
    console.log(`   - Payer: ${m.counterparty} -> Amount: $${m.amount}, Invoice: ${m.paypalRefId}, Status: ${m.status}`);
  }

  // 3. Test GET /api/splits In-Code Progress Evaluation
  const getRes = await fetch(`${baseUrl}/api/splits`);
  const getData = await getRes.json();
  const foundSplit = getData.splits.find((s) => s.id === split.id);
  if (!foundSplit) throw new Error("Newly created split not found in GET /api/splits");
  if (foundSplit.collected !== 0 || foundSplit.progressPercent !== 0 || foundSplit.isFullySettled) {
    throw new Error(`Expected 0 collected and 0% progress, got ${foundSplit.collected}, ${foundSplit.progressPercent}%`);
  }
  console.log(`[PASS] Initial Split Progress: $${foundSplit.collected} / $${foundSplit.totalRequested} (0% settled, ${foundSplit.paidCount}/${foundSplit.requestsCount} paid)`);

  // 4. Test Settle One Request
  const targetMovement = foundSplit.memberStatuses[0];
  const settleRes = await fetch(`${baseUrl}/api/splits/${split.id}/settle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ movementId: targetMovement.movementId }),
  });
  const settleData = await settleRes.json();
  if (!settleRes.ok || !settleData.success || settleData.movement.status !== "COMPLETED") {
    throw new Error(`Failed to settle split request: ${JSON.stringify(settleData)}`);
  }
  console.log(`[PASS] Settled payment for ${targetMovement.memberEmail} ($${targetMovement.amount}). Updated progress: ${settleData.progressPercent}%`);

  // 5. Test Settle Second Request (Full Settlement)
  const secondMovement = foundSplit.memberStatuses[1];
  const settle2Res = await fetch(`${baseUrl}/api/splits/${split.id}/settle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ movementId: secondMovement.movementId }),
  });
  const settle2Data = await settle2Res.json();
  if (!settle2Res.ok || !settle2Data.success || !settle2Data.isFullySettled) {
    throw new Error(`Expected isFullySettled: true, got: ${JSON.stringify(settle2Data)}`);
  }
  console.log(`[PASS] Settled second payment for ${secondMovement.memberEmail}. Split is now 100% Fully Settled!`);

  // 6. Verify GET /api/splits reflects Full Settlement
  const finalGetRes = await fetch(`${baseUrl}/api/splits`);
  const finalGetData = await finalGetRes.json();
  const finalSplit = finalGetData.splits.find((s) => s.id === split.id);
  if (!finalSplit.isFullySettled || finalSplit.progressPercent !== 100 || finalSplit.paidCount !== 2) {
    throw new Error(`Expected fully settled split, got: ${JSON.stringify(finalSplit)}`);
  }
  console.log(`[PASS] Final Split state verified in code: isFullySettled = true, ${finalSplit.paidCount}/${finalSplit.requestsCount} paid, Collected = $${finalSplit.collected}`);

  // 7. Verify Append-Only Audit Log
  const ledgerRes = await fetch(`${baseUrl}/api/clubs/${clubId}/ledger`);
  const ledgerData = await ledgerRes.json();
  const splitAudit = ledgerData.auditLogs.find(
    (l) => l.action === "BILL_SPLIT_CREATED" && l.target === `split:${split.id}`
  );
  if (!splitAudit) throw new Error("Audit log for BILL_SPLIT_CREATED not found");
  console.log(`[PASS] Append-only AuditLog verified: [${splitAudit.createdAt}] (${splitAudit.role}) ${splitAudit.who}: ${splitAudit.action} -> ${splitAudit.target}`);

  console.log("=== ALL STEP 6(b) BILL SPLITTING TESTS PASSED SUCCESSFULLY! ===");
}

runStep6bTests().catch((err) => {
  console.error("STEP 6(b) TEST FAILED:", err);
  process.exit(1);
});
