export function createPtyEnvironment(
  environment: NodeJS.ProcessEnv,
): Record<string, string> {
  const sanitized: Record<string, string> = {}
  for (const [name, value] of Object.entries(environment)) {
    if (value !== undefined) sanitized[name] = value
  }
  return sanitized
}
