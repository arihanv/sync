#!/usr/bin/env python3

import asyncio
import json
import os
import subprocess
import sys
from datetime import datetime
from typing import Dict, List, Optional

import aiohttp
from aiohttp import web, ClientSession
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class LinearServer:
    def __init__(self, port: int = 3001):
        self.port = port
        self.active_sessions: Dict[str, Dict] = {}
        self.linear_token = os.getenv('LINEAR_TOKEN')
        self.webhook_secret = os.getenv('LINEAR_WEBHOOK_SECRET')
        self.target_user = os.getenv('TARGET_USER', 'arihanvaranasi@gmail.com')
        
        if not self.linear_token:
            raise ValueError("LINEAR_TOKEN environment variable is required")

    async def create_app(self) -> web.Application:
        app = web.Application()
        app.router.add_post('/webhook/linear', self.handle_linear_webhook)
        app.router.add_get('/api/status', self.get_status)
        app.router.add_get('/api/sessions', self.get_sessions)
        app.router.add_post('/api/stop/{issue_id}', self.stop_session)
        return app

    async def handle_linear_webhook(self, request: web.Request) -> web.Response:
        try:
            payload = await request.json()
            
            if payload.get('type') == 'Issue' and payload.get('action') == 'update':
                issue_data = payload.get('data', {})
                assignee = issue_data.get('assignee')
                
                if assignee and assignee.get('email') == self.target_user:
                    issue_id = issue_data.get('identifier')
                    issue_title = issue_data.get('title', '')
                    
                    logger.info(f"Issue {issue_id} assigned to target user: {issue_title}")
                    
                    if issue_id not in self.active_sessions:
                        await self.launch_claude_session(issue_id, issue_title, issue_data)
                    
            return web.Response(text='OK', status=200)
            
        except Exception as e:
            logger.error(f"Error handling webhook: {str(e)}")
            return web.Response(text='Error', status=500)

    async def launch_claude_session(self, issue_id: str, issue_title: str, issue_data: Dict) -> None:
        try:
            if await self.is_issue_blocked(issue_id):
                logger.info(f"Issue {issue_id} is blocked by dependencies, skipping launch")
                return
                
            prompt = self.generate_claude_prompt(issue_id, issue_title, issue_data)
            
            session_id = f"claude-{issue_id}-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
            
            cmd = [
                'tmux', 'new-session', '-d', '-s', session_id,
                'claude', '--print', '--allowedTools', 'all', prompt
            ]
            
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            self.active_sessions[issue_id] = {
                'session_id': session_id,
                'issue_title': issue_title,
                'started_at': datetime.now().isoformat(),
                'process_pid': process.pid,
                'status': 'running'
            }
            
            logger.info(f"Launched Claude session {session_id} for issue {issue_id}")
            
            asyncio.create_task(self.monitor_session(issue_id, session_id))
            
        except Exception as e:
            logger.error(f"Error launching Claude session for {issue_id}: {str(e)}")

    async def monitor_session(self, issue_id: str, session_id: str) -> None:
        try:
            while issue_id in self.active_sessions:
                cmd = ['tmux', 'capture-pane', '-t', session_id, '-p']
                
                try:
                    result = await asyncio.create_subprocess_exec(
                        *cmd,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE
                    )
                    stdout, stderr = await result.communicate()
                    
                    if result.returncode == 0:
                        output = stdout.decode('utf-8')
                        
                        if f"TASK_COMPLETE: {issue_id}" in output:
                            logger.info(f"Task completed for {issue_id}")
                            await self.cleanup_session(issue_id)
                            break
                    else:
                        logger.warning(f"Session {session_id} may have ended")
                        if issue_id in self.active_sessions:
                            self.active_sessions[issue_id]['status'] = 'ended'
                        break
                        
                except Exception as monitor_error:
                    logger.error(f"Error monitoring session {session_id}: {str(monitor_error)}")
                    break
                
                await asyncio.sleep(30)
                
        except Exception as e:
            logger.error(f"Error in session monitor for {issue_id}: {str(e)}")

    async def cleanup_session(self, issue_id: str) -> None:
        try:
            if issue_id in self.active_sessions:
                session_id = self.active_sessions[issue_id]['session_id']
                
                cmd = ['tmux', 'kill-session', '-t', session_id]
                process = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                await process.wait()
                
                del self.active_sessions[issue_id]
                logger.info(f"Cleaned up session for {issue_id}")
                
        except Exception as e:
            logger.error(f"Error cleaning up session for {issue_id}: {str(e)}")

    async def is_issue_blocked(self, issue_id: str) -> bool:
        try:
            query = '''
            query($issueId: String!) {
                issue(id: $issueId) {
                    relations {
                        nodes {
                            type
                            relatedIssue {
                                identifier
                                state {
                                    type
                                }
                            }
                        }
                    }
                }
            }
            '''
            
            async with ClientSession() as session:
                async with session.post(
                    'https://api.linear.app/graphql',
                    headers={
                        'Authorization': f'Bearer {self.linear_token}',
                        'Content-Type': 'application/json'
                    },
                    json={'query': query, 'variables': {'issueId': issue_id}}
                ) as response:
                    data = await response.json()
                    
                    if 'errors' in data:
                        logger.error(f"GraphQL error checking dependencies: {data['errors']}")
                        return True
                    
                    relations = data.get('data', {}).get('issue', {}).get('relations', {}).get('nodes', [])
                    
                    for relation in relations:
                        if relation.get('type') == 'blocks':
                            related_issue = relation.get('relatedIssue', {})
                            state_type = related_issue.get('state', {}).get('type')
                            if state_type not in ['completed', 'canceled']:
                                return True
                    
                    return False
                    
        except Exception as e:
            logger.error(f"Error checking if issue {issue_id} is blocked: {str(e)}")
            return True

    def generate_claude_prompt(self, issue_id: str, issue_title: str, issue_data: Dict) -> str:
        description = issue_data.get('description', 'No description provided')
        
        prompt = f"""You are executing a Linear issue autonomously. You have full permission to read, write, and edit files, and run git/bun commands.

Issue: {issue_id} - {issue_title}
Description: {description}

REQUIRED ACTIONS (execute these steps):
1. Create and checkout a feature branch: git checkout -b arihandev/{issue_id.lower()}-{issue_title.lower().replace(' ', '-')}
2. Analyze the issue requirements and existing codebase
3. Implement the solution using the appropriate tools (Edit, Write, etc.)
4. Test your implementation if applicable (using bun test or manual testing)
5. Update changelog.md with a brief entry about your changes
6. Commit your changes: git add -A && git commit -m "{issue_id}: {issue_title}"
7. Push the branch: git push -u origin arihandev/{issue_id.lower()}-{issue_title.lower().replace(' ', '-')}
8. Make a pull request to merge the branch back to the main-branch

Make a pr with:
user.email=arihanvaranasi@gmail.com
user.name=arihanv

IMPORTANT:
- You MUST actually execute these steps, not just describe them
- Use the Edit and Write tools to modify files
- Use Bash tool for git operations
- Keep changes minimal and focused

When complete, output TASK_COMPLETE: {issue_id} so we know you finished."""

        return prompt

    async def get_status(self, request: web.Request) -> web.Response:
        return web.json_response({
            'active_sessions': len(self.active_sessions),
            'sessions': self.active_sessions
        })

    async def get_sessions(self, request: web.Request) -> web.Response:
        return web.json_response(self.active_sessions)

    async def stop_session(self, request: web.Request) -> web.Response:
        issue_id = request.match_info['issue_id']
        
        if issue_id in self.active_sessions:
            await self.cleanup_session(issue_id)
            return web.Response(text=f'Session for {issue_id} stopped', status=200)
        else:
            return web.Response(text=f'No active session for {issue_id}', status=404)

    async def start_server(self):
        app = await self.create_app()
        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, '0.0.0.0', self.port)
        await site.start()
        logger.info(f"Linear Server started on port {self.port}")
        return runner

async def main():
    server = LinearServer()
    runner = await server.start_server()
    
    try:
        while True:
            await asyncio.sleep(1)
    except KeyboardInterrupt:
        logger.info("Shutting down server...")
        await runner.cleanup()

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nServer stopped.")