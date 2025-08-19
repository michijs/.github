function normalizeCommands(input) {
  // Normalize to array of {name, script}
  if (typeof input === "string")
    return [{ name: `bun run ${input}`, script: input }];
  else
    return input;
}

export default async ({ require, core, params }) => {
  const { spawn } = require("child_process");

  async function runCommand(script) {
    return new Promise((resolve, reject) => {
      const child = spawn("bun", ["run", script], { stdio: ["ignore", "pipe", "pipe"] });
      let result = ''

      child.stdout.on("data", (data) => {
        result+= data.toString().trimEnd();
      });

      child.stderr.on("data", (data) => {
        result+= data.toString().trimEnd();
      });

      child.on("close", (code) => {
        code === 0 ? resolve(result): reject(result);
      });
    });
  }
  try {
    const commands = normalizeCommands(params.command);
    let error;
    // Run all commands in parallel
    const result = await Promise.allSettled(
      commands.map(async ({ name, script }) => {
        try {
          const result = await runCommand(script, {
            maxBuffer: 10 * 1024 * 1024,
          });
          core.startGroup(`▶️ ${name}`);
          core.info(result);
          core.endGroup();
        } catch (err) {
          core.startGroup(`⛔ ${name}`);
          error = err;
          core.error(err);
          core.endGroup();
          throw err;
        }
      })
    );
    if (error)
      core.setFailed(`${result.filter(x => x.reason).length} errors found`);
  } catch (error) {
    core.setFailed(error);
  }
}
