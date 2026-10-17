export const socket = {
  on: (event: string, callback: (...args: any[]) => void) => {},
  off: (event: string) => {},
  emit: (event: string, ...args: any[]) => {},
};
