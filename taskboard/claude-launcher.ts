#!/usr/bin/env bun

/**
 * Claude Code Launcher - Spawns Claude Code instances to execute Linear issues
 */

import { spawn } from "bun";
import { linearClient } from "./utils";

interface ClaudeSession {
    issueId: string;
    linearIdentifier: string;
    process?: any;
    startedAt: Date;
    status: 'running' | 'completed' | 'failed';
    output: string[];
}

// Active Claude sessions
const activeSessions = new Map<string, ClaudeSession>();

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
- Work in /Users/akshgarg/Documents/Harmonize directory

When complete, output "TASK_COMPLETE: ${issueData.identifier}" so we know you finished.
`;
        
        return prompt;
    } catch (error) {
        console.error(`Error generating prompt for issue ${issueId}:`, error);
        throw error;
    }
}

/**
 * Spawns a Claude Code instance to work on a Linear issue
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
        
        // Create session object
        const session: ClaudeSession = {
            issueId,
            linearIdentifier,
            startedAt: new Date(),
            status: 'running',
            output: []
        };
        
        // Spawn Claude Code process
        // Using --print for non-interactive headless mode
        // --allowedTools lets Claude actually execute commands and edit files
        const proc = spawn([
            "claude",
            "--print",  // Non-interactive headless mode
            "--allowedTools", "Read", "Write", "Edit", "MultiEdit", 
            "--allowedTools", "Bash(git:*)", "Bash(bun:*)", "Bash(npm:*)", 
            "--allowedTools", "Grep", "Glob", "TodoWrite",
            "--add-dir", "/Users/akshgarg/Documents/Harmonize",
            "--verbose",  // For debugging
        ], {
            cwd: "/Users/akshgarg/Documents/Harmonize",
            env: {
                ...process.env,
                LINEAR_ISSUE_ID: issueId,
                LINEAR_IDENTIFIER: linearIdentifier
            },
            stdin: "pipe",
            stdout: "pipe",
            stderr: "pipe"
        });

        // Send the prompt via stdin using Bun's API
        if (proc.stdin) {
            proc.stdin.write(prompt);
            proc.stdin.end();
        }

        session.process = proc;
        activeSessions.set(issueId, session);

        // Handle stdout
        if (proc.stdout) {
            handleOutputStream(proc.stdout, session, 'stdout');
        }

        // Handle stderr
        if (proc.stderr) {
            handleOutputStream(proc.stderr, session, 'stderr');
        }

        // Wait for process to complete
        proc.exited.then(exitCode => {
            console.log(`✅ Claude Code session for ${linearIdentifier} exited with code ${exitCode}`);
            session.status = exitCode === 0 ? 'completed' : 'failed';
            
            // Update Linear issue based on result
            updateLinearIssueStatus(issueId, session.status === 'completed');
        });

        return session;

    } catch (error) {
        console.error(`❌ Error launching Claude for ${linearIdentifier}:`, error);
        throw error;
    }
}

/**
 * Handles output stream from Claude Code process
 */
async function handleOutputStream(stream: ReadableStream, session: ClaudeSession, type: 'stdout' | 'stderr') {
    const reader = stream.getReader();
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const text = new TextDecoder().decode(value);
            session.output.push(`[${type}] ${text}`);
            
            // Log output in real-time
            if (type === 'stdout') {
                console.log(`📝 [${session.linearIdentifier}]: ${text}`);
            } else {
                console.error(`⚠️  [${session.linearIdentifier}]: ${text}`);
            }
            
            // Check for task completion
            if (text.includes(`TASK_COMPLETE: ${session.linearIdentifier}`)) {
                console.log(`✅ Task ${session.linearIdentifier} marked as complete by Claude`);
                session.status = 'completed';
            }
            
            // Add progress updates to Linear periodically
            if (type === 'stdout' && session.output.length % 10 === 0) {
                // Every 10 output lines, add a progress comment
                await addProgressComment(session.issueId, `Progress update: Currently working...`);
            }
        }
    } catch (error) {
        console.error(`Error reading ${type} stream:`, error);
    }
}

/**
 * Updates Linear issue status based on Claude execution
 */
async function updateLinearIssueStatus(issueId: string, success: boolean) {
    try {
        const issue = await linearClient.issue(issueId);
        
        if (success) {
            // Move to completed or done state
            // Note: You'll need to find the appropriate state ID for your Linear workspace
            await issue.update({
                stateId: "completed" // This needs to be the actual state ID
            });
            console.log(`✅ Updated ${issueId} to completed`);
        } else {
            // Add comment about failure
            const { addCommentToIssue } = await import("./utils");
            await addCommentToIssue(issueId, "⚠️ Claude Code execution failed. Manual intervention may be required.");
        }
    } catch (error) {
        console.error(`Error updating Linear issue ${issueId}:`, error);
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
    if (!session || !session.process) {
        return false;
    }
    
    try {
        session.process.kill();
        session.status = 'failed';
        activeSessions.delete(issueId);
        console.log(`🛑 Killed Claude session for ${session.linearIdentifier}`);
        return true;
    } catch (error) {
        console.error(`Error killing session:`, error);
        return false;
    }
}

// Export for use in webhook server
export type { ClaudeSession };