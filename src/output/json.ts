export interface CommandOutput {
  command: string;
  workDir: string;
  language: string;
  query?: string;
  results: unknown;
  meta: {
    duration_ms: number;
    serverName?: string;
  };
}

export function outputJson(data: CommandOutput): void {
  console.log(JSON.stringify(data, null, 2));
}
