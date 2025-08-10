import modal

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
        "nodejs",
        "npm",
        "tmux",
        "ssh",
        "curl",
    )
    .run_commands(
        "mkdir -p /run/sshd",
        "mkdir -p /root/.ssh",
        "echo 'PermitRootLogin yes' >> /etc/ssh/sshd_config",
        "echo 'PasswordAuthentication yes' >> /etc/ssh/sshd_config",
        "echo 'PubkeyAuthentication yes' >> /etc/ssh/sshd_config",
        "echo 'root:modal123' | chpasswd",
        "npm install -g @anthropic-ai/claude-code@latest",
        "find /usr -name 'cli.js' -path '*claude-code*' 2>/dev/null || echo 'cli.js not found'",
        "find /usr -name 'claude' -type l 2>/dev/null || echo 'claude symlink not found'",
        "npm root -g",
        "ls -la $(npm root -g)/@anthropic-ai/claude-code/ || echo 'Package directory not found'",
        "ln -sf $(npm root -g)/@anthropic-ai/claude-code/cli.js /usr/local/bin/claude || echo 'Symlink failed'",
        "chmod +x /usr/local/bin/claude || echo 'Chmod failed'",
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
            timeout=60 * 60 * 24,
            unencrypted_ports=[22],
        )

        # Generate SSH host keys
        print("🔑 Generating SSH host keys...")
        sandbox.exec("/usr/bin/ssh-keygen", "-A")

        # Create SSH directory and set permissions
        sandbox.exec("mkdir", "-p", "/var/run/sshd")
        sandbox.exec("chmod", "755", "/var/run/sshd")

        # Configure SSH to allow root login and password authentication
        sandbox.exec(
            "sed",
            "-i",
            "s/#PermitRootLogin prohibit-password/PermitRootLogin yes/",
            "/etc/ssh/sshd_config",
        )
        sandbox.exec(
            "sed",
            "-i",
            "s/#PasswordAuthentication yes/PasswordAuthentication yes/",
            "/etc/ssh/sshd_config",
        )
        sandbox.exec(
            "sed",
            "-i",
            "s/#PubkeyAuthentication yes/PubkeyAuthentication yes/",
            "/etc/ssh/sshd_config",
        )

        # Set password for root
        sandbox.exec("echo", "root:modal123", "|", "chpasswd")

        # Start SSH server
        print("🚀 Starting SSH server...")
        sandbox.exec("/usr/sbin/sshd", "-D", "-e")

    tunnel = sandbox.tunnels()[22]

    print(f"🏖️  Sandbox ID: {sandbox.object_id}")
    print(f"🏖️  Tunnel URL: {tunnel.url}")
    print(f"🏖️  Tunnel Host: {tunnel.host}")
    print(f"🏖️  Tunnel Port: {tunnel.port}")
    print(f"🔑 SSH Connection: ssh root@{tunnel.host} -p {tunnel.port}")
    print(f"🔑 Password: modal123")


@app.function(image=harmonize_worker_image, secrets=[modal.Secret.from_dotenv(".env")])
def harmonize_worker():
    print("Hello, world!")
