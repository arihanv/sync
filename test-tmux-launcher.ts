#!/usr/bin/env bun

/**
 * Test script to verify tmux-based Claude Code launching
 */

import { launchClaudeForIssue, listActiveSessions, killSession } from "./taskboard/claude-launcher";

async function testTmuxLauncher() {
    console.log("🧪 Testing tmux-based Claude Code launcher...");
    
    try {
        // Use real Linear issue HAR-14 for testing
        const testIssueId = "HAR-14";
        const testIdentifier = "HAR-14";
        
        console.log("1. Launching Claude for test issue...");
        const session = await launchClaudeForIssue(testIssueId, testIdentifier);
        
        console.log("✅ Session created:", {
            issueId: session.issueId,
            identifier: session.linearIdentifier,
            tmuxSession: session.tmuxSession,
            workerNumber: session.workerNumber
        });
        
        console.log("2. Checking active sessions...");
        const activeSessions = listActiveSessions();
        console.log(`📊 Active sessions: ${activeSessions.length}`);
        activeSessions.forEach(s => {
            console.log(`  - ${s.linearIdentifier} in ${s.tmuxSession}`);
        });
        
        console.log("3. Waiting 10 seconds before cleanup...");
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        console.log("4. Killing test session...");
        const killed = await killSession(testIssueId);
        console.log(`🛑 Session killed: ${killed}`);
        
        console.log("✅ Test completed successfully!");
        
    } catch (error) {
        console.error("❌ Test failed:", error);
        process.exit(1);
    }
}

// Run test if called directly
if (import.meta.main) {
    testTmuxLauncher().then(() => {
        console.log("🎉 All tests passed!");
        process.exit(0);
    });
}