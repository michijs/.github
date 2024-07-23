

<!-- TODO: Use bash code for commands -->
Using private michijs packages
Setting up environmnent

For linux Bash Shell (~/.bashrc or ~/.bash_profile)
echo 'export GITHUB_TOKEN=your_github_token' >> ~/.bashrc
source ~/.bashrc

For MacOS - Zsh Shell (~/.zshrc):
echo 'export GITHUB_TOKEN=your_github_token' >> ~/.zshrc
source ~/.zshrc

For Windows (Command Prompt):
Set the environment variable permanently using the setx command:
setx GITHUB_TOKEN "your_github_token"

For Windows (PowerShell):
[System.Environment]::SetEnvironmentVariable('GITHUB_TOKEN', 'your_github_token', [System.EnvironmentVariableTarget]::User)
