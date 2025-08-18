function normalizeCommands(input) {
  // Normalize to array of {name, script}
  if (typeof input === "string")
    return [{ name: `bun run ${input}`, script: input }];
  else
    return input;
}

export default async ({ require, core, params }) => {
  const { exec } = require('child_process');
  const util = require('util');
  const execAsync = util.promisify(exec);
  try {
    const commands = normalizeCommands(params.command)
    // Run all commands in parallel
    const results = await Promise.allSettled(
      commands.map(async ({ name, script }) => {
        core.startGroup(`▶️ ${name}`);
        try {
          const { stdout, stderr } = await execAsync(`bun run ${script}`, {
            maxBuffer: 10 * 1024 * 1024,
          });
          core.info(stdout ?? stderr);
          core.endGroup();
          return { script, success: true };
        } catch (err) {
          core.endGroup();
          throw new Error(`❌ ${name} failed: ${err.stderr || err.message}`);
        }
      })
    );

    // If any failed, mark action failed
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      for (const f of failed) {
        core.error(f.reason);
      }
      core.setFailed(`${failed.length} command(s) failed`);
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}
