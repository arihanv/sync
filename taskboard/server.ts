import { spawn } from "bun";

// Optional Linear imports - gracefully handle missing credentials
let verifyLinearSignature: ((req: Request, body: string) => Promise<boolean>) | null = null;
let listActiveSessions: (() => any[]) | null = null;
let getCurrentWorkerCount: (() => number) | null = null;
let launchClaudeTask: ((opts: any) => Promise<boolean>) | null = null;

try {
  const utils = await import("./utils");
  verifyLinearSignature = utils.verifyLinearSignature;
  
  const launcher = await import("./claude-launcher");
  listActiveSessions = launcher.listActiveSessions;
  getCurrentWorkerCount = launcher.getCurrentWorkerCount;
  
  const tmuxLauncher = await import("../test-tmux-launcher");
  launchClaudeTask = tmuxLauncher.launchClaudeTask;
  
  console.log("✅ Linear integration loaded successfully");
} catch (error) {
  console.warn("⚠️ Linear integration disabled - missing API credentials");
}

Bun.serve({
    port: 3000,
    routes: {
      // Static routes  
      "/api/status": () => {
        if (!listActiveSessions || !getCurrentWorkerCount) {
          return new Response(JSON.stringify({
            status: "OK",
            message: "Linear integration disabled - changelog sharing available",
            linearIntegration: false,
            changelogEndpoints: ["/changelog", "/changelog.html"]
          }), {
            headers: { "Content-Type": "application/json" }
          });
        }
        
        const sessions = listActiveSessions();
        return new Response(JSON.stringify({
          status: "OK",
          linearIntegration: true,
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
      
      
      // Changelog sharing endpoint
      "/changelog": async () => {
        try {
          const changelogPath = "./changelog.md";
          const file = Bun.file(changelogPath);
          
          if (await file.exists()) {
            const content = await file.text();
            return new Response(content, {
              headers: { 
                "Content-Type": "text/markdown",
                "Access-Control-Allow-Origin": "*"
              }
            });
          } else {
            return new Response("Changelog not found", { 
              status: 404,
              headers: { "Content-Type": "text/plain" }
            });
          }
        } catch (error) {
          return new Response("Error reading changelog", { 
            status: 500,
            headers: { "Content-Type": "text/plain" }
          });
        }
      },

      // HTML formatted changelog endpoint
      "/changelog.html": async () => {
        try {
          const changelogPath = "./changelog.md";
          const file = Bun.file(changelogPath);
          
          if (await file.exists()) {
            const content = await file.text();
            const htmlContent = content
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/^# (.+)/gm, "<h1>$1</h1>")
              .replace(/^## (.+)/gm, "<h2>$1</h2>")
              .replace(/^### (.+)/gm, "<h3>$1</h3>")
              .replace(/^\*\*(.+?)\*\*:/gm, "<strong>$1:</strong>")
              .replace(/^- (.+)/gm, "<li>$1</li>")
              .replace(/\n\n/g, "</p><p>")
              .replace(/^(.+)$/gm, "<p>$1</p>")
              .replace(/<p><li>/g, "<ul><li>")
              .replace(/<\/li><\/p>/g, "</li></ul>")
              .replace(/---/g, "<hr>");
            
            const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Harmonize Changelog</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    h1 { color: #333; border-bottom: 2px solid #eee; }
    h2 { color: #666; border-bottom: 1px solid #eee; }
    h3 { color: #999; }
    hr { border: none; height: 1px; background: #eee; margin: 20px 0; }
    ul { margin: 10px 0; }
    li { margin: 5px 0; }
    strong { color: #2563eb; }
  </style>
</head>
<body>
  ${htmlContent}
</body>
</html>`;
            
            return new Response(html, {
              headers: { 
                "Content-Type": "text/html",
                "Access-Control-Allow-Origin": "*"
              }
            });
          } else {
            return new Response("<h1>Changelog not found</h1>", { 
              status: 404,
              headers: { "Content-Type": "text/html" }
            });
          }
        } catch (error) {
          return new Response("<h1>Error reading changelog</h1>", { 
            status: 500,
            headers: { "Content-Type": "text/html" }
          });
        }
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
          if (!verifyLinearSignature || !launchClaudeTask) {
            return new Response('Linear integration disabled', { status: 503 });
          }
          
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