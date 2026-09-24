# Security Policy

Relook opens people's private chat exports, so security reports are taken seriously.

## Reporting a vulnerability

**Please don't open a public issue.** Instead, use GitHub's private reporting:
**Security → Report a vulnerability** on this repository, or email **joelercoaster2014@gmail.com**.

Please include what you found, how to reproduce it, and what an attacker could do with it. You'll get a reply as soon as practical. Once a fix is released you'll be credited, unless you'd rather not be.

## What's in scope

Especially interested in anything that lets:

- a **web page opened in the viewer pane** read export files, reach the app's internal bridge, or access the local disk
- the app serve files **outside the chosen export folder**
- a crafted export (for example, malicious HTML in a message) run script in Relook's own pages
- Relook send export contents anywhere over the network

## Supported versions

Security fixes go into the latest release. Please update before reporting.
