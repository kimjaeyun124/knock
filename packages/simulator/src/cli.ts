import { runCli } from './cli-core'

const code = await runCli(process.argv.slice(2), process.env, {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
})
process.exit(code)
