#!/usr/bin/env bun

/**
 * Claude Task Launcher - Launches Claude Code instances for Linear issues
 * Can be used as a standalone script or imported by the webhook server
 */

import { launchClaudeForIssue, listActiveSessions, killSession, getSessionStatus } from "./taskboard/claude-launcher";
import { checkTaskDependencies, addCommentToIssue } from "./taskboard/utils";

interface LaunchOptions {
    issueId: string;
    identifier: string;
    skipDependencyCheck?: boolean;
}

/**
 * Main launcher function that handles dependency checking and session management
 */
async function launchClaudeTask(options: LaunchOptions): Promise<boolean> {
    const { issueId, identifier, skipDependencyCheck = false } = options;
    
    console.log(`🚀 Initiating Claude launch for ${identifier}...`);
    
    try {
        // Check if Claude session already exists
        const existingSession = getSessionStatus(issueId);
        if (existingSession && existingSession.status === 'running') {
            await addCommentToIssue(issueId, "🔄 Claude Code is already working on this issue");
            console.log(`Session already exists for ${identifier}`);
            return false;
        }
        
        // Check dependencies unless explicitly skipped
        if (!skipDependencyCheck) {
            console.log(`📋 Checking dependencies for ${identifier}...`);
            const dependencyStatus = await checkTaskDependencies(issueId);
            
            if (dependencyStatus.isBlocked) {
                const blockingTasksInfo = dependencyStatus.blockingTasks
                    .map(task => `${task.identifier} (${task.state})`)
                    .join(', ');
                
                await addCommentToIssue(issueId, 
                    `⏸️ Issue is blocked by: ${blockingTasksInfo}. Will execute when unblocked.`);
                console.log(`Issue ${identifier} is blocked by: ${blockingTasksInfo}`);
                return false;
            }
        }
        
        // Launch Claude Code for this issue
        await addCommentToIssue(issueId, "🚀 Launching Claude Code to work on this issue...");
        const session = await launchClaudeForIssue(issueId, identifier);
        
        console.log(`✅ Successfully launched Claude for ${identifier} in ${session.tmuxSession}`);
        return true;
        
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`❌ Failed to launch Claude for ${identifier}:`, errorMessage);
        await addCommentToIssue(issueId, `❌ Failed to launch Claude Code: ${errorMessage}`);
        return false;
    }
}

/**
 * Lists current active sessions with detailed status
 */
function listCurrentSessions(): void {
    const activeSessions = listActiveSessions();
    
    console.log(`\n📊 Active Claude Sessions: ${activeSessions.length}`);
    if (activeSessions.length === 0) {
        console.log("  No active sessions");
        return;
    }
    
    activeSessions.forEach(session => {
        const runtime = Math.floor((Date.now() - session.startedAt.getTime()) / 1000);
        console.log(`  - ${session.linearIdentifier}:`);
        console.log(`    tmux: ${session.tmuxSession}`);
        console.log(`    worker: ${session.workerNumber}`);
        console.log(`    runtime: ${runtime}s`);
        console.log(`    status: ${session.status}`);
    });
}

/**
 * Kill a specific session by identifier or issue ID
 */
async function killSessionByIdentifier(identifierOrIssueId: string): Promise<boolean> {
    const activeSessions = listActiveSessions();
    
    // Find session by identifier or issueId
    const session = activeSessions.find(s => 
        s.linearIdentifier === identifierOrIssueId || s.issueId === identifierOrIssueId
    );
    
    if (!session) {
        console.log(`❌ No active session found for: ${identifierOrIssueId}`);
        return false;
    }
    
    console.log(`🛑 Killing session for ${session.linearIdentifier}...`);
    const killed = await killSession(session.issueId);
    
    if (killed) {
        console.log(`✅ Session killed successfully`);
    } else {
        console.log(`❌ Failed to kill session`);
    }
    
    return killed;
}

/**
 * Command line interface for the launcher
 */
async function handleCliCommand(): Promise<void> {
    const args = process.argv.slice(2);
    const command = args[0];
    
    switch (command) {
        case 'launch':
        case 'run': {
            const issueId = args[1];
            const identifier = args[2] || issueId;
            
            if (!issueId) {
                console.error("❌ Usage: bun test-tmux-launcher.ts launch <issueId> [identifier]");
                process.exit(1);
            }
            
            const success = await launchClaudeTask({
                issueId,
                identifier: identifier || issueId,
                skipDependencyCheck: args.includes('--skip-deps')
            });
            
            process.exit(success ? 0 : 1);
            break;
        }
        
        case 'list':
        case 'status':
            listCurrentSessions();
            break;
            
        case 'kill': {
            const target = args[1];
            if (!target) {
                console.error("❌ Usage: bun test-tmux-launcher.ts kill <identifier|issueId>");
                process.exit(1);
            }
            
            const killed = await killSessionByIdentifier(target);
            process.exit(killed ? 0 : 1);
            break;
        }
        
        case 'test': {
            console.log("🧪 Running launcher test...");
            
            // Use real Linear issue for testing
            const testIssueId = args[1] || "HAR-14";
            const testIdentifier = args[2] || "HAR-14";
            
            console.log("1. Launching Claude for test issue...");
            const success = await launchClaudeTask({
                issueId: testIssueId,
                identifier: testIdentifier,
                skipDependencyCheck: true
            });
            
            if (!success) {
                console.error("❌ Test failed - launch unsuccessful");
                process.exit(1);
            }
            
            console.log("2. Checking active sessions...");
            listCurrentSessions();
            
            console.log("3. Waiting 10 seconds before cleanup...");
            await new Promise(resolve => setTimeout(resolve, 10000));
            
            console.log("4. Killing test session...");
            const killed = await killSessionByIdentifier(testIssueId);
            
            if (killed) {
                console.log("✅ Test completed successfully!");
                process.exit(0);
            } else {
                console.error("❌ Test failed - cleanup unsuccessful");
                process.exit(1);
            }
            break;
        }
        
        default:
            console.log(`
🚀 Claude Task Launcher

Usage:
  bun test-tmux-launcher.ts launch <issueId> [identifier] [--skip-deps]
  bun test-tmux-launcher.ts list
  bun test-tmux-launcher.ts kill <identifier|issueId>
  bun test-tmux-launcher.ts test [issueId] [identifier]

Commands:
  launch    Launch Claude Code for a Linear issue (local mode)
  list      List active Claude sessions  
  kill      Kill a specific Claude session
  test      Run a test launch and cleanup

Options:
  --skip-deps    Skip dependency checking

Examples:
  bun test-tmux-launcher.ts launch HAR-14
  bun test-tmux-launcher.ts list
  bun test-tmux-launcher.ts kill HAR-14
  bun test-tmux-launcher.ts test
            `);
            break;
    }
}

// Export functions for use by webhook server
export { launchClaudeTask, listCurrentSessions, killSessionByIdentifier };

// Run CLI if called directly
if (import.meta.main) {
    handleCliCommand().catch(error => {
        console.error("❌ Command failed:", error);
        process.exit(1);
    });
}