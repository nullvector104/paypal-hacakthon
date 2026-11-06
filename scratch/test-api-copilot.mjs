async function testAi() {
  const start = Date.now();
  const res = await fetch("http://localhost:3000/api/ai/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: "consolidate payments for jordan@roboticsclub.org",
      userRole: "TREASURER",
      userEmail: "treasurer@roboticsclub.org"
    })
  });
  const duration = Date.now() - start;
  const data = await res.json();
  console.log(`[Status ${res.status}] in ${duration}ms`);
  console.log("Success:", data.success);
  console.log("Response text:\n", data.responseText);
  console.log("Tool calls:", data.toolCalls);
}

testAi();

