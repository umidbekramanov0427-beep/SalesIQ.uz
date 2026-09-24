// A minimal in-memory visited-pathname stack, recorded from AppShell on
// every navigation. Browsers don't expose the actual History API entries
// (privacy), so this is the only way to know what page a user genuinely
// came from -- which is what lets AdminBackLink point back to e.g.
// Funnels instead of always assuming /admin.
const stack: string[] = [];

export function recordVisit(pathname: string): void {
  if (stack[stack.length - 1] === pathname) return;
  stack.push(pathname);
  if (stack.length > 30) stack.shift();
}

export function getPreviousPath(): string | undefined {
  return stack.length >= 2 ? stack[stack.length - 2] : undefined;
}
