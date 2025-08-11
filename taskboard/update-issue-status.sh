#!/bin/bash
# Linear Issue Status Updater
# Usage: ./update-issue-status.sh <issue_id> <status>
# status options: "complete" or "progress"

if [ $# -ne 2 ]; then
    echo "Usage: $0 <issue_id> <status>"
    echo "Status options: complete, progress"
    exit 1
fi

ISSUE_ID="$1"
STATUS="$2"

# Validate status
if [ "$STATUS" != "complete" ] && [ "$STATUS" != "progress" ]; then
    echo "Error: Status must be 'complete' or 'progress'"
    exit 1
fi

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Create a temporary Python file to execute the function
TEMP_FILE="${SCRIPT_DIR}/temp-update-issue-${ISSUE_ID}-${STATUS}.py"

cat > "$TEMP_FILE" << 'EOF'
#!/usr/bin/env python3
import os
import sys
import requests
from typing import Optional

# Load environment variables from .env file
def load_env_file(env_path):
    """Load environment variables from .env file."""
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    os.environ[key] = value

# Load .env file from the script directory
script_dir = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(script_dir, '..', '.env')
load_env_file(env_path)

def get_linear_token() -> Optional[str]:
    """Get Linear API token from environment variable."""
    return os.getenv('LINEAR_API_KEY')

def get_team_states(team_id: str, token: str):
    """Get all states for a team."""
    headers = {
        'Authorization': token,
        'Content-Type': 'application/json',
    }
    
    query = '''
    query GetTeamStates($teamId: String!) {
        team(id: $teamId) {
            states {
                nodes {
                    id
                    name
                }
            }
        }
    }
    '''
    
    response = requests.post(
        'https://api.linear.app/graphql',
        json={'query': query, 'variables': {'teamId': team_id}},
        headers=headers
    )
    
    if response.status_code != 200:
        raise Exception(f"Failed to get team states: {response.text}")
    
    data = response.json()
    return data['data']['team']['states']['nodes']

def get_issue(issue_id: str, token: str):
    """Get issue details including team."""
    headers = {
        'Authorization': token,
        'Content-Type': 'application/json',
    }
    
    query = '''
    query GetIssue($issueId: String!) {
        issue(id: $issueId) {
            id
            title
            team {
                id
                name
            }
        }
    }
    '''
    
    response = requests.post(
        'https://api.linear.app/graphql',
        json={'query': query, 'variables': {'issueId': issue_id}},
        headers=headers
    )
    
    if response.status_code != 200:
        raise Exception(f"Failed to get issue: {response.text}")
    
    data = response.json()
    return data['data']['issue']

def update_issue_state(issue_id: str, state_id: str, token: str):
    """Update issue state."""
    headers = {
        'Authorization': token,
        'Content-Type': 'application/json',
    }
    
    mutation = '''
    mutation UpdateIssue($issueId: String!, $stateId: String!) {
        issueUpdate(id: $issueId, input: { stateId: $stateId }) {
            success
            issue {
                id
                title
            }
        }
    }
    '''
    
    response = requests.post(
        'https://api.linear.app/graphql',
        json={'query': mutation, 'variables': {'issueId': issue_id, 'stateId': state_id}},
        headers=headers
    )
    
    if response.status_code != 200:
        raise Exception(f"Failed to update issue: {response.text}")
    
    data = response.json()
    return data['data']['issueUpdate']

def mark_issue_as_complete(issue_id: str) -> bool:
    """Mark a Linear issue as complete."""
    try:
        token = get_linear_token()
        if not token:
            print("Error: LINEAR_API_KEY environment variable not set")
            return False
        
        # Get issue and team
        issue = get_issue(issue_id, token)
        if not issue or not issue['team']:
            print(f"Error: No team found for issue {issue_id}")
            return False
        
        team_id = issue['team']['id']
        
        # Get team states
        states = get_team_states(team_id, token)
        
        # Find completed state
        completed_state = None
        for state in states:
            state_name = state['name'].lower()
            if 'done' in state_name or 'complete' in state_name:
                completed_state = state
                break
        
        if not completed_state:
            print(f"Error: No completed state found for team {issue['team']['name']}")
            return False
        
        # Update issue
        result = update_issue_state(issue_id, completed_state['id'], token)
        
        if result['success']:
            print(f"Issue {issue_id} marked as complete")
            return True
        else:
            print(f"Failed to update issue {issue_id}")
            return False
            
    except Exception as error:
        print(f"Error marking issue {issue_id} as complete: {error}")
        return False

def mark_issue_as_in_progress(issue_id: str) -> bool:
    """Mark a Linear issue as in progress."""
    try:
        token = get_linear_token()
        if not token:
            print("Error: LINEAR_API_KEY environment variable not set")
            return False
        
        # Get issue and team
        issue = get_issue(issue_id, token)
        if not issue or not issue['team']:
            print(f"Error: No team found for issue {issue_id}")
            return False
        
        team_id = issue['team']['id']
        
        # Get team states
        states = get_team_states(team_id, token)
        
        # Find in progress state
        in_progress_state = None
        for state in states:
            state_name = state['name'].lower()
            if 'progress' in state_name or 'doing' in state_name or 'active' in state_name:
                in_progress_state = state
                break
        
        if not in_progress_state:
            print(f"Error: No in progress state found for team {issue['team']['name']}")
            return False
        
        # Update issue
        result = update_issue_state(issue_id, in_progress_state['id'], token)
        
        if result['success']:
            print(f"Issue {issue_id} marked as in progress")
            return True
        else:
            print(f"Failed to update issue {issue_id}")
            return False
            
    except Exception as error:
        print(f"Error marking issue {issue_id} as in progress: {error}")
        return False

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python script.py <issue_id> <status>")
        sys.exit(1)
    
    issue_id = sys.argv[1]
    status = sys.argv[2]
    
    success = False
    if status == "complete":
        success = mark_issue_as_complete(issue_id)
    elif status == "progress":
        success = mark_issue_as_in_progress(issue_id)
    else:
        print("Error: Status must be 'complete' or 'progress'")
        sys.exit(1)
    
    sys.exit(0 if success else 1)
EOF

# Execute the Python file
echo "Updating issue $ISSUE_ID to status: $STATUS"
python3 "$TEMP_FILE" "$ISSUE_ID" "$STATUS"

# Store the exit code
EXIT_CODE=$?

# Clean up temporary file
rm -f "$TEMP_FILE"

# Exit with the same code as the Python script
exit $EXIT_CODE