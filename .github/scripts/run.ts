import { $ } from "bun";
import type { Command, Params } from "./types";

function normalizeCommands(command: Params['command']): Command[] {
  // Normalize to array of {name, script}
  if (typeof command === "string") {
    if (command === '')
      throw 'Script is empty'
      return [{ name: command, script: command }];
  } else
    return command;
}

export default async ({ params }: {params: Params}) => {
  try {
    const commands = normalizeCommands(params.command);
    let error;
    // Run all commands in parallel
    const result = await Promise.allSettled(
      commands.map(async ({ name, script }) => {
        try {
          const result = await $`bun run ${script}`;
          console.log(`::group::✅ ${name}`);
          console.log(result.text());
          console.log(`::endgroup::`);
        } catch (err) {
          console.log(`::group::⛔ ${name}`);
          error = err;
          console.log(`::error::${err}`);
          console.log(`::endgroup::`);
          throw err;
        }
      })
    );
    if (error)
      throw `${result.filter(x => x.status === 'rejected').length} errors found`;
  } catch (error) {
    throw error;
  }
}
