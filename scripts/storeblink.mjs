#!/usr/bin/env node
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  STOREBLINK_THEME_COMMANDS,
  buildTheme,
  checkTheme,
  createTheme,
  devTheme,
  packTheme,
  runThemeTests,
} from "./theme-sdk-lib.mjs";

const usage = `StoreBlink Theme SDK

Usage:
  storeblink theme create <id> [--name="Theme Name"] [--themes-root=<path>]
  storeblink theme check  <id-or-path>
  storeblink theme dev    <id-or-path> [--port=4175] [--once]
  storeblink theme build  <id-or-path>
  storeblink theme test   <id-or-path>
  storeblink theme pack   <id-or-path>

Theme packages are declarative by default. Compiled React is platform-only.`;

export const parseCliArguments = (argumentsList) => {
  const positional = [];
  const flags = {};
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (!argument.startsWith("--")) {
      positional.push(argument);
      continue;
    }
    const body = argument.slice(2);
    const separator = body.indexOf("=");
    if (separator >= 0) {
      flags[body.slice(0, separator)] = body.slice(separator + 1);
      continue;
    }
    const next = argumentsList[index + 1];
    if (next && !next.startsWith("--")) {
      flags[body] = next;
      index += 1;
    } else {
      flags[body] = true;
    }
  }
  return { positional, flags };
};

const resolveThemeRoot = (theme, themesRoot) => {
  if (!theme) throw new Error("Theme id or directory is required.");
  if (path.isAbsolute(theme) || theme.includes("/") || theme.includes("\\")) {
    return path.resolve(theme);
  }
  return path.resolve(themesRoot, theme);
};

export const runStoreblinkCli = async (
  argumentsList,
  io = { log: console.log, error: console.error },
) => {
  const { positional, flags } = parseCliArguments(argumentsList);
  if (flags.help || flags.h || positional[0] !== "theme") {
    io.log(usage);
    return flags.help || flags.h ? 0 : 1;
  }
  const command = positional[1];
  if (!STOREBLINK_THEME_COMMANDS.includes(command)) {
    io.error(`Unknown theme command ${String(command)}.\n\n${usage}`);
    return 1;
  }
  const themesRoot = path.resolve(String(flags["themes-root"] ?? path.join(process.cwd(), "src", "themes")));
  const target = positional[2] ?? flags.id;
  try {
    if (command === "create") {
      if (!target) throw new Error("Theme id is required.");
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(target))) {
        throw new Error("Theme id must use lowercase kebab-case.");
      }
      const destination = path.resolve(themesRoot, String(target));
      if (flags["dry-run"]) {
        io.log(`Theme scaffold is valid: ${destination}`);
        return 0;
      }
      const root = await createTheme({
        id: String(target),
        name: typeof flags.name === "string" ? flags.name : undefined,
        themesRoot,
      });
      await buildTheme(root);
      io.log(`Created installable eight-route Theme SDK package at ${root}.`);
      return 0;
    }
    const root = resolveThemeRoot(String(target ?? ""), themesRoot);
    if (command === "check") {
      await checkTheme(root);
      io.log(`Theme check passed: ${root}`);
    } else if (command === "dev") {
      const port = flags.port === undefined ? 4175 : Number(flags.port);
      if (!Number.isInteger(port) || port < 1 || port > 65_535) {
        throw new Error("Theme preview port must be an integer between 1 and 65535.");
      }
      await devTheme(root, { once: Boolean(flags.once), log: io.log, port });
    } else if (command === "build") {
      const result = await buildTheme(root);
      io.log(`Theme build completed: ${result.buildManifest.packageHash}`);
    } else if (command === "test") {
      await runThemeTests(root);
      io.log("Theme tests passed.");
    } else if (command === "pack") {
      const result = await packTheme(root);
      io.log(`Theme pack created: ${result.destination}\n${result.packageHash}`);
    }
    return 0;
  } catch (error) {
    io.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
};

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const code = await runStoreblinkCli(process.argv.slice(2));
  process.exitCode = code;
}
