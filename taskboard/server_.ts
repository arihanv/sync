import { verifyLinearSignature, addCommentToIssue, isIssueBlocked } from "./utils";
import { launchClaudeForIssue, getSessionStatus, listActiveSessions } from "./claude-launcher";
import { spawn } from "bun";

Bun.serve({
    port: 3000,
    routes: {
      // Root route
      "/": () => new Response("Claude Code Linear Automation Server - Server is running!"),
      
      // Static routes  
      "/api/status": () => {
        const sessions = listActiveSessions();
        return new Response(JSON.stringify({
          status: "OK",
          activeSessions: sessions.length,
          sessions: sessions.map(s => ({
            issueId: s.issueId,
            linearIdentifier: s.linearIdentifier,
            status: s.status,
            startedAt: s.startedAt,
            runtime: Date.now() - s.startedAt.getTime(),
            tmuxSession: s.tmuxSession,
            workerNumber: s.workerNumber
          }))
        }), {
          headers: { "Content-Type": "application/json" }
        });
      },
      
      // Tmux sessions status
      "/api/tmux": async () => {
        try {
          const proc = spawn(['tmux', 'list-sessions'], {
            stdout: 'pipe',
            stderr: 'pipe'
          });
          
          await proc.exited;
          const output = new TextDecoder().decode(await new Response(proc.stdout).arrayBuffer());
          
          const sessions = output.split('\n')
            .filter(line => line.trim() && line.includes('claude-worker-'))
            .map(line => {
              const parts = line.split(':');
              const sessionName = parts[0];
              if (!sessionName) return null;
              
              const workerMatch = sessionName.match(/claude-worker-(\d+)/);
              const workerNumber = workerMatch?.[1] ? Number.parseInt(workerMatch[1]) : null;
              
              return {
                sessionName,
                workerNumber,
                info: line.trim()
              };
            })
            .filter((session): session is NonNullable<typeof session> => session !== null);
          
          return new Response(JSON.stringify({
            status: "OK",
            tmuxSessions: sessions.length,
            sessions
          }), {
            headers: { "Content-Type": "application/json" }
          });
        } catch (error) {
          return new Response(JSON.stringify({
            status: "ERROR",
            error: error instanceof Error ? error.message : String(error)
          }), {
            headers: { "Content-Type": "application/json" }
          });
        }
      },
      
      // Linear webhook endpoint
      "/webhooks/linear": {
        POST: async (req) => {
          try {
            const body = await req.text();
            
            // Verify webhook signature
            if (!await verifyLinearSignature(req, body)) {
              console.error('Invalid webhook signature');
              return new Response('Unauthorized', { status: 401 });
            }
            
            const payload = JSON.parse(body);

            const targetAssigneeId = "e52e4e2b-d3e8-4b1c-822f-c4408407cdbf";
            
            // Check if the payload has an assignee with the target ID
            const isTargetAssignee = payload.data?.assignee?.id === targetAssigneeId;
            
            if (!isTargetAssignee) {
              console.log('Skipped payload - not assigned to target user');
              return new Response('OK', { status: 200 });
            }
            
            // Log the full payload for target assignee
            console.log('Linear webhook received for target assignee:', {
              type: payload.type,
              action: payload.action,
              timestamp: new Date().toISOString(),
              payload: payload
            });
            
            // Process the assigned issue
            if (payload.data?.id && payload.data?.identifier) {
              const issueId = payload.data.id;
              const identifier = payload.data.identifier;
              
              // Check if issue is blocked
              const blocked = await isIssueBlocked(issueId);
              if (blocked) {
                await addCommentToIssue(issueId, "⏸️ Issue is blocked by dependencies. Will execute when unblocked.");
                console.log(`Issue ${identifier} is blocked, skipping Claude launch`);
                return new Response('OK', { status: 200 });
              }
              
              // Check if Claude session already exists
              const existingSession = getSessionStatus(issueId);
              if (existingSession && existingSession.status === 'running') {
                await addCommentToIssue(issueId, "🔄 Claude Code is already working on this issue");
                console.log(`Session already exists for ${identifier}`);
                return new Response('OK', { status: 200 });
              }
              
              // Launch Claude Code for this issue
              try {
                await addCommentToIssue(issueId, "🚀 Launching Claude Code to work on this issue...");
                await launchClaudeForIssue(issueId, identifier);
                console.log(`Successfully launched Claude for issue ${identifier}`);
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`Failed to launch Claude for ${identifier}:`, errorMessage);
                await addCommentToIssue(issueId, `❌ Failed to launch Claude Code: ${errorMessage}`);
              }
            }
            
            return new Response('OK', { status: 200 });
          } catch (error) {
            console.error('Error processing Linear webhook:', error);
            return new Response('Internal Server Error', { status: 500 });
          }
        }
      },
  
      // Dynamic routes
      "/users/:id": req => {
        return new Response(`Hello User ${req.params.id}!`);
      },
    },
  });
  
  console.log("Server running on port 3000");