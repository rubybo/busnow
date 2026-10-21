const mode = process.argv[2];
if (!mode) {
  console.error("Использование: node deploy/run-ftp.mjs <front|api|release>");
  process.exit(1);
}
process.env.FTP_MODE = mode;
await import("./ftp-upload.mjs");
