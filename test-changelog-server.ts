/**
 * Test script for changelog sharing server endpoints
 * Tests /changelog and /changelog.html endpoints
 */

const TEST_SERVER_URL = "http://localhost:3000";

async function testChangelogEndpoints() {
  console.log("Testing changelog sharing endpoints...");
  
  try {
    // Test markdown endpoint
    console.log("\n1. Testing /changelog (markdown)");
    const markdownResponse = await fetch(`${TEST_SERVER_URL}/changelog`);
    
    if (markdownResponse.ok) {
      const content = await markdownResponse.text();
      console.log(`✅ Markdown endpoint works - Content length: ${content.length} chars`);
      console.log(`Content-Type: ${markdownResponse.headers.get('content-type')}`);
    } else {
      console.log(`❌ Markdown endpoint failed: ${markdownResponse.status}`);
    }

    // Test HTML endpoint  
    console.log("\n2. Testing /changelog.html");
    const htmlResponse = await fetch(`${TEST_SERVER_URL}/changelog.html`);
    
    if (htmlResponse.ok) {
      const content = await htmlResponse.text();
      console.log(`✅ HTML endpoint works - Content length: ${content.length} chars`);
      console.log(`Content-Type: ${htmlResponse.headers.get('content-type')}`);
      
      if (content.includes("<h1>") && content.includes("</html>")) {
        console.log("✅ HTML content appears properly formatted");
      } else {
        console.log("⚠️ HTML content may not be properly formatted");
      }
    } else {
      console.log(`❌ HTML endpoint failed: ${htmlResponse.status}`);
    }

    console.log("\n✅ Changelog sharing server tests completed");
    
  } catch (error) {
    console.error("❌ Test failed:", error);
    console.log("Make sure the server is running: bun taskboard/server.ts");
  }
}

if (import.meta.main) {
  testChangelogEndpoints();
}