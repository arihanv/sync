#!/usr/bin/env bun

/**
 * Claude Code Launcher - Spawns Claude Code instances to execute Linear issues
 */

import { spawn } from "bun";
import { linearClient, attachToClaudeWorker } from "./utils";

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

// Track which tmux workers are in use
const workerAssignments = new Map<number, string>(); // workerNum -> issueId

/**
 * Gets list of available tmux sessions for Claude workers
 */
async function getAvailableTmuxWorkers(): Promise<number[]> {
    try {
        const proc = spawn(['tmux', 'list-sessions'], {
            stdout: 'pipe',
            stderr: 'pipe'
        });
        
        await proc.exited;
        
        const output = new TextDecoder().decode(await new Response(proc.stdout).arrayBuffer());
        const sessions = output.split('\n')
            .filter(line => line.includes('claude-worker-'))
            .map(line => {
                const match = line.match(/claude-worker-(\d+)/);
                return match?.[1] ? parseInt(match[1]) : null;
            })
            .filter((num): num is number => num !== null);
        
        // Return workers that are not currently assigned
        return sessions.filter(workerNum => !workerAssignments.has(workerNum));
    } catch (error) {
        console.error('Error listing tmux sessions:', error);
        return [];
    }
}

/**
 * Finds the next available tmux worker or creates a new one
 */
async function getNextAvailableWorker(): Promise<number> {
    const availableWorkers = await getAvailableTmuxWorkers();
    
    if (availableWorkers.length > 0) {
        return Math.min(...availableWorkers);
    }
    
    // If no workers available, create a new one
    const nextWorkerNum = Math.max(0, ...Array.from(workerAssignments.keys())) + 1;
    await createTmuxWorkerSession(nextWorkerNum);
    return nextWorkerNum;
}

/**
 * Creates a new tmux session for Claude worker
 */
async function createTmuxWorkerSession(workerNum: number): Promise<void> {
    try {
        const sessionName = `claude-worker-${workerNum}`;
        
        const proc = spawn([
            'tmux', 'new-session', '-d', '-s', sessionName,
            '-c', '/Users/akshgarg/Documents/try2/Harmonize'
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
- Work in /Users/akshgarg/Documents/try2/Harmonize directory

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
        
        // Get an available tmux worker
        const workerNumber = await getNextAvailableWorker();
        const tmuxSession = `claude-worker-${workerNumber}`;
        
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
        
        // Reserve the worker
        workerAssignments.set(workerNumber, issueId);
        activeSessions.set(issueId, session);
        
        // Launch Claude in the tmux worker with the prompt
        await attachToClaudeWorker(workerNumber, prompt);
        
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
    if (!session.tmuxSession) return;
    
    console.log(`📊 Starting monitoring for ${session.tmuxSession}`);
    
    const checkInterval = setInterval(async () => {
        try {
            // Check if session still exists
            const proc = spawn(['tmux', 'list-sessions'], {
                stdout: 'pipe',
                stderr: 'pipe'
            });
            
            await proc.exited;
            const output = new TextDecoder().decode(await new Response(proc.stdout).arrayBuffer());
            
            if (!session.tmuxSession || !output.includes(session.tmuxSession)) {
                console.log(`📋 Tmux session ${session.tmuxSession} ended for ${session.linearIdentifier}`);
                session.status = 'completed';
                
                // Clean up worker assignment
                if (session.workerNumber !== undefined) {
                    workerAssignments.delete(session.workerNumber);
                }
                
                // Update Linear issue
                await updateLinearIssueStatus(session.issueId, true);
                clearInterval(checkInterval);
                return;
            }
            
            // Capture recent output from tmux session
            const captureProc = spawn([
                'tmux', 'capture-pane', '-t', session.tmuxSession, '-p'
            ], {
                stdout: 'pipe',
                stderr: 'pipe'
            });
            
            await captureProc.exited;
            const sessionOutput = new TextDecoder().decode(await new Response(captureProc.stdout).arrayBuffer());
            
            // Check for completion markers
            if (sessionOutput.includes(`TASK_COMPLETE: ${session.linearIdentifier}`)) {
                console.log(`✅ Task ${session.linearIdentifier} marked as complete by Claude`);
                session.status = 'completed';
                
                // Clean up worker assignment
                if (session.workerNumber !== undefined) {
                    workerAssignments.delete(session.workerNumber);
                }
                
                await updateLinearIssueStatus(session.issueId, true);
                clearInterval(checkInterval);
            }
            
            // Add progress updates periodically (every 5 checks)
            if (Math.floor(Date.now() / 30000) % 5 === 0) {
                await addProgressComment(session.issueId, 
                    `🔄 Claude Code is working on this issue in ${session.tmuxSession}`);
            }
            
        } catch (error) {
            console.error(`Error monitoring tmux session ${session.tmuxSession}:`, error);
        }
    }, 30000); // Check every 30 seconds
    
    // Store the interval reference to clean up later
    (session as any).monitorInterval = checkInterval;
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
    if (!session) {
        return false;
    }
    
    try {
        // Clear monitoring interval
        if ((session as any).monitorInterval) {
            clearInterval((session as any).monitorInterval);
        }
        
        // Kill tmux session if it exists
        if (session.tmuxSession) {
            const proc = spawn(['tmux', 'kill-session', '-t', session.tmuxSession], {
                stdout: 'pipe',
                stderr: 'pipe'
            });
            await proc.exited;
        }
        
        // Kill direct process if it exists
        if (session.process) {
            session.process.kill();
        }
        
        // Clean up worker assignment
        if (session.workerNumber !== undefined) {
            workerAssignments.delete(session.workerNumber);
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

// Export for use in webhook server
export type { ClaudeSession };