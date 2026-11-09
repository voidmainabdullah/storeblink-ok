import { runStoreblinkCli } from "./storeblink.mjs";

const code = await runStoreblinkCli(["theme", "create", ...process.argv.slice(2)]);
process.exitCode = code;
