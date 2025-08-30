import { $ } from "bun";
import type { Command, RunParams, WorkflowParams } from "./types";

function normalizeCommands(command: RunParams['command']): Command[] {
  // Normalize to array of {name, script}
  if (typeof command === "string") {
    if (command === '')
      throw 'Script is empty'
    return [{ name: command, script: command }];
  } else
    return command;
}

export default async function run({ params, runGroup }: WorkflowParams<RunParams>) {
  try {
    const commands = normalizeCommands(params.command);
    let error;
    // Run all commands in parallel
    const result = await Promise.allSettled(
      commands.map(async ({ name, script }) => {
        runGroup(name, async () => {
          try {
            const result = await $`bun run ${script}`;
            return result.text()
          } catch (err) {
            error = err;
            throw err;
          }
        })
      })
    );
    if (error)
      throw `${result.filter(x => x.status === 'rejected').length} errors found`;
  } catch (error) {
    throw error;
  }
}
