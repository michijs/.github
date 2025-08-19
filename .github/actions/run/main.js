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
    const commands = normalizeCommands(params.command);
    let error;
    // Run all commands in parallel
    await Promise.allSettled(
      commands.map(async ({ name, script }) => {
        try {
          const { stdout, stderr, ...test } = await execAsync(`bun run ${script}`, {
            maxBuffer: 10 * 1024 * 1024,
          });
          console.log({ stderr, stdout, test })
          core.startGroup(`▶️ ${name}`);
          core.info(stdout ?? stderr);
          core.endGroup();
        } catch (err) {
          core.startGroup(`⛔ ${name}`);
          error = err;
          if (err.stderr) core.error(err.stderr);
          core.error(err);
          core.endGroup();
          throw err;
        }
      })
    );
    if (error)
      core.setFailed(error);
  } catch (error) {
    core.setFailed(error);
  }
}
