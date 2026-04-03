function wildcardMatch(text, pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i').test(text);
}

console.log(wildcardMatch('/etc/passwd', '/etc/*'));
