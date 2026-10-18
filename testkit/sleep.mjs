// A guard that hangs.
setTimeout(() => process.exit(0), Number(process.argv[3] || 2000));
