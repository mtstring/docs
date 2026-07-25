import { spawn } from 'node:child_process';
import path from 'node:path';

/**
 * dist を vite preview で配信する。p0-check と make-thumbnails の共通処理。
 *
 * npx を挟むと孫プロセスの vite に SIGTERM が伝わらず、
 * パイプが開いたままで Node が終了できなくなる。
 * ローカルの実行ファイルを直接叩き、独立プロセスグループごと落とす。
 */
export async function startPreview(port, cwd = process.cwd()) {
  const bin = path.join(cwd, 'node_modules', '.bin', 'vite');
  const server = spawn(bin, ['preview', '--port', String(port), '--strictPort'], {
    cwd,
    stdio: 'pipe',
    detached: true,
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('preview起動タイムアウト')), 20000);
    const settle = (fn, arg) => {
      clearTimeout(timer);
      fn(arg);
    };
    server.stdout.on('data', (d) => d.toString().includes('http') && settle(resolve));
    server.stderr.on('data', (d) => process.stderr.write(d));
    server.on('error', (e) => settle(reject, e));
    server.on('exit', (code) =>
      settle(reject, new Error(`preview が終了しました (code=${code})。ポート${port}が使用中かも`)),
    );
  });

  return {
    url: `http://localhost:${port}/`,
    stop: () => {
      server.stdout.destroy();
      server.stderr.destroy();
      try {
        process.kill(-server.pid, 'SIGTERM'); // プロセスグループごと
      } catch {
        server.kill('SIGTERM');
      }
    },
  };
}

/** Chromium 起動オプション(WebGLはSwiftShaderでソフトウェア描画) */
export const CHROMIUM_LAUNCH = {
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
};
