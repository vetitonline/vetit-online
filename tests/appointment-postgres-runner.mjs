import { execFile } from 'node:child_process';

/** SQL goes through stdin, never the Windows command line. No shell is used. */
export function executePostgresSql(source, { connection, executable = 'psql', execFileImpl = execFile }) {
  return new Promise((resolve, reject) => {
    const child = execFileImpl(executable,
      ['-X','-q','-t','-A','-w','-v','ON_ERROR_STOP=1','-d',connection,'-f','-'],
      { maxBuffer: 4 * 1024 * 1024, timeout: 120000 },
      (error, stdout) => error ? reject(error) : resolve(stdout.trim()));
    // Consume pipe failures, including early process exit, without crashing Node.
    child.stdin.on('error', reject);
    child.stdin.end(source, 'utf8');
  });
}
