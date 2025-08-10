import modal
import subprocess
import time

# Create a simple Modal image based on the Dockerfile without additional Python setup
harmonize_worker_image = (
    modal.Image.from_dockerfile(
        path="DOCKERFILE",
        build_args={
            "TZ": "UTC",
        },
        add_python="3.10",
    )
    .apt_install(
        "git",
        "curl",
        "openssh-server",
        "openssh-client",
    )
    .run_commands(
        "curl -sSf https://sshx.io/get | sh",
    )
    .add_local_file("init-firewall.sh", "/usr/local/bin/init-firewall.sh")
)

harmonize_worker_app = modal.App(name="harmonize-worker")

base_image = modal.Image.debian_slim(python_version="3.10")
app = modal.App(name="harmonize", image=base_image)

harmonize_app = modal.App.lookup(name="harmonize-worker", create_if_missing=True)


@app.local_entrypoint()
def main():
    with modal.enable_output():
        sandbox = modal.Sandbox.create(
            app=harmonize_app,
            image=harmonize_worker_image,
            secrets=[modal.Secret.from_dotenv(".env")],
            verbose=True,
            timeout=60 * 10,
            unencrypted_ports=[22],
        )

        # Generate SSH host keys
        print("🔑 Generating SSH host keys...")
        sandbox.exec("/usr/bin/ssh-keygen", "-A")
        
        # Create SSH directory and set permissions
        sandbox.exec("mkdir", "-p", "/var/run/sshd")
        sandbox.exec("chmod", "755", "/var/run/sshd")
        
        # Configure SSH to allow root login and password authentication for development
        sandbox.exec("sed", "-i", "s/#PermitRootLogin prohibit-password/PermitRootLogin yes/", "/etc/ssh/sshd_config")
        sandbox.exec("sed", "-i", "s/#PasswordAuthentication yes/PasswordAuthentication yes/", "/etc/ssh/sshd_config")
        sandbox.exec("sed", "-i", "s/#PubkeyAuthentication yes/PubkeyAuthentication yes/", "/etc/ssh/sshd_config")
        
        # Set a simple password for root (for development purposes)
        sandbox.exec("echo", "root:password123", "|", "chpasswd")
        
        # Start SSH server
        print("🚀 Starting SSH server...")
        ssh_process = sandbox.exec("/usr/sbin/sshd", "-D", "-e", background=True)
        
        # Wait a moment for SSH to start
        time.sleep(5)
        
        # Check if SSH is running
        result = sandbox.exec("ps", "aux", "|", "grep", "sshd")
        print(f"SSH process check: {result.stdout}")
        
        # Test SSH locally within the sandbox
        print("🧪 Testing SSH locally...")
        test_result = sandbox.exec("ssh", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", "root@localhost", "echo 'SSH test successful'")
        print(f"Local SSH test result: {test_result.stdout}")

    tunnel = sandbox.tunnels()[22]

    print(f"🏖️  Sandbox ID: {sandbox.object_id}")
    print(f"🏖️  Tunnel URL: {tunnel.url}")
    print(f"🏖️  Tunnel Host: {tunnel.host}")
    print(f"🏖️  Tunnel Port: {tunnel.port}")
    print(f"🔑 SSH Connection Info:")
    print(f"   Host: {tunnel.host}")
    print(f"   Port: {tunnel.port}")
    print(f"   Username: root")
    print(f"   Password: password123")
    print(f"   Command: ssh root@{tunnel.host} -p {tunnel.port}")
    
    # Test external SSH connection
    print("🧪 Testing external SSH connection...")
    try:
        # Use sshpass for automated password authentication
        ssh_cmd = [
            "sshpass", "-p", "password123",
            "ssh", "-o", "StrictHostKeyChecking=no", 
            "-o", "UserKnownHostsFile=/dev/null",
            "-o", "ConnectTimeout=10",
            f"root@{tunnel.host}",
            "-p", str(tunnel.port),
            "echo 'External SSH test successful'"
        ]
        
        result = subprocess.run(ssh_cmd, capture_output=True, text=True, timeout=30)
        if result.returncode == 0:
            print("✅ External SSH connection successful!")
            print(f"Output: {result.stdout}")
        else:
            print("❌ External SSH connection failed!")
            print(f"Error: {result.stderr}")
    except subprocess.TimeoutExpired:
        print("❌ SSH connection timed out")
    except FileNotFoundError:
        print("⚠️  sshpass not found. Install it with: brew install sshpass")
        print("   Or test manually with the provided SSH command")

@app.function(image=harmonize_worker_image, secrets=[modal.Secret.from_dotenv(".env")])
def harmonize_worker():
    print("Hello, world!") 