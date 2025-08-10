#!/usr/bin/env bun

/**
 * Claude Code Launcher - Spawns Claude Code instances to execute Linear issues
 */

import { spawn } from "bun";
import { linearClient, attachToClaudeWorkerLocal } from "./utils";

interface ClaudeSession {
    issueId: string;
    linearIdentifier: string;
    process?: any;
    startedAt: Date;
    status: 'running' | 'completed' | 'failed';
    output: string[];
    tmuxSession?: string;
    workerNumber?: number;
}

// Active Claude sessions
const activeSessions = new Map<string, ClaudeSession>();

// Simple worker counter that increments for each new task
let nextWorkerNumber = 1;

/**
 * Gets the next worker number (simple incrementing counter)
 */
function getNextWorkerNumber(): number {
    return nextWorkerNumber++;
}

/**
 * Creates a new tmux session for Claude worker
 */
async function createTmuxWorkerSession(workerNum: number): Promise<void> {
    try {
        const sessionName = `claude-worker-${workerNum}`;
        
        const proc = spawn([
            'tmux', 'new-session', '-d', '-s', sessionName,
            '-c', '/Users/akshgarg/Documents/sync'
        ], {
            stdout: 'pipe',
            stderr: 'pipe'
        });
        
        await proc.exited;
        console.log(`Created tmux worker session: ${sessionName}`);
    } catch (error) {
        console.error(`Error creating tmux worker session ${workerNum}:`, error);
        throw error;
    }
}

/**
 * Generates a prompt for Claude Code based on a Linear issue
 */
async function generatePromptFromIssue(issueId: string): Promise<string> {
    try {
        const issue = await linearClient.issue(issueId);
        const issueData = await issue;
        
        // Build context-rich prompt
        const prompt = `
You are executing a Linear issue autonomously. You have full permission to read, write, and edit files, and run git/bun commands.

Issue: ${issueData.identifier} - ${issueData.title}
Description: ${issueData.description || 'No description provided'}

REQUIRED ACTIONS (execute these steps):
1. Create and checkout a feature branch: git checkout -b ${issueData.branchName || `feature/${issueData.identifier.toLowerCase()}`}
2. Analyze the issue requirements and existing codebase
3. Implement the solution using the appropriate tools (Edit, Write, etc.)
4. Test your implementation if applicable (using bun test or manual testing)
5. Update changelog.md with a brief entry about your changes
6. Commit your changes: git add -A && git commit -m "${issueData.identifier}: ${issueData.title}"
7. Push the branch: git push -u origin ${issueData.branchName || `feature/${issueData.identifier.toLowerCase()}`}

IMPORTANT:
- You MUST actually execute these steps, not just describe them
- Use the Edit and Write tools to modify files
- Use Bash tool for git operations
- Keep changes minimal and focused
- Work in /Users/akshgarg/Documents/sync directory

When complete, output "TASK_COMPLETE: ${issueData.identifier}" so we know you finished.
`;
        
        return prompt;
    } catch (error) {
        console.error(`Error generating prompt for issue ${issueId}:`, error);
        throw error;
    }
}

/**
 * Spawns a Claude Code instance to work on a Linear issue using tmux
 */
export async function launchClaudeForIssue(issueId: string, linearIdentifier: string): Promise<ClaudeSession> {
    console.log(`🚀 Launching Claude Code for issue ${linearIdentifier}...`);
    
    // Check if session already exists
    if (activeSessions.has(issueId)) {
        console.log(`⚠️  Session already exists for ${linearIdentifier}`);
        return activeSessions.get(issueId)!;
    }

    try {
        // Generate the prompt
        const prompt = await generatePromptFromIssue(issueId);
        
        // Get the next worker number (simple increment)
        const workerNumber = getNextWorkerNumber();
        const tmuxSession = `claude-worker-${workerNumber}`;
        
        // Create tmux session
        await createTmuxWorkerSession(workerNumber);
        
        // Create session object
        const session: ClaudeSession = {
            issueId,
            linearIdentifier,
            startedAt: new Date(),
            status: 'running',
            output: [],
            tmuxSession,
            workerNumber
        };
        
        activeSessions.set(issueId, session);
        
        // Launch Claude in the tmux worker with the prompt (always use local mode)
        await attachToClaudeWorkerLocal(workerNumber, prompt, issueId);
        
        console.log(`✅ Claude Code launched for ${linearIdentifier} in ${tmuxSession}`);
        
        // Start monitoring the tmux session
        monitorTmuxSession(session);
        
        return session;

    } catch (error) {
        console.error(`❌ Error launching Claude for ${linearIdentifier}:`, error);
        throw error;
    }
}

/**
 * Monitors a tmux session for Claude Code output
 */
async function monitorTmuxSession(session: ClaudeSession) {
    console.log(`📊 Simple monitoring started for ${session.tmuxSession} - no cleanup needed`);
    // No complex monitoring needed since server restarts after 4 concurrent sessions
}

/**
 * Adds completion comment to Linear issue (no status updates)
 */
async function addCompletionComment(issueId: string, success: boolean) {
    try {
        const { addCommentToIssue } = await import("./utils");
        
        if (success) {
            await addCommentToIssue(issueId, "✅ Claude Code completed this task successfully!");
            console.log(`✅ Added completion comment to ${issueId}`);
        } else {
            await addCommentToIssue(issueId, "⚠️ Claude Code execution failed. Manual intervention may be required.");
            console.log(`⚠️ Added failure comment to ${issueId}`);
        }
    } catch (error) {
        console.error(`Error adding completion comment to ${issueId}:`, error);
    }
}

/**
 * Adds a progress comment to Linear issue
 */
async function addProgressComment(issueId: string, content: string) {
    try {
        const { addCommentToIssue } = await import("./utils");
        
        // Truncate very long content
        const truncatedContent = content.length > 1000 
            ? content.substring(0, 997) + "..." 
            : content;
        
        await addCommentToIssue(issueId, `🤖 Claude Code: ${truncatedContent}`);
    } catch (error) {
        console.error(`Error adding progress comment:`, error);
    }
}

/**
 * Gets status of a Claude session
 */
export function getSessionStatus(issueId: string): ClaudeSession | undefined {
    return activeSessions.get(issueId);
}

/**
 * Lists all active Claude sessions
 */
export function listActiveSessions(): ClaudeSession[] {
    return Array.from(activeSessions.values()).filter(s => s.status === 'running');
}

/**
 * Kills a Claude session
 */
export async function killSession(issueId: string): Promise<boolean> {
    const session = activeSessions.get(issueId);
    if (!session) {
        return false;
    }
    
    try {
        // Kill tmux session if it exists
        if (session.tmuxSession) {
            const proc = spawn(['tmux', 'kill-session', '-t', session.tmuxSession], {
                stdout: 'pipe',
                stderr: 'pipe'
            });
            await proc.exited;
        }
        
        session.status = 'failed';
        activeSessions.delete(issueId);
        console.log(`🛑 Killed Claude session for ${session.linearIdentifier}`);
        return true;
    } catch (error) {
        console.error(`Error killing session:`, error);
        return false;
    }
}

/**
 * Get current worker counter for debugging
 */
export function getCurrentWorkerCount(): number {
    return nextWorkerNumber - 1; // Subtract 1 since we increment before use
}

// Export for use in webhook server
export type { ClaudeSession };