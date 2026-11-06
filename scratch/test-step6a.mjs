async function runStep6aTests() {
  const baseUrl = "http://localhost:3000";
  console.log("=== STARTING STEP 6(a) EVENT FUNDRAISER TEST SUITE ===");

  // 1. Fetch Clubs to get reference club
  const clubsRes = await fetch(`${baseUrl}/api/clubs`);
  const { clubs } = await clubsRes.json();
  if (!clubs || clubs.length === 0) throw new Error("No clubs found in database");
  const club = clubs[0];
  const initialBalance = club.balance;
  console.log(`[PASS] Reference Club: "${club.name}", Current Balance: $${initialBalance}`);

  // 2. Create a new Event Fundraiser
  const campaignGoal = 600.00;
  const campaignTitle = `Robotics Tokyo Expo ${Date.now().toString().slice(-4)}`;
  const createRes = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: campaignTitle,
      description: "Autonomous drone and rover competition budget in Tokyo, Japan.",
      goalAmount: campaignGoal,
      clubId: club.id,
      userEmail: "treasurer@roboticsclub.org",
      userRole: "TREASURER",
    }),
  });
  const createData = await createRes.json();
  if (!createRes.ok || !createData.success) {
    throw new Error(`Failed to create event: ${JSON.stringify(createData)}`);
  }
  const event = createData.event;
  console.log(`[PASS] Created EventFundraiser: "${event.title}" (ID: ${event.id}), Goal: $${event.goalAmount}`);

  // 3. Verify GET /api/events has 0 initial progress
  const initialGetRes = await fetch(`${baseUrl}/api/events`);
  const initialGetData = await initialGetRes.json();
  const foundEvent = initialGetData.events.find((e) => e.id === event.id);
  if (!foundEvent) throw new Error("Newly created event not found in GET /api/events");
  if (foundEvent.totalCollected !== 0 || foundEvent.progressPercent !== 0) {
    throw new Error(`Expected 0 collected and 0% progress, got ${foundEvent.totalCollected}, ${foundEvent.progressPercent}%`);
  }
  console.log(`[PASS] Verified initial progress in code: $0.00 / $${foundEvent.goalAmount} (0.0% funded, $${foundEvent.remaining} remaining)`);

  // 4. Test Contribution via PayPal Order v2 (/donate)
  const donationAmount = 150.00;
  const donorEmail = "robotics-alumni@mit.edu";
  const donateRes = await fetch(`${baseUrl}/api/events/${event.id}/donate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: donationAmount,
      donorEmail,
      donorName: "MIT Alumni Robotics Foundation",
    }),
  });
  const donateData = await donateRes.json();
  if (!donateRes.ok || !donateData.success || !donateData.orderId) {
    throw new Error(`Failed to initiate donation order: ${JSON.stringify(donateData)}`);
  }
  console.log(`[PASS] Generated PayPal Order v2: ${donateData.orderId}, Movement ID: ${donateData.movementId} (PENDING in unified ledger)`);

  // 5. Authoritatively capture the PayPal Order (/capture)
  const captureRes = await fetch(`${baseUrl}/api/events/${event.id}/capture`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orderId: donateData.orderId,
      simulateSandbox: true,
    }),
  });
  const captureData = await captureRes.json();
  if (!captureRes.ok || !captureData.success || captureData.movement.status !== "COMPLETED") {
    throw new Error(`Failed to capture donation order: ${JSON.stringify(captureData)}`);
  }
  console.log(`[PASS] Captured PayPal Order. Movement status transitioned to COMPLETED. In-code Total Collected: $${captureData.totalCollected}`);

  // 6. Test Idempotency on Capture (Second capture call)
  const secondCaptureRes = await fetch(`${baseUrl}/api/events/${event.id}/capture`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orderId: donateData.orderId,
      simulateSandbox: true,
    }),
  });
  const secondCaptureData = await secondCaptureRes.json();
  if (secondCaptureData.alreadyCaptured) {
    console.log("[PASS] Replayed order capture safely detected as alreadyCaptured (idempotent)");
  } else {
    throw new Error(`Idempotency check failed: ${JSON.stringify(secondCaptureData)}`);
  }

  // 7. Verify In-Code Dynamically Computed Progress Bar
  const updatedGetRes = await fetch(`${baseUrl}/api/events`);
  const updatedGetData = await updatedGetRes.json();
  const updatedEvent = updatedGetData.events.find((e) => e.id === event.id);
  const expectedPercent = parseFloat(((donationAmount / campaignGoal) * 100).toFixed(1));
  const expectedRemaining = campaignGoal - donationAmount;

  if (updatedEvent.totalCollected !== donationAmount) {
    throw new Error(`Expected totalCollected $${donationAmount}, got $${updatedEvent.totalCollected}`);
  }
  if (updatedEvent.progressPercent !== expectedPercent) {
    throw new Error(`Expected progress ${expectedPercent}%, got ${updatedEvent.progressPercent}%`);
  }
  if (updatedEvent.remaining !== expectedRemaining) {
    throw new Error(`Expected remaining $${expectedRemaining}, got $${updatedEvent.remaining}`);
  }
  if (updatedEvent.donorCount !== 1) {
    throw new Error(`Expected 1 donor, got ${updatedEvent.donorCount}`);
  }
  console.log(`[PASS] Progress bar in code verified: $${updatedEvent.totalCollected} of $${updatedEvent.goalAmount} (${updatedEvent.progressPercent}% funded, $${updatedEvent.remaining} remaining)`);
  console.log(`[PASS] Recent Donors feed: ${updatedEvent.recentDonors[0].contributor} -> +$${updatedEvent.recentDonors[0].amount}`);

  // 8. Verify Club Balance from Unified Ledger
  const updatedClubRes = await fetch(`${baseUrl}/api/clubs`);
  const updatedClubData = await updatedClubRes.json();
  const updatedClub = updatedClubData.clubs.find((c) => c.id === club.id);
  const expectedBalance = parseFloat((initialBalance + donationAmount).toFixed(2));
  if (updatedClub.balance !== expectedBalance) {
    throw new Error(`Expected club balance $${expectedBalance}, got $${updatedClub.balance}`);
  }
  console.log(`[PASS] Club Vault Balance updated in code: $${initialBalance} + $${donationAmount} = $${updatedClub.balance}`);

  // 9. Verify Append-Only Audit Log
  const ledgerRes = await fetch(`${baseUrl}/api/clubs/${club.id}/ledger`);
  const ledgerData = await ledgerRes.json();
  const fundAudit = ledgerData.auditLogs.find(
    (l) => l.action === "FUNDRAISER_CONTRIBUTION" && l.target === `event:${event.id}`
  );
  if (!fundAudit) {
    throw new Error("Audit log entry for FUNDRAISER_CONTRIBUTION not found");
  }
  console.log(`[PASS] Append-only AuditLog recorded event: [${fundAudit.createdAt}] (${fundAudit.role}) ${fundAudit.who}: ${fundAudit.action} -> ${fundAudit.target}`);

  console.log("=== ALL STEP 6(a) EVENT FUNDRAISER TESTS PASSED! ===");
}

runStep6aTests().catch((err) => {
  console.error("STEP 6(a) TEST FAILED:", err);
  process.exit(1);
});
