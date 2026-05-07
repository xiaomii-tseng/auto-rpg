// 4-digit game code → Colyseus roomId
export const codeMap = new Map<string, string>();

export function generateCode(): string {
  let code: string;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
  } while (codeMap.has(code));
  return code;
}
