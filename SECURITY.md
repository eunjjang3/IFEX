# Security Policy

## Supported versions

Until IFEX publishes versioned releases, security fixes are made only on the latest commit of the `main` branch. Older commits, forks, and modified deployments are not supported by this policy.

## Reporting a vulnerability

Please use the repository's **Security → Report a vulnerability** form to submit a private report. Do not open a public issue with vulnerability details, proof-of-concept code, sensitive data, or a malicious image.

If the private reporting button is unavailable, open a public issue that contains no vulnerability details and asks the maintainer to establish a private contact channel. Do not attach the affected file.

Include as much of the following as possible in the private report:

- The affected commit, browser or Electron version, operating system, and deployment method.
- The security boundary that can be bypassed and the resulting impact.
- Minimal reproduction steps and whether special configuration is required.
- A harmless reproducer when one can demonstrate the issue safely.
- Any suggested mitigation or patch, if available.

Potentially malicious samples should be shared only after the maintainer provides an approved private transfer method. Remove unrelated personal data and metadata before sharing.

## Scope

Examples of security issues in scope include arbitrary code execution, Electron sandbox or Worker-boundary escapes, unintended network transmission of analyzed files, denial of service that bypasses documented limits, and bypasses of strict file-type or safe-preview controls.

Incorrect or inconclusive forensic interpretation is generally a product-quality issue rather than a security vulnerability unless it also bypasses a documented security boundary. IFEX does not provide an antivirus verdict and cannot establish that a file is harmless.

## Disclosure

Please allow time for the report to be reproduced, fixed, and distributed before public disclosure. The maintainer will coordinate disclosure and credit with the reporter where practical. Reports are handled on a best-effort basis and do not have a guaranteed response or remediation deadline.
