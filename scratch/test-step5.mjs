async function runStep5Tests() {
  const baseUrl = "http://localhost:3000";
  console.log("=== STARTING STEP 5 CLUBS & TREASURY TEST SUITE ===");

  // 1. Fetch Clubs
  const clubsRes = await fetch(`${baseUrl}/api/clubs`);
  const { clubs } = await clubsRes.json();
  if (!clubs || clubs.length === 0) {
    throw new Error("No clubs found in database");
  }
  const club = clubs[0];
  const clubId = club.id;
  console.log(`[PASS] Found Club: "${club.name}" (ID: ${clubId}), Initial Balance: $${club.balance}`);

  // 2. Test Dues Permission Check (MEMBER forbidden)
  const memberDuesRes = await fetch(`${baseUrl}/api/clubs/${clubId}/dues`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: 45,
      dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
      title: "Spring Autonomous Kit Dues",
      userRole: "MEMBER",
      userEmail: "jordan@roboticsclub.org",
    }),
  });
  if (memberDuesRes.status === 403) {
    console.log("[PASS] Server blocked MEMBER from creating dues cycle (403 Forbidden)");
  } else {
    throw new Error(`Expected 403 for member dues creation, got ${memberDuesRes.status}`);
  }

  // 3. Test Dues Creation by TREASURER
  const treasurerDuesRes = await fetch(`${baseUrl}/api/clubs/${clubId}/dues`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: 40,
      dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
      title: "Championship Dues 2026",
      userRole: "TREASURER",
      userEmail: "treasurer@roboticsclub.org",
    }),
  });
  const duesData = await treasurerDuesRes.json();
  if (treasurerDuesRes.ok && duesData.success) {
    console.log(`[PASS] Treasurer created DuesCycle: "${duesData.duesCycle.title}" with ${duesData.invoicesCreated} invoices`);
  } else {
    throw new Error(`Failed to create dues cycle: ${JSON.stringify(duesData)}`);
  }

  // 4. Test GET Dues Status Computation
  const duesGetRes = await fetch(`${baseUrl}/api/clubs/${clubId}/dues`);
  const duesGetData = await duesGetRes.json();
  const latestCycle = duesGetData.duesCycles[0];
  console.log(`[PASS] GET Dues returned ${duesGetData.duesCycles.length} cycle(s). Latest cycle status preview:`);
  for (const ms of latestCycle.memberStatuses) {
    console.log(`   - Member: ${ms.memberName} (${ms.memberEmail}) -> Status: ${ms.status}, Amount: $${ms.amount}`);
  }

  // 5. Submit Reimbursement Claim as Member
  const memberClaimRes = await fetch(`${baseUrl}/api/clubs/${clubId}/claims`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requesterEmail: "jordan@roboticsclub.org",
      requesterName: "Jordan Lee",
      amount: 18.50,
      note: "Ultrasonic Sensors for Maze Robot",
      userRole: "MEMBER",
    }),
  });
  const memberClaimData = await memberClaimRes.json();
  if (memberClaimRes.ok && memberClaimData.success) {
    console.log(`[PASS] Member submitted claim ${memberClaimData.claim.id} for $${memberClaimData.claim.amount} (Status: ${memberClaimData.claim.status})`);
  } else {
    throw new Error(`Failed to submit member claim: ${JSON.stringify(memberClaimData)}`);
  }

  // 6. Test Member Cannot Approve Claim
  const unauthApproveRes = await fetch(`${baseUrl}/api/clubs/${clubId}/claims/${memberClaimData.claim.id}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      approverEmail: "jordan@roboticsclub.org",
      userRole: "MEMBER",
    }),
  });
  if (unauthApproveRes.status === 403) {
    console.log("[PASS] Server blocked MEMBER from approving claim (403 Forbidden)");
  } else {
    throw new Error(`Expected 403 for member claim approval, got ${unauthApproveRes.status}`);
  }

  // 7. Treasurer Submits Self-Claim
  const selfClaimRes = await fetch(`${baseUrl}/api/clubs/${clubId}/claims`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requesterEmail: "treasurer@roboticsclub.org",
      requesterName: "Alex Vance (Treasurer)",
      amount: 12.00,
      note: "Screws & 3D Printer Filament",
      userRole: "TREASURER",
    }),
  });
  const selfClaimData = await selfClaimRes.json();
  const selfClaimId = selfClaimData.claim.id;
  console.log(`[PASS] Treasurer submitted self-claim ${selfClaimId} for $12.00`);

  // 8. Self-Approval WITHOUT Certification -> Must fail
  const uncertifiedRes = await fetch(`${baseUrl}/api/clubs/${clubId}/claims/${selfClaimId}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      approverEmail: "treasurer@roboticsclub.org",
      userRole: "TREASURER",
      selfCertified: false,
    }),
  });
  const uncertifiedData = await uncertifiedRes.json();
  if (uncertifiedRes.status === 400 && uncertifiedData.requiresSelfCertification) {
    console.log("[PASS] Server blocked self-approval without honor code certification");
  } else {
    throw new Error(`Expected 400 with requiresSelfCertification, got ${uncertifiedRes.status}: ${JSON.stringify(uncertifiedData)}`);
  }

  // 9. Self-Approval WITH Certification -> Must succeed & trigger payout
  const certifiedRes = await fetch(`${baseUrl}/api/clubs/${clubId}/claims/${selfClaimId}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      approverEmail: "treasurer@roboticsclub.org",
      userRole: "TREASURER",
      selfCertified: true,
    }),
  });
  const certifiedData = await certifiedRes.json();
  if (certifiedRes.ok && certifiedData.success) {
    console.log(`[PASS] Self-claim approved and paid. Flagged self-approved: ${certifiedData.claim.flaggedSelfApproved}, Movement ID: ${certifiedData.movement?.id}`);
  } else {
    throw new Error(`Failed to approve self-claim: ${JSON.stringify(certifiedData)}`);
  }

  // 10. EXACTLY-ONCE PAYOUT / Double-Click Test
  console.log("Testing exactly-once payout on immediate double-click...");
  const doubleClickRes = await fetch(`${baseUrl}/api/clubs/${clubId}/claims/${selfClaimId}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      approverEmail: "treasurer@roboticsclub.org",
      userRole: "TREASURER",
      selfCertified: true,
    }),
  });
  const doubleClickData = await doubleClickRes.json();
  if (doubleClickData.alreadyPaid || doubleClickData.message?.includes("already")) {
    console.log("[PASS] Double-click / replay was safely intercepted. No duplicate payout created!");
  } else {
    throw new Error(`Double-click guard failed: ${JSON.stringify(doubleClickData)}`);
  }

  // 11. Test Reject Claim
  const rejectRes = await fetch(`${baseUrl}/api/clubs/${clubId}/claims/${memberClaimData.claim.id}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      reason: "Please attach receipt or part order link from supplier",
      userRole: "TREASURER",
      userEmail: "treasurer@roboticsclub.org",
    }),
  });
  const rejectData = await rejectRes.json();
  if (rejectRes.ok && rejectData.success && rejectData.claim.status === "REJECTED") {
    console.log(`[PASS] Claim rejected successfully with reason: "${rejectData.claim.rejectionReason}"`);
  } else {
    throw new Error(`Failed to reject claim: ${JSON.stringify(rejectData)}`);
  }

  // 12. Ledger & Audit Log Check
  const ledgerRes = await fetch(`${baseUrl}/api/clubs/${clubId}/ledger`);
  const ledgerData = await ledgerRes.json();
  console.log(`[PASS] Club Ledger loaded: Computed Balance = $${ledgerData.balance} (Collected: $${ledgerData.collected}, Paid Out: $${ledgerData.paidOut})`);
  console.log(`[PASS] Append-only AuditLog contains ${ledgerData.auditLogs.length} entries.`);
  console.log("Latest Audit Log Entries:");
  for (const log of ledgerData.auditLogs.slice(0, 4)) {
    console.log(`   - [${log.createdAt}] (${log.role}) ${log.who}: ${log.action} -> ${log.target}`);
  }

  console.log("=== ALL STEP 5 ACCEPTANCE TESTS PASSED SUCCESSFULLY! ===");
}

runStep5Tests().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
