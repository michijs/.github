function normalizeCommands(input) {
  // Normalize to array of {name, script}
  if (typeof input === "string") {
    if (input === '')
      throw 'Script is empty'
      return [{ name: input, script: input }];
  } else
    return input;
}

export default async ({ require, params }) => {
  const { spawn } = require("child_process");

  async function runCommand(script) {
    return new Promise((resolve, reject) => {
      const child = spawn("bun", ["run", script], { stdio: ["ignore", "pipe", "pipe"] });
      let result = ''

      child.stdout.on("data", (data) => {
        result += data.toString().trimEnd();
      });

      child.stderr.on("data", (data) => {
        result += data.toString().trimEnd();
      });

      child.on("close", (code) => {
        code === 0 ? resolve(result) : reject(result);
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
          const result = await runCommand(script);
          console.log(`::group::✅ ${name}`);
          console.log(result);
          console.log(`::endgroup::`);
        } catch (err) {
          console.log(`::group::⛔ ${name}`);
          console.log(`⛔ ${name}`);
          error = err;
          console.log(`::error::${err}`);
          console.log(`::endgroup::`);
          throw err;
        }
      })
    );
    if (error)
      throw `${result.filter(x => x.reason).length} errors found`;
  } catch (error) {
    throw error;
  }
}
