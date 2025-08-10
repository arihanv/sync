import { verifyLinearSignature } from "./utils";
import { listActiveSessions, getCurrentWorkerCount } from "./claude-launcher";
import { launchClaudeTask } from "../test-tmux-launcher";
import { spawn } from "bun";

Bun.serve({
    port: 3000,
    routes: {
      // Static routes  
      "/api/status": () => {
        const sessions = listActiveSessions();
        return new Response(JSON.stringify({
          status: "OK",
          activeSessions: sessions.length,
          nextWorkerNumber: getCurrentWorkerCount() + 1,
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
            
            // Log the webhook payload
            console.log('Linear webhook received:', {
              type: payload.type,
              action: payload.action,
              timestamp: new Date().toISOString(),
              payload: payload
            });
            
            // Process the assigned issue
            if (payload.data?.id && payload.data?.identifier) {
              const issueId = payload.data.id;
              const identifier = payload.data.identifier;
              
              console.log(`📋 Processing assignment for ${identifier} (${issueId})`);
              
              // Use the enhanced launcher with dependency checking
              const success = await launchClaudeTask({
                issueId,
                identifier,
                skipDependencyCheck: false // Always check dependencies in webhook
              });
              
              if (success) {
                console.log(`✅ Successfully launched Claude for issue ${identifier}`);
              } else {
                console.log(`⚠️ Claude launch skipped or failed for ${identifier}`);
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